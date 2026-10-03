import { Badge } from "@/components/ui/badge";

const STATUS_CLASS: Record<string, string> = {
  "Reported": "border-emerald-400/30 bg-emerald-400/15 text-emerald-400",
  "Verified Fixed": "border-emerald-400/30 bg-emerald-400/15 text-emerald-400",
  "Rejected": "border-slate-700 bg-slate-500/15 text-slate-400",
  "Fix Failed": "border-red-400/30 bg-red-400/15 text-red-400",
  "Halted mid-loop": "border-red-400/30 bg-red-400/15 text-red-400",
  "Candidate": "border-amber-400/30 bg-amber-400/15 text-amber-400",
  "Verifying": "border-amber-400/30 bg-amber-400/15 text-amber-400",
  "Fixing": "border-amber-400/30 bg-amber-400/15 text-amber-400",
  "Retesting": "border-amber-400/30 bg-amber-400/15 text-amber-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status] ?? STATUS_CLASS["Candidate"]}>
      {status}
    </Badge>
  );
}

const SEVERITY_CLASS: Record<string, string> = {
  Critical: "border-red-400/30 bg-red-400/15 text-red-400",
  High: "border-orange-400/30 bg-orange-400/15 text-orange-400",
  Medium: "border-amber-400/30 bg-amber-400/15 text-amber-400",
  Low: "border-slate-700 bg-slate-500/15 text-slate-400",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge variant="outline" className={SEVERITY_CLASS[severity] ?? SEVERITY_CLASS["Low"]}>
      {severity}
    </Badge>
  );
}

export function ToneBadge({ tone, children }: { tone: "info" | "neutral" | "success" | "warning" | "critical"; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    info: "border-teal-400/30 bg-teal-400/15 text-teal-400",
    neutral: "border-slate-700 bg-slate-500/15 text-slate-400",
    success: "border-emerald-400/30 bg-emerald-400/15 text-emerald-400",
    warning: "border-amber-400/30 bg-amber-400/15 text-amber-400",
    critical: "border-red-400/30 bg-red-400/15 text-red-400",
  };
  return (
    <Badge variant="outline" className={cls[tone]}>
      {children}
    </Badge>
  );
}
