import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  Bug,
  FileBarChart,
  LayoutDashboard,
  Loader2,
  LogOut,
  Pause,
  Play,
  Plus,
  Settings as SettingsIcon,
  Shield,
  Users,
} from "lucide-react";
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
  SidebarFooter,
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
import Auth, { type AuthUser } from "./pages/Auth";
import Evaluations from "./pages/Evaluations";
import { FieldSelect } from "./components/field-select";
import { ToneBadge } from "./components/status";
import { useStore } from "./store";
import { api } from "./api/client";
import AssistantDock from "./components/AssistantDock";
import { getSessionUser, signOut } from "./auth";

const NAV = [
  { name: "Overview", to: "/", icon: LayoutDashboard },
  { name: "Findings", to: "/findings", icon: Bug },
  { name: "Agents", to: "/agents", icon: Users },
  { name: "Reports", to: "/reports", icon: FileBarChart },
  { name: "Profile", to: "/profile", icon: Users },
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
  { endpoint: "/rest/products/search", label: "Reflected XSS (status-only evidence)" },
  { endpoint: "/rest/user/login", label: "SQL injection login check (no response stored)" },
  { endpoint: "/ftp/acquisitions.md", label: "Confidential document exposure" },
  { endpoint: "/ftp/package.json.bak", label: "Forgotten developer backup" },
];

