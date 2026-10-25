import { Badge } from "@/components/ui/badge";

const STATUS_CLASS: Record<string, string> = {
  Reported: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  "Verified Fixed": "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  Rejected: "border-border bg-muted text-muted-foreground",
  "Fix Failed": "border-red-500/20 bg-red-500/10 text-red-400",
  "Halted mid-loop": "border-red-500/20 bg-red-500/10 text-red-400",
  Candidate: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  Verifying: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  Fixing: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  Retesting: "border-amber-500/20 bg-amber-500/10 text-amber-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status] ?? STATUS_CLASS.Candidate}>
      {status}
    </Badge>
  );
}

const SEVERITY_CLASS: Record<string, string> = {
  Critical: "border-red-500/20 bg-red-500/10 text-red-400",
  High: "border-orange-500/20 bg-orange-500/10 text-orange-400",
  Medium: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  Low: "border-border bg-muted text-muted-foreground",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge variant="outline" className={SEVERITY_CLASS[severity] ?? SEVERITY_CLASS.Low}>
      {severity}
    </Badge>
  );
}

export function ToneBadge({ tone, children }: { tone: "info" | "neutral" | "success" | "warning" | "critical"; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    info: "border-primary/20 bg-primary/10 text-primary",
    neutral: "border-border bg-muted text-muted-foreground",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    critical: "border-red-500/20 bg-red-500/10 text-red-400",
  };
  return (
    <Badge variant="outline" className={classes[tone]}>
      {children}
    </Badge>
  );
}
