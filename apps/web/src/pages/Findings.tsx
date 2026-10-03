import { useMemo, useState } from "react";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FieldSelect } from "../components/field-select";
import { SeverityBadge, StatusBadge } from "../components/status";
import { filterFindings, sortFindings, useStore } from "../store";
import type { Finding } from "../api/types";

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
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          <Input aria-label="Search findings" placeholder="Search…" value={search} onChange={(e) => setFilters({ search: e.target.value })} className="w-56" />
          <FieldSelect label="Status" value={statusFilter} onChange={(v) => setFilters({ statusFilter: v })} options={["all", "Candidate", "Verifying", "Rejected", "Fixing", "Retesting", "Verified Fixed", "Fix Failed", "Reported", "Halted mid-loop"]} />
          <FieldSelect label="Severity" value={severityFilter} onChange={(v) => setFilters({ severityFilter: v })} options={["all", "Critical", "High", "Medium", "Low"]} />
        </div>
        <Table>
          <TableHeader className="sticky top-0 bg-slate-900">
            <TableRow className="h-12">
              {(["id", "title", "endpoint", "severity", "status", "reproducibility", "attempts"] as const).map((k) => (
                <TableHead key={k}><button className="hover:text-teal-400" onClick={() => { if (sortKey === k) setDir(dir === 1 ? -1 : 1); else { setSortKey(k); setDir(1); } }}>{k} {sortKey === k ? (dir === 1 ? "▲" : "▼") : ""}</button></TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => (
              <TableRow key={f.id} onClick={() => { setOpen(f); setTab("attack"); }} className={`h-12 cursor-pointer hover:bg-slate-800/50 ${f.status === "Rejected" ? "text-slate-500 line-through" : "text-slate-200"}`}>
                <TableCell className="mono">{f.id ?? ""}</TableCell>
                <TableCell className="max-w-[240px] truncate" title={f.title ?? ""}>{f.title ?? ""}</TableCell>
                <TableCell className="mono max-w-[200px] truncate" title={f.endpoint ?? ""}>{f.endpoint ?? ""}</TableCell>
                <TableCell><SeverityBadge severity={f.severity ?? ""} /></TableCell>
                <TableCell><StatusBadge status={f.status ?? ""} /></TableCell>
                <TableCell className="tabular-nums text-right">{Math.round((f.reproducibility ?? 0) * 100)}%</TableCell>
                <TableCell className="tabular-nums text-right">{f.attempts ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No findings match the filters.</p>}
      </Card>
      <Sheet open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <SheetContent aria-label={open ? `${open.id} · ${open.title}` : "Finding details"} className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{open ? `${open.id} · ${open.title}` : ""}</SheetTitle>
          </SheetHeader>
          {open && (
            <div className="mt-4 flex flex-col gap-4">
              <Stepper f={open} />
              <p className="text-sm text-slate-300">Severity <SeverityBadge severity={open.severity ?? ""} /> · <Tooltip><TooltipTrigger className="cursor-help underline decoration-dotted decoration-slate-600">{open.owasp_tag ?? ""}</TooltipTrigger><TooltipContent>OWASP LLM Top 10 category</TooltipContent></Tooltip></p>
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
                  <div>
                    <div className="mb-1 flex gap-1">{(open.replays || []).map((r, i) => <span key={i} title={r.response_excerpt} className={`h-3 w-3 rounded-sm ${r.passed ? "bg-emerald-400" : "bg-slate-700"}`} />)}</div>
                    <p className="text-sm text-slate-300">Reproducibility {Math.round((open.reproducibility || 0) * 100)}% · {open.verdict}</p>
                  </div>
                </TabsContent>
                <TabsContent value="fix">
                  <div className="flex flex-col gap-3">
                    {(open.fixes || []).map((fx, i) => <div key={i}><p className="mono text-xs text-slate-400">{fx.mitigation_id} · attempt {fx.attempt} · {fx.result}</p><Code label="Diff" text={fx.diff ?? ""} /></div>)}
                  </div>
                </TabsContent>
                <TabsContent value="confirm">
                  <div className="flex flex-col gap-2">
                    {(open.confirms || []).map((c, i) => <div key={i} className="border-t border-slate-800 pt-2"><p className="mono text-xs">{c.bypassed ? "BYPASSED" : "BLOCKED"} · {c.payload}</p><Code label="After" text={c.after_response ?? ""} /></div>)}
                  </div>
                </TabsContent>
              </Tabs>
              <div>
                <h3 className="text-sm font-medium text-slate-200">Transition timeline</h3>
                <ul className="mono text-xs text-slate-400">{(open.history || []).map((h, i) => <li key={i}>• {h}</li>)}</ul>
              </div>
            </div>
          )}
        </SheetContent>
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
      <div className="mb-1 flex items-center gap-2"><span className="text-xs text-slate-400">{label}</span><span className="flex-1" /><Button variant="ghost" size="sm" aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(text || "")}>Copy</Button></div>
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
