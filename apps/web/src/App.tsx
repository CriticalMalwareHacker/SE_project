import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Shield, Zap, CheckCircle2, RefreshCw, FileText, LayoutDashboard, Bug, Users, FileBarChart, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Overview from "./pages/Overview";
import Findings from "./pages/Findings";
import Agents from "./pages/Agents";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import { FieldSelect } from "./components/field-select";
import { ToneBadge } from "./components/status";
import { useStore } from "./store";
import { api } from "./api/client";
import AssistantDock from "./components/AssistantDock";

const NAV = [
  { name: "Overview", to: "/", icon: LayoutDashboard },
  { name: "Findings", to: "/findings", icon: Bug },
  { name: "Agents", to: "/agents", icon: Users },
  { name: "Reports", to: "/reports", icon: FileBarChart },
  { name: "Settings", to: "/settings", icon: SettingsIcon },
];

const GUARDLOOP_PROBES = [
  { endpoint: "/v1/chat/completions", label: "Prompt injection and system prompt" },
  { endpoint: "/v1/admin/view", label: "Unescaped output in admin view" },
  { endpoint: "/v1/tools/fetch", label: "Local metadata fetch boundary" },
  { endpoint: "/v1/threads/2", label: "Cross-tenant thread access" },
  { endpoint: "/v1/rate-test", label: "Rate-limit header handling" },
];

const JUICE_SHOP_PROBES = [
  { endpoint: "/rest/products/search", label: "Read-only public product search" },
  { endpoint: "/rest/user/whoami", label: "Check unauthenticated identity response (data omitted)" },
];

