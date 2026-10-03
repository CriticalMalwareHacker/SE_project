import { useMemo, useState } from "react";
import { Shield, Zap, CheckCircle2, RefreshCw, FileText } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { Badge, Button, Card, Progress, ScrollArea, Skeleton, Tooltip } from "../components/ui";
import { emptyMetrics, useStore } from "../store";

const STAGES = [
  { id: "guard", name: "Guard Gate", icon: Shield, caption: "scope + kill switch" },
  { id: "attack", name: "Attack Agents", icon: Zap, caption: "real probes" },
  { id: "verify", name: "Verify & Fix", icon: CheckCircle2, caption: "replay + patch" },
  { id: "confirm", name: "Confirm Agent", icon: RefreshCw, caption: "re-attack" },
  { id: "report", name: "Report Agent", icon: FileText, caption: "grounded reports" },
];

export default function Overview({ onNew }: { onNew: () => void }) {
  const { scan, events, loopPulse } = useStore();
  const [agentFilter, setAgentFilter] = useState("all");
  const [paused, setPaused] = useState(false);
  const m = (scan?.metrics || emptyMetrics()) as { subtask_completion_rate?: number; reproducibility_score?: number; verified_remediation_rate?: number; time_to_mitigation_avg_s?: number | null; ttm_trend?: number[] };
  const counts = useMemo(() => {
    const c: Record<string, number> = { guard: 0, attack: 0, verify: 0, confirm: 0, report: 0 };
    for (const f of scan?.findings || []) {
      if (f.status === "Candidate" || f.status === "Verifying") c.verify++;
      else if (f.status === "Fixing" || f.status === "Retesting") c.confirm++;
      else if (f.status === "Verified Fixed" || f.status === "Reported") c.report++;
      else if (f.status === "Rejected") c.verify++;
    }
    c.attack = (scan?.findings || []).length || 0;
    c.guard = 1;
    return c;
  }, [scan]);

  if (!scan) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <Shield size={24} className="text-slate-500" />
        <p className="text-sm text-slate-400">No scan yet. Start a scan to watch the closed loop run.</p>
        <Button onClick={onNew}>Start scan</Button>
      </div>
    );
  }

  const trend = ((m.ttm_trend as number[]) || []).map((v, i) => ({ i, v }));
  const feed = events.filter((e) => agentFilter === "all" || e.agent === agentFilter);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-50">Overview</h1>
      <Card>
        <div className="grid grid-cols-5 gap-2">
          {STAGES.map((s, i) => {
            const I = s.icon;
            return (
              <div key={s.id} className="relative rounded-lg border border-slate-800 p-3 text-center">
                <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-slate-800"><I size={24} strokeWidth={1.5} className="text-teal-400" /></span>
                <p className="text-sm font-medium text-slate-200">{s.name}</p>
                <p className="text-xs text-slate-400">{s.caption}</p>
                <Badge tone="info" className="mt-1 tabular-nums">{counts[s.id] ?? 0}</Badge>
                {i < 4 && <span className="absolute -right-2 top-1/2 hidden h-px w-4 bg-slate-700 lg:block" />}
              </div>
            );
          })}
        </div>
        <svg viewBox="0 0 600 60" className="mt-2 w-full" aria-label="retry if not verified loop-back">
          <path d="M 480 8 C 480 50, 130 50, 130 12" fill="none" stroke={loopPulse ? "#2dd4bf" : "#f59e0b"} strokeWidth="2" className={loopPulse ? "loop-active" : ""} markerEnd="url(#ah)" />
          <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke={loopPulse ? "#2dd4bf" : "#f59e0b"} strokeWidth="1.5" /></marker></defs>
          <text x="300" y="55" textAnchor="middle" fill={loopPulse ? "#2dd4bf" : "#f59e0b"} fontSize="11">retry if not verified</text>
        </svg>
      </Card>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Metric title="Subtask Completion" value={`${Math.round((m.subtask_completion_rate || 0) * 100)}%`} base="vs 69.05% VulnBot baseline" pct={(m.subtask_completion_rate || 0) * 100} tip="Done task-graph nodes / total nodes" />
        <Metric title="Reproducibility" value={`${Math.round((m.reproducibility_score || 0) * 100)}%`} base="threshold 60%" pct={(m.reproducibility_score || 0) * 100} tip="Mean replay pass rate across non-rejected findings" />
        <Metric title="Verified Remediation" value={`${Math.round((m.verified_remediation_rate || 0) * 100)}%`} base="vs 0% prior frameworks" pct={(m.verified_remediation_rate || 0) * 100} tip="Verified Fixed / (all non-rejected)" />
        <Metric title="Time to Mitigation" value={m.time_to_mitigation_avg_s != null ? `${m.time_to_mitigation_avg_s}s` : "—"} base="vs multi-day manual cycles" pct={50} tip="Mean seconds from candidate to Verified Fixed" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-medium text-slate-50">Time-to-mitigation trend</h2>
          {trend.length === 0 ? <Skeleton className="h-32" /> : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trend}><XAxis dataKey="i" stroke="#64748b" /><YAxis stroke="#64748b" /><Line type="monotone" dataKey="v" stroke="#2dd4bf" dot={false} /></LineChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-medium text-slate-50">Cost & tokens</h2>
          <p className="mono tabular-nums text-sm text-slate-200">LLM calls {scan.llm_calls_used ?? 0} / budget · tokens {Object.values((scan.token_totals || {}) as Record<string, number>).reduce((a: number, b) => a + Number(b || 0), 0)} · ${scan.cost_total ?? 0}</p>
          <div className="mt-2"><Progress value={Math.min(100, ((scan.llm_calls_used ?? 0) / 150) * 100)} /></div>
        </Card>
      </div>
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-medium text-slate-50">Live Agent Activity</h2>
          <span className="flex-1" />
          <select aria-label="Filter by agent" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-sm">
            {["all", "guard_gate", "attack", "verify_fix", "confirm", "report"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <ScrollArea className="h-64">
          <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="flex flex-col gap-1">
            {feed.length === 0 && <p className="text-sm text-slate-500">Waiting for events…</p>}
            {feed.slice(-100).map((e) => (
              <p key={e.id} className={`mono flash-new text-xs ${e.type === "rejected" ? "text-amber-400" : e.type === "guard_blocked" ? "text-red-400" : "text-slate-300"}`}>
                [{e.agent}] {e.message}
              </p>
            ))}
            {paused && <p className="text-xs text-slate-500">(paused on hover)</p>}
          </div>
        </ScrollArea>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-medium text-slate-50">Findings Snapshot</h2>
        {(scan.findings || []).length === 0 ? <p className="text-sm text-slate-500">No findings yet.</p> : (
          <ul className="flex flex-col gap-2">
            {(scan.findings || []).slice(-5).reverse().map((f) => (
              <li key={f.id} className="mono flex gap-2 text-xs text-slate-300"><span>{f.id}</span><span className="truncate">{f.title}</span><Badge tone={f.status === "Reported" ? "success" : f.status === "Rejected" ? "neutral" : "warning"}>{f.status}</Badge></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Metric({ title, value, base, pct, tip }: { title: string; value: string; base: string; pct: number; tip: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-400"><Tooltip tip={tip}>{title}</Tooltip></p>
      <p className="tabular-nums text-2xl font-semibold text-slate-50">{value}</p>
      <p className="mb-2 text-xs text-slate-500">{base}</p>
      <Progress value={pct} />
    </Card>
  );
}
