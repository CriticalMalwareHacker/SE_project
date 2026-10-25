import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldSelect } from "../components/field-select";
import { EmptyState, PageHeader } from "../components/page";
import { SeverityBadge, StatusBadge } from "../components/status";
import { filterFindings, sortFindings, useStore } from "../store";
import type { Finding } from "../api/types";

const STEP_INDEX: Record<string, number> = {
  Candidate: 0,
  Verifying: 1,
  Rejected: 1,
  Fixing: 2,
  Retesting: 3,
  "Fix Failed": 3,
  "Halted mid-loop": 3,
  "Verified Fixed": 4,
  Reported: 4,
};

export default function Findings() {
  const { scan, statusFilter, severityFilter, search, setFilters } = useStore();
  const [sortKey, setSortKey] = useState<string>("id");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [open, setOpen] = useState<Finding | null>(null);
  const [tab, setTab] = useState("attack");

  const rows = useMemo(() => {
    const filtered = filterFindings((scan?.findings as Finding[]) || [], search, statusFilter, severityFilter);
    return sortFindings(filtered, sortKey, direction);
  }, [scan, search, statusFilter, severityFilter, sortKey, direction]);

  if (!scan) return <Empty msg="No scan yet. Start a scan to populate findings." />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Findings" description="Candidate issues, verification evidence, and confirmed fixes." />

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input
            aria-label="Search findings"
            placeholder="Search findings…"
            value={search}
            onChange={(event) => setFilters({ search: event.target.value })}
            className="w-full sm:w-56"
          />
          <FieldSelect
            label="Status"
            value={statusFilter}
            onChange={(value) => setFilters({ statusFilter: value })}
            options={["all", "Candidate", "Verifying", "Rejected", "Fixing", "Retesting", "Verified Fixed", "Fix Failed", "Reported", "Halted mid-loop"]}
          />
          <FieldSelect
            label="Severity"
            value={severityFilter}
            onChange={(value) => setFilters({ severityFilter: value })}
            options={["all", "Critical", "High", "Medium", "Low"]}
          />
        </div>

        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow className="h-10">
              {(["id", "title", "endpoint", "severity", "status", "reproducibility", "attempts"] as const).map((key) => (
                <TableHead key={key}>
                  <button
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => {
                      if (sortKey === key) setDirection(direction === 1 ? -1 : 1);
                      else {
                        setSortKey(key);
                        setDirection(1);
                      }
                    }}
                  >
                    {key}
                    {sortKey === key && (direction === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((finding) => (
              <TableRow
                key={finding.id}
                onClick={() => {
                  setOpen(finding);
                  setTab("attack");
                }}
                className={`h-11 cursor-pointer ${finding.status === "Rejected" ? "text-muted-foreground line-through" : ""}`}
              >
                <TableCell className="mono text-xs">{finding.id ?? ""}</TableCell>
                <TableCell className="max-w-[240px] truncate" title={finding.title ?? ""}>{finding.title ?? ""}</TableCell>
                <TableCell className="mono max-w-[200px] truncate text-xs text-muted-foreground" title={finding.endpoint ?? ""}>{finding.endpoint ?? ""}</TableCell>
                <TableCell><SeverityBadge severity={finding.severity ?? ""} /></TableCell>
                <TableCell><StatusBadge status={finding.status ?? ""} /></TableCell>
                <TableCell className="tabular-nums text-right text-xs">{Math.round((finding.reproducibility ?? 0) * 100)}%</TableCell>
                <TableCell className="tabular-nums text-right text-xs">{finding.attempts ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No findings match the filters.</p>}
      </Card>

      <Sheet open={Boolean(open)} onOpenChange={(value) => { if (!value) setOpen(null); }}>
        <SheetContent aria-label={open ? `${open.id} ${open.title}` : "Finding details"} className="overflow-y-auto bg-background">
          <SheetHeader>
            <SheetTitle className="pr-6 text-left">{open ? `${open.id} · ${open.title}` : ""}</SheetTitle>
          </SheetHeader>
          {open && (
            <div className="mt-5 flex flex-col gap-5">
              <Stepper finding={open} />
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Severity</span>
                <SeverityBadge severity={open.severity ?? ""} />
                <span className="mono text-xs">{open.owasp_tag ?? ""}</span>
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line">
                  <TabsTrigger value="attack">Attack</TabsTrigger>
                  <TabsTrigger value="verify">Verify</TabsTrigger>
                  <TabsTrigger value="fix">Fix</TabsTrigger>
                  <TabsTrigger value="confirm">Confirm</TabsTrigger>
                </TabsList>
                <TabsContent value="attack">
                  <div className="flex flex-col gap-3">
                    <Code label="Payload" text={open.payload ?? ""} />
                    <Code label="Raw response" text={open.raw_response ?? ""} />
                  </div>
                </TabsContent>
                <TabsContent value="verify">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1">
                      {(open.replays || []).map((replay, index) => (
                        <span key={index} title={replay.response_excerpt} className={`h-3 w-3 rounded-sm ${replay.passed ? "bg-emerald-400" : "bg-muted"}`} />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Reproducibility <span className="text-foreground">{Math.round((open.reproducibility || 0) * 100)}%</span> · {open.verdict}
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="fix">
                  <div className="flex flex-col gap-4">
                    {(open.fixes || []).map((fix, index) => (
                      <div key={index}>
                        <p className="mono mb-1 text-xs text-muted-foreground">{fix.mitigation_id} · attempt {fix.attempt} · {fix.result}</p>
                        <Code label="Diff" text={fix.diff ?? ""} />
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="confirm">
                  <div className="flex flex-col gap-3">
                    {(open.confirms || []).map((confirm, index) => (
                      <div key={index} className="border-t border-border pt-3">
                        <p className="mono mb-1 text-xs">{confirm.bypassed ? "BYPASSED" : "BLOCKED"} · {confirm.payload}</p>
                        <Code label="After" text={confirm.after_response ?? ""} />
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              <div>
                <h3 className="mb-2 text-sm font-medium">Transition timeline</h3>
                <ul className="mono flex flex-col gap-1 text-xs text-muted-foreground">
                  {(open.history || []).map((entry, index) => <li key={index}>· {entry}</li>)}
                </ul>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stepper({ finding }: { finding: Finding }) {
  const steps = ["Candidate", "Verifying", "Fixing", "Retesting", "Reported"];
  const status = finding.status ?? "";
  const index = STEP_INDEX[status] ?? 0;
  const failed = status === "Fix Failed" || status === "Halted mid-loop";
  return (
    <ol className="flex flex-wrap gap-1" aria-label="Finding progress">
      {steps.map((step, stepIndex) => {
        const active = stepIndex <= index;
        const isFailed = failed && stepIndex === index;
        return (
          <li
            key={step}
            className={`rounded-md border px-2 py-1 text-xs ${
              isFailed
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : active
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
            }`}
          >
            {step}
          </li>
        );
      })}
    </ol>
  );
}

function Code({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="xs" aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(text || "")}>Copy</Button>
      </div>
      <pre className="mono max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground">{text || "—"}</pre>
    </div>
  );
}

export function Empty({ msg }: { msg: string }) {
  return (
    <div>
      <PageHeader title="Findings" description="Candidate issues, verification evidence, and confirmed fixes." />
      <Card className="gap-0 py-0">
        <EmptyState icon={Bug} title="Nothing here yet" description={msg} />
      </Card>
    </div>
  );
}