function Nav() {
  const loc = useLocation();
  return (
    <SidebarMenu>
      {NAV.map((n) => {
        const I = n.icon;
        return (
          <SidebarMenuItem key={n.name}>
            <SidebarMenuButton
              isActive={loc.pathname === n.to}
              tooltip={n.name}
              render={<Link to={n.to} aria-label={n.name} />}
            >
              <I size={20} strokeWidth={1.5} />
              <span>{n.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export default function App() {
  const { mode, scan, scanId, loadMode, loadSettings, startScan, control } = useStore();
  const [newOpen, setNewOpen] = useState(false);
  const [haltOpen, setHaltOpen] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [form, setForm] = useState({ lab: "guardloop" as "guardloop" | "juice_shop", target: "http://127.0.0.1:5001", probe_budget: 60, seed: 42, authorization: false, allowed_endpoints: GUARDLOOP_PROBES.map((probe) => probe.endpoint) });
  const labProbes = form.lab === "juice_shop" ? JUICE_SHOP_PROBES : GUARDLOOP_PROBES;

  useEffect(() => {
    void loadMode();
    void loadSettings();
  }, [loadMode, loadSettings]);

  const status = scan?.status || "Idle";
  const pillTone = (status === "Running" ? "critical" : status === "Completed" ? "success" : status === "Halted" ? "critical" : status === "Paused" ? "warning" : "neutral") as "info" | "neutral" | "success" | "warning" | "critical";

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1">
              <Shield size={20} className="shrink-0 text-teal-400" strokeWidth={1.5} />
              <span className="text-lg font-semibold text-slate-50 group-data-[collapsible=icon]:hidden">GuardLoop</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <Nav />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-0 px-6 py-6 md:px-8 lg:pr-[390px]">
            <header className="mb-6 flex flex-wrap items-center gap-2">
              <SidebarTrigger aria-label="Toggle navigation" />
              <span className="mono text-sm text-slate-400">acme-chatbot-api</span>
              <ToneBadge tone={pillTone}>
                {status === "Running" && <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-red-400" />}
                {status}
              </ToneBadge>
              <ToneBadge tone="info">{mode === "live" ? "Live agents" : "Mock mode"}</ToneBadge>
              <span className="flex-1" />
              <FieldSelect label="Speed" value={speed} onChange={(v) => { setSpeed(v); if (scanId) void api(`/api/scans/${scanId}/speed`, { method: "POST", body: JSON.stringify({ speed: Number(v) }) }); }} options={["0.5", "1", "2", "4"]} />
              <Button variant="outline" onClick={() => setNewOpen(true)}>Start</Button>
              {status === "Paused" ? <Button variant="outline" onClick={() => void control("resume")}>Resume</Button> : <Button variant="outline" onClick={() => void control("pause")}>Pause</Button>}
              <Button variant="destructive" aria-label="Kill switch" onClick={() => setHaltOpen(true)}>Kill Switch</Button>
            </header>
            <p className="mono mb-4 text-xs text-slate-500">acme-chatbot-api · local only</p>
            {status === "Halted" && (
              <div role="alert" className="mb-4 flex items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
                <span className="text-sm text-red-400">Halted — kill switch engaged. No further events will be emitted.</span>
                <span className="flex-1" />
                <Button variant="outline" onClick={() => { setNewOpen(true); toast("Reset: start a new scan"); }}>Reset</Button>
              </div>
            )}
            <Routes>
              <Route path="/" element={<Overview onNew={() => setNewOpen(true)} />} />
              <Route path="/findings" element={<Findings />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogContent aria-label="New Scan">
                <DialogHeader>
                  <DialogTitle>New Scan</DialogTitle>
                  <DialogDescription>Choose a local training lab. Targets are restricted to loopback and the lab’s fixed port.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  <FieldSelect label="Local lab" value={form.lab} onChange={(value) => {
                    const lab = value === "juice_shop" ? "juice_shop" : "guardloop";
                    const probes = lab === "juice_shop" ? JUICE_SHOP_PROBES : GUARDLOOP_PROBES;
                    setForm({ ...form, lab, target: lab === "juice_shop" ? "http://127.0.0.1:3000" : "http://127.0.0.1:5001", allowed_endpoints: probes.map((probe) => probe.endpoint) });
                  }} options={[{ value: "guardloop", label: "GuardLoop bundled lab" }, { value: "juice_shop", label: "OWASP Juice Shop (local Docker)" }]} />
                  <Label>Target<Input className="mono mt-1" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></Label>
                  <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-800 p-3">
                    <legend className="px-1 text-sm font-medium text-slate-200">Local lab probes</legend>
                    {labProbes.map((probe) => (
                      <Label key={probe.endpoint} className="flex items-center gap-2 text-sm text-slate-300">
                        <Checkbox checked={form.allowed_endpoints.includes(probe.endpoint)} onCheckedChange={(checked) => setForm({ ...form, allowed_endpoints: checked === true ? [...form.allowed_endpoints, probe.endpoint] : form.allowed_endpoints.filter((endpoint) => endpoint !== probe.endpoint) })} />
                        <span>{probe.label}</span>
                        <span className="mono ml-auto text-xs text-slate-500">{probe.endpoint}</span>
                      </Label>
                    ))}
                  </fieldset>
                  <Label>Probe budget<Input type="number" value={form.probe_budget} onChange={(e) => setForm({ ...form, probe_budget: Number(e.target.value) })} /></Label>
                  <Label>Seed<Input type="number" value={form.seed} onChange={(e) => setForm({ ...form, seed: Number(e.target.value) })} /></Label>
                  <Label className="flex items-center gap-2 text-sm text-slate-200">
                    <Checkbox checked={form.authorization} onCheckedChange={(v) => setForm({ ...form, authorization: v === true })} />
                    I am authorized to test this local demo target
                  </Label>
                  <Button disabled={!form.authorization || form.allowed_endpoints.length === 0} onClick={() => { void startScan({ ...form, allowed_endpoints: form.allowed_endpoints }).then(() => { setNewOpen(false); toast.success("Scan started"); }).catch((error: Error) => toast.error(error.message)); }}>
                    Start scan
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <AlertDialog open={haltOpen} onOpenChange={setHaltOpen}>
              <AlertDialogContent aria-label="Engage kill switch?">
                <AlertDialogHeader>
                  <AlertDialogTitle>Engage kill switch?</AlertDialogTitle>
                  <AlertDialogDescription>This aborts in-flight LLM and target requests immediately and emits no further events.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { void control("halt").then(() => toast.error("Scan halted")); }}>Confirm halt</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <footer className="mt-10 flex gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><Shield size={16} /> Guard</span>
              <span className="inline-flex items-center gap-1"><Zap size={16} /> Attack</span>
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={16} /> Verify</span>
              <span className="inline-flex items-center gap-1"><RefreshCw size={16} /> Confirm</span>
              <span className="inline-flex items-center gap-1"><FileText size={16} /> Report</span>
            </footer>
          </div>
        </SidebarInset>
        <AssistantDock />
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
