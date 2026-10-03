import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { Shield, Zap, CheckCircle2, RefreshCw, FileText, LayoutDashboard, Bug, Users, FileBarChart, Settings as SettingsIcon } from "lucide-react";
import { AlertDialog, Badge, Button, Dialog, Checkbox, Input, Label, Select, toast } from "./components/ui";
import Overview from "./pages/Overview";
import Findings from "./pages/Findings";
import Agents from "./pages/Agents";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import { useStore } from "./store";
import { api } from "./api/client";

const ICONS = { Overview: LayoutDashboard, Findings: Bug, Agents: Users, Reports: FileBarChart, Settings: SettingsIcon };

export default function App() {
  const { mode, scan, scanId, loadMode, loadSettings, startScan, control } = useStore();
  const [newOpen, setNewOpen] = useState(false);
  const [haltOpen, setHaltOpen] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [form, setForm] = useState({ target: "http://127.0.0.1:5001", probe_budget: 60, seed: 42, authorization: false });

  useEffect(() => {
    void loadMode();
    void loadSettings();
  }, [loadMode, loadSettings]);

  const status = scan?.status || "Idle";
  const pillTone = status === "Running" ? "critical" : status === "Completed" ? "success" : status === "Halted" ? "critical" : status === "Paused" ? "warning" : "neutral";

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] gap-6 px-6 py-6 md:px-8">
      <aside className="hidden w-52 shrink-0 md:block">
        <div className="mb-6 flex items-center gap-2">
          <Shield size={20} className="text-teal-400" strokeWidth={1.5} />
          <span className="text-lg font-semibold text-slate-50">GuardLoop</span>
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {(["Overview", "Findings", "Agents", "Reports", "Settings"] as const).map((n) => {
            const I = ICONS[n];
            return (
              <NavLink key={n} to={n === "Overview" ? "/" : `/${n.toLowerCase()}`} className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? "bg-slate-800 text-teal-400" : "text-slate-300 hover:bg-slate-800"}`}>
                <I size={20} strokeWidth={1.5} /> {n}
              </NavLink>
            );
          })}
        </nav>
        <p className="mono mt-8 text-xs text-slate-500">acme-chatbot-api · local only</p>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="mb-6 flex flex-wrap items-center gap-2">
          <span className="mono text-sm text-slate-400">acme-chatbot-api</span>
          <Badge tone={pillTone}>
            {status === "Running" && <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-red-400" />}
            {status}
          </Badge>
          <Badge tone="info">{mode === "live" ? "Live agents" : "Mock mode"}</Badge>
          <span className="flex-1" />
          <Select label="Speed" value={speed} onChange={(v) => { setSpeed(v); if (scanId) void api(`/api/scans/${scanId}/speed`, { method: "POST", body: JSON.stringify({ speed: Number(v) }) }); }} options={["0.5", "1", "2", "4"]} />
          <Button variant="outline" onClick={() => setNewOpen(true)}>Start</Button>
          {status === "Paused" ? <Button variant="outline" onClick={() => void control("resume")}>Resume</Button> : <Button variant="outline" onClick={() => void control("pause")}>Pause</Button>}
          <Button variant="destructive" aria-label="Kill switch" onClick={() => setHaltOpen(true)}>Kill Switch</Button>
        </header>
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
        <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="New Scan">
          <div className="flex flex-col gap-3">
            <Label>Target<input className="mono mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></Label>
            <Label>Probe budget<Input type="number" value={form.probe_budget} onChange={(e) => setForm({ ...form, probe_budget: Number(e.target.value) })} /></Label>
            <Label>Seed<Input type="number" value={form.seed} onChange={(e) => setForm({ ...form, seed: Number(e.target.value) })} /></Label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <Checkbox checked={form.authorization} onChange={(e) => setForm({ ...form, authorization: e.target.checked })} />
              I am authorized to test this local demo target
            </label>
            <Button disabled={!form.authorization} onClick={() => { void startScan({ target: form.target, probe_budget: form.probe_budget, seed: form.seed, authorization: form.authorization }).then(() => { setNewOpen(false); toast("Scan started"); }); }}>
              Start scan
            </Button>
          </div>
        </Dialog>
        <AlertDialog open={haltOpen} onClose={() => setHaltOpen(false)} onConfirm={() => { void control("halt").then(() => toast("Scan halted")); setHaltOpen(false); }} title="Engage kill switch?" body="This aborts in-flight LLM and target requests immediately and emits no further events." />
        <footer className="mt-10 flex gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Shield size={16} /> Guard</span>
          <span className="inline-flex items-center gap-1"><Zap size={16} /> Attack</span>
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={16} /> Verify</span>
          <span className="inline-flex items-center gap-1"><RefreshCw size={16} /> Confirm</span>
          <span className="inline-flex items-center gap-1"><FileText size={16} /> Report</span>
        </footer>
      </div>
    </div>
  );
}
