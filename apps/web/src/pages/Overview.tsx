import { useMemo, useState } from "react";
import { CheckCircle2, FileText, RefreshCw, Shield, Zap } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FieldSelect } from "../components/field-select";
import { EmptyState, Meter, PageHeader, SectionCard, StatCard } from "../components/page";
import { ToneBadge } from "../components/status";
import { emptyMetrics, useStore } from "../store";

const STAGES = [
  { id: "guard", name: "Guard Gate", icon: Shield, caption: "scope + kill switch" },
  { id: "attack", name: "Attack", icon: Zap, caption: "real probes" },
  { id: "verify", name: "Verify & Fix", icon: CheckCircle2, caption: "replay + patch" },
  { id: "confirm", name: "Confirm", icon: RefreshCw, caption: "re-attack" },
  { id: "report", name: "Report", icon: FileText, caption: "grounded reports" },
];

export default function Overview({ onNew }: { onNew: () => void }) {
  const { scan, events, loopPulse } = useStore();
  const [agentFilter, setAgentFilter] = useState("all");
  const [paused, setPaused] = useState(false);
  const metrics = (scan?.metrics || emptyMetrics()) as {
    subtask_completion_rate?: number;
    reproducibility_score?: number;
    verified_remediation_rate?: number;
    time_to_mitigation_avg_s?: number | null;
    ttm_trend?: number[];
  };

  const counts = useMemo(() => {
    const next: Record<string, number> = { guard: 0, attack: 0, verify: 0, confirm: 0, report: 0 };
    for (const finding of scan?.findings || []) {
      if (finding.status === "Candidate" || finding.status === "Verifying" || finding.status === "Rejected") next.verify++;
      else if (finding.status === "Fixing" || finding.status === "Retesting") next.confirm++;
      else if (finding.status === "Verified Fixed" || finding.status === "Reported") next.report++;
    }
    next.attack = (scan?.findings || []).length;
    next.guard = scan ? 1 : 0;
    return next;
  }, [scan]);

  if (!scan) {
    return (
      <div>
        <PageHeader title="Overview" description="Watch the closed security loop run against a local lab." />
        <SectionCard>
          <EmptyState
            icon={Shield}
            title="No scan yet"
            description="Start a scan to watch Guard, Attack, Verify & Fix, Confirm, and Report work together."
            action={<Button onClick={onNew}>Start scan</Button>}
          />
        </SectionCard>
      </div>
    );
  }

  const trend = (metrics.ttm_trend || []).map((value, index) => ({ index, value }));
  const feed = events.filter((event) => agentFilter === "all" || event.agent === agentFilter);
  const tokenTotal = Object.values((scan.token_totals || {}) as Record<string, number>).reduce((sum, value) => sum + Number(value || 0), 0);
  const callBudget = 150;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Overview" description="Closed-loop security testing against the local demo target." />

      <SectionCard title="Pipeline" description="Each stage hands evidence to the next. Retries loop back to Attack.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {STAGES.map((stage) => {
            const Icon = stage.icon;
            const count = counts[stage.id] ?? 0;
            return (
              <div key={stage.id} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-primary">
                    <Icon size={16} strokeWidth={1.6} />
                  </span>
                  <ToneBadge tone={count > 0 ? "info" : "neutral"}>{count}</ToneBadge>
                </div>
                <p className="text-sm font-medium">{stage.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{stage.caption}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw size={13} className={loopPulse ? "animate-spin text-primary" : ""} />
          Retries loop back to Attack until a fix is verified.
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Subtask completion" value={`${Math.round((metrics.subtask_completion_rate || 0) * 100)}%`} hint="vs 69.05% VulnBot baseline">
          <Meter value={metrics.subtask_completion_rate || 0} className="mt-2" />
        </StatCard>
        <StatCard label="Reproducibility" value={`${Math.round((metrics.reproducibility_score || 0) * 100)}%`} hint="threshold 60%">
          <Meter value={metrics.reproducibility_score || 0} className="mt-2" />
        </StatCard>
        <StatCard label="Verified remediation" value={`${Math.round((metrics.verified_remediation_rate || 0) * 100)}%`} hint="vs 0% prior frameworks">
          <Meter value={metrics.verified_remediation_rate || 0} className="mt-2" />
        </StatCard>
        <StatCard label="Time to mitigation" value={metrics.time_to_mitigation_avg_s != null ? `${metrics.time_to_mitigation_avg_s}s` : "—"} hint="mean candidate → verified" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Time-to-mitigation trend" description="Seconds per verified fix.">
          {trend.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No verified fixes yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trend}>
                <XAxis dataKey="index" stroke="#71717a" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis stroke="#71717a" tickLine={false} axisLine={false} fontSize={11} width={32} />
                <Line type="monotone" dataKey="value" stroke="#2dd4bf" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Cost & tokens" description="Per-scan budget usage.">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">LLM calls</dt>
              <dd className="mono mt-1 tabular-nums">{scan.llm_calls_used ?? 0} / {callBudget}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tokens</dt>
              <dd className="mono mt-1 tabular-nums">{tokenTotal}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cost</dt>
              <dd className="mono mt-1 tabular-nums">${scan.cost_total ?? 0}</dd>
            </div>
          </dl>
          <Meter value={(scan.llm_calls_used ?? 0) / callBudget} className="mt-4" />
        </SectionCard>
      </div>

      <SectionCard
        title="Live agent activity"
        description="Newest events first appear at the bottom."
        actions={<FieldSelect label="Agent" value={agentFilter} onChange={setAgentFilter} options={["all", "guard_gate", "attack", "verify_fix", "confirm", "report"]} />}
      >
        <ScrollArea className="h-64">
          <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="flex flex-col gap-1.5">
            {feed.length === 0 && <p className="text-sm text-muted-foreground">Waiting for events…</p>}
            {feed.slice(-100).map((event) => (
              <p
                key={event.id}
                className={`mono flash-new text-xs leading-relaxed ${
                  event.type === "rejected" ? "text-amber-400" : event.type === "guard_blocked" ? "text-red-400" : "text-muted-foreground"
                }`}
              >
                <span className="text-foreground">[{event.agent}]</span> {event.message}
              </p>
            ))}
            {paused && <p className="text-xs text-muted-foreground">(paused on hover)</p>}
          </div>
        </ScrollArea>
      </SectionCard>

      <SectionCard title="Findings snapshot" description="Latest five findings.">
        {(scan.findings || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No findings yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(scan.findings || []).slice(-5).reverse().map((finding) => (
              <li key={finding.id} className="flex items-center gap-2 text-xs">
                <span className="mono text-muted-foreground">{finding.id}</span>
                <span className="min-w-0 flex-1 truncate">{finding.title}</span>
                <ToneBadge tone={finding.status === "Reported" || finding.status === "Verified Fixed" ? "success" : finding.status === "Rejected" ? "neutral" : "warning"}>
                  {finding.status ?? ""}
                </ToneBadge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
