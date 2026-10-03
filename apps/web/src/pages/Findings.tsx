import { useMemo, useState } from "react";
import { Bug } from "lucide-react";
import { Badge, Button, Card, Input, Select, Sheet, Tabs, Tooltip } from "../components/ui";
import { filterFindings, sortFindings, useStore } from "../store";
import type { Finding } from "../api/types";

function tone(status: string): string {
  if (status === "Reported" || status === "Verified Fixed") return "success";
  if (status === "Rejected") return "neutral";
  if (status === "Fix Failed" || status === "Halted mid-loop") return "critical";
  return "warning";
}

export default function Findings() {
  const { scan, statusFilter, severityFilter, search, setFilters } = useStore();
  const [sortKey, setSortKey] = useState<string>("id");
  const [dir, setDir] = useState<1 | -1>(1);
  const [open, setOpen] = useState<Finding | null>(null);
  const [tab, setTab] = useState("attack");
  const rows = useMemo(() => {
    const f = filterFindings((scan?.findings as Finding[]) || [], search, statusFilter, severityFilter);
    return sortFindings(f, sortKey, dir);
  }, [scan, search, statusFilter, severityFilter, sortKey, dir]);

  if (!scan) {
    return <Empty msg="No scan yet. Start a scan to populate findings." />;
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-50">Findings</h1>
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <Input aria-label="Search findings" placeholder="Search…" value={search} onChange={(e) => setFilters({ search: e.target.value })} className="w-56" />
          <Select label="Status" value={statusFilter} onChange={(v) => setFilters({ statusFilter: v })} options={["all", "Candidate", "Verifying", "Rejected", "Fixing", "Retesting", "Verified Fixed", "Fix Failed", "Reported", "Halted mid-loop"]} />
          <Select label="Severity" value={severityFilter} onChange={(v) => setFilters({ severityFilter: v })} options={["all", "Critical", "High", "Medium", "Low"]} />
        </div>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 text-left text-xs text-slate-400">
            <tr className="h-12">
              {(["id", "title", "endpoint", "severity", "status", "reproducibility", "attempts"] as const).map((k) => (
                <th key={k}><button className="hover:text-teal-400" onClick={() => { if (sortKey === k) setDir(dir === 1 ? -1 : 1); else { setSortKey(k); setDir(1); } }}>{k} {sortKey === k ? (dir === 1 ? "▲" : "▼") : ""}</button></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} onClick={() => { setOpen(f); setTab("attack"); }} className={`h-12 cursor-pointer border-t border-slate-800 hover:bg-slate-800/50 ${f.status === "Rejected" ? "text-slate-500 line-through" : "text-slate-200"}`}>
                <td className="mono">{f.id ?? ""}</td>
                <td className="max-w-[240px] truncate" title={f.title ?? ""}>{f.title ?? ""}</td>
                <td className="mono max-w-[200px] truncate" title={f.endpoint ?? ""}>{f.endpoint ?? ""}</td>
                <td><Badge tone={f.severity === "Critical" ? "critical" : f.severity === "High" ? "warning" : "neutral"}>{f.severity ?? ""}</Badge></td>
                <td><Badge tone={tone(f.status ?? "")}>{f.status ?? ""}</Badge></td>
                <td className="tabular-nums text-right">{Math.round((f.reproducibility ?? 0) * 100)}%</td>
                <td className="tabular-nums text-right">{f.attempts ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No findings match the filters.</p>}
      </Card>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${open.id} · ${open.title}` : ""}>
        {open && (
          <div className="flex flex-col gap-4">
            <Stepper f={open} />
            <p className="text-sm text-slate-300">Severity <Badge tone="warning">{open.severity ?? ""}</Badge> · <Tooltip tip="OWASP LLM Top 10 category">{open.owasp_tag ?? ""}</Tooltip></p>
            <Tabs tabs={[{ id: "attack", label: "Attack" }, { id: "verify", label: "Verify" }, { id: "fix", label: "Fix" }, { id: "confirm", label: "Confirm" }]} value={tab} onChange={setTab} />
            {tab === "attack" && (<><Code label="Payload" text={open.payload ?? ""} /><Code label="Raw response" text={open.raw_response ?? ""} /></>)}
            {tab === "verify" && (
              <div>
                <div className="mb-1 flex gap-1">{(open.replays || []).map((r, i) => <span key={i} title={r.response_excerpt} className={`h-3 w-3 rounded-sm ${r.passed ? "bg-emerald-400" : "bg-slate-700"}`} />)}</div>
                <p className="text-sm text-slate-300">Reproducibility {Math.round((open.reproducibility || 0) * 100)}% · {open.verdict}</p>
              </div>
            )}
            {tab === "fix" && (open.fixes || []).map((fx, i) => <div key={i}><p className="mono text-xs text-slate-400">{fx.mitigation_id} · attempt {fx.attempt} · {fx.result}</p><Code label="Diff" text={fx.diff ?? ""} /></div>)}
            {tab === "confirm" && (open.confirms || []).map((c, i) => <div key={i} className="border-t border-slate-800 pt-2"><p className="mono text-xs">{c.bypassed ? "BYPASSED" : "BLOCKED"} · {c.payload}</p><Code label="After" text={c.after_response ?? ""} /></div>)}
            <div>
              <h3 className="text-sm font-medium text-slate-200">Transition timeline</h3>
              <ul className="mono text-xs text-slate-400">{(open.history || []).map((h, i) => <li key={i}>• {h}</li>)}</ul>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Stepper({ f }: { f: Finding }) {
  const steps = ["Candidate", "Verifying", "Fixing", "Retesting", "Reported"];
  const idx = Math.max(0, steps.findIndex((s) => (f.status ?? "").startsWith(s.slice(0, 4))));
  return (
    <ol className="flex gap-1" aria-label="Finding progress">
      {steps.map((s, i) => <li key={s} className={`rounded-md border px-2 py-1 text-xs ${i <= idx ? "border-teal-400 text-teal-400" : "border-slate-800 text-slate-500"}`}>{s}</li>)}
    </ol>
  );
}

function Code({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="mb-1 flex items-center gap-2"><span className="text-xs text-slate-400">{label}</span><span className="flex-1" /><Button variant="ghost" aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(text || "")}>Copy</Button></div>
      <pre className="mono max-h-48 overflow-auto text-xs text-slate-200">{text || "—"}</pre>
    </div>
  );
}

export function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <Bug size={24} className="text-slate-500" />
      <p className="text-sm text-slate-400">{msg}</p>
    </div>
  );
}