function Nav() {
  const location = useLocation();
  return (
    <SidebarMenu>
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton
              isActive={location.pathname === item.to}
              tooltip={item.name}
              render={<Link to={item.to} aria-label={item.name} />}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span>{item.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export default function App() {
  const { mode, scan, scanId, loadMode, loadSettings, startScan, control, reset } = useStore();
  const [newOpen, setNewOpen] = useState(false);
  const [haltOpen, setHaltOpen] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [form, setForm] = useState({
    lab: "guardloop" as "guardloop" | "juice_shop",
    target: "http://127.0.0.1:5001",
    probe_budget: 60,
    seed: 42,
    authorization: false,
    allowed_endpoints: GUARDLOOP_PROBES.map((probe) => probe.endpoint),
  });
  const labProbes = form.lab === "juice_shop" ? JUICE_SHOP_PROBES : GUARDLOOP_PROBES;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sessionUser = await getSessionUser();
        if (!sessionUser) {
          if (!cancelled) setUser(null);
          return;
        }
        const me = await api<{ user: AuthUser | null }>("/api/auth/me").catch(() => ({ user: sessionUser }));
        if (!cancelled) setUser(me.user ?? sessionUser);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadMode().catch(() => {});
    void loadSettings().catch(() => {});
  }, [user, loadMode, loadSettings]);

  async function handleSignOut() {
    reset();
    await signOut();
    setUser(null);
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }
  if (!user) return <Auth onAuthenticated={setUser} />;

  const status = scan?.status || "Idle";
  const pillTone =
    status === "Running"
      ? "critical"
      : status === "Completed"
        ? "success"
        : status === "Halted"
          ? "critical"
          : status === "Paused"
            ? "warning"
            : "neutral";

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1">
              <Shield size={18} className="shrink-0 text-primary" strokeWidth={1.6} />
              <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">GuardLoop</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <Nav />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border p-2">
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {user.email.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground group-data-[collapsible=icon]:hidden">{user.email}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={() => void handleSignOut()} className="group-data-[collapsible=icon]:hidden">
                <LogOut size={15} />
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="bg-background">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
            <SidebarTrigger aria-label="Toggle navigation" />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="mono text-xs text-muted-foreground">acme-chatbot-api</span>
              <ToneBadge tone={pillTone}>
                {status === "Running" && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-red-400" />}
                {status}
              </ToneBadge>
              <ToneBadge tone="info">{mode === "live" ? "Live agents" : "Mock mode"}</ToneBadge>
            </div>
            <span className="flex-1" />
            <div className="flex items-center gap-2">
              <div className="hidden md:block">
                <FieldSelect
                  label="Speed"
                  value={speed}
                  onChange={(value) => {
                    setSpeed(value);
                    if (scanId) {
                      void api(`/api/scans/${scanId}/speed`, { method: "POST", body: JSON.stringify({ speed: Number(value) }) }).catch((error: Error) => toast.error(error.message));
                    }
                  }}
                  options={["0.5", "1", "2", "4"]}
                />
              </div>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus />
                <span className="hidden sm:inline">Start</span>
              </Button>
              {status === "Paused" ? (
                <Button variant="outline" size="sm" onClick={() => void control("resume").catch((error: Error) => toast.error(error.message))}>
                  <Play />
                  <span className="hidden sm:inline">Resume</span>
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void control("pause").catch((error: Error) => toast.error(error.message))}>
                  <Pause />
                  <span className="hidden sm:inline">Pause</span>
                </Button>
              )}
              <Button variant="destructive" size="sm" aria-label="Kill switch" onClick={() => setHaltOpen(true)}>
                Kill switch
              </Button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 lg:pr-[380px]">
            {status === "Halted" && (
              <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                <span className="text-sm text-destructive">Kill switch engaged. No further events will be emitted.</span>
                <span className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewOpen(true);
                    toast("Start a new scan to reset the run");
                  }}
                >
                  Reset
                </Button>
              </div>
            )}
            <Routes>
              <Route path="/" element={<Overview onNew={() => setNewOpen(true)} />} />
              <Route path="/findings" element={<Findings />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/profile" element={<Evaluations />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>

            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>New scan</DialogTitle>
                  <DialogDescription>Choose a local training lab. Targets are restricted to loopback and the lab's fixed port.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <FieldSelect
                    label="Local lab"
                    value={form.lab}
                    onChange={(value) => {
                      const lab = value === "juice_shop" ? "juice_shop" : "guardloop";
                      const probes = lab === "juice_shop" ? JUICE_SHOP_PROBES : GUARDLOOP_PROBES;
                      setForm({
                        ...form,
                        lab,
                        target: lab === "juice_shop" ? "http://127.0.0.1:3000" : "http://127.0.0.1:5001",
                        allowed_endpoints: probes.map((probe) => probe.endpoint),
                      });
                    }}
                    options={[
                      { value: "guardloop", label: "GuardLoop bundled lab" },
                      { value: "juice_shop", label: "OWASP Juice Shop (local Docker)" },
                    ]}
                  />

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="scan-target">Target</Label>
                    <Input id="scan-target" className="mono" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} />
                  </div>

                  <fieldset className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
                    <legend className="px-1 text-xs font-medium text-muted-foreground">Local lab probes</legend>
                    {labProbes.map((probe) => (
                      <Label key={probe.endpoint} className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                        <Checkbox
                          checked={form.allowed_endpoints.includes(probe.endpoint)}
                          onCheckedChange={(checked) =>
                            setForm({
                              ...form,
                              allowed_endpoints:
                                checked === true
                                  ? [...form.allowed_endpoints, probe.endpoint]
                                  : form.allowed_endpoints.filter((endpoint) => endpoint !== probe.endpoint),
                            })
                          }
                        />
                        <span className="text-foreground">{probe.label}</span>
                        <span className="mono ml-auto hidden text-[11px] text-muted-foreground sm:inline">{probe.endpoint}</span>
                      </Label>
                    ))}
                  </fieldset>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="scan-budget">Probe budget</Label>
                      <Input id="scan-budget" type="number" value={form.probe_budget} onChange={(event) => setForm({ ...form, probe_budget: Number(event.target.value) })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="scan-seed">Seed</Label>
                      <Input id="scan-seed" type="number" value={form.seed} onChange={(event) => setForm({ ...form, seed: Number(event.target.value) })} />
                    </div>
                  </div>

                  <Label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm font-normal text-muted-foreground">
                    <Checkbox checked={form.authorization} onCheckedChange={(value) => setForm({ ...form, authorization: value === true })} className="mt-0.5" />
                    <span>I am authorized to test this local demo target.</span>
                  </Label>

                  <Button
                    className="w-full"
                    disabled={!form.authorization || form.allowed_endpoints.length === 0}
                    onClick={() => {
                      void startScan({ ...form })
                        .then(() => {
                          setNewOpen(false);
                          toast.success("Scan started");
                        })
                        .catch((error: Error) => toast.error(error.message));
                    }}
                  >
                    Start scan
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <AlertDialog open={haltOpen} onOpenChange={setHaltOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Engage kill switch?</AlertDialogTitle>
                  <AlertDialogDescription>This aborts in-flight LLM and target requests immediately and emits no further events.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      void control("halt")
                        .then(() => toast.error("Scan halted"))
                        .catch((error: Error) => toast.error(error.message));
                    }}
                  >
                    Confirm halt
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <p className="mt-10 text-xs text-muted-foreground">Local only · loopback targets · read-only evidence</p>
          </main>
        </SidebarInset>
        <AssistantDock />
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
