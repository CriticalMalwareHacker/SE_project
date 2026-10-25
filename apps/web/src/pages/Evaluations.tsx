import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { EmptyState, PageHeader, SectionCard, StatCard } from "@/components/page";
import { SeverityBadge, ToneBadge } from "@/components/status";
import { api } from "@/api/client";

interface Evaluation {
  total_scans: number;
  findings_by_severity: Record<string, number>;
  verified_remediation_rate: number;
  time_to_mitigation_avg_s: number | null;
  time_to_mitigation_trend: number[];
}

interface ScanSummary {
  id: string;
  target_type: string;
  status: string;
  started_at: string;
  finding_count: number;
}

export default function Evaluations() {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([api<Evaluation>("/api/profile/evaluations"), api<{ scans: ScanSummary[] }>("/api/scans")])
      .then(([nextEvaluation, nextScans]) => {
        setEvaluation(nextEvaluation);
        setScans(nextScans.scans);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Profile & evaluation" description="Only your authenticated scan history and aggregate results." />

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Total scans" value={evaluation?.total_scans ?? 0} />
        <StatCard label="Verified remediation" value={`${Math.round((evaluation?.verified_remediation_rate ?? 0) * 100)}%`} />
        <StatCard label="Time to mitigation" value={evaluation?.time_to_mitigation_avg_s == null ? "—" : `${evaluation.time_to_mitigation_avg_s}s`} />
      </div>

      <SectionCard title="Findings by severity" description="Across all of your scans.">
        <div className="flex flex-wrap gap-4">
          {["Critical", "High", "Medium", "Low"].map((severity) => (
            <div key={severity} className="flex items-center gap-2">
              <SeverityBadge severity={severity} />
              <span className="tabular-nums text-sm">{evaluation?.findings_by_severity?.[severity] ?? 0}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Scan history" description="Newest first.">
        {scans.length === 0 ? (
          <EmptyState icon={History} title="No scans yet" description="Your completed and in-progress scans will appear here." className="py-10" />
        ) : (
          <ul className="divide-y divide-border">
            {scans.map((scan) => (
              <li key={scan.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm first:pt-0 last:pb-0">
                <span className="mono text-xs text-muted-foreground">{scan.id}</span>
                <span>{scan.target_type === "juice_shop" ? "Juice Shop" : "Bundled lab"}</span>
                <span className="text-muted-foreground">{scan.finding_count} findings</span>
                <span className="flex-1" />
                <span className="text-xs text-muted-foreground">{scan.started_at ? new Date(scan.started_at).toLocaleString() : ""}</span>
                <ToneBadge tone={scan.status === "Completed" ? "success" : scan.status === "Halted" ? "critical" : "neutral"}>{scan.status}</ToneBadge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
