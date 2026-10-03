import { useState } from "react";
import { FileText } from "lucide-react";
import { Button, Card, Tabs } from "../components/ui";
import { useStore } from "../store";
import { Empty } from "./Findings";

export default function Reports() {
  const { scan } = useStore();
  const done = (scan?.findings || []).filter((f) => (f as { status: string }).status === "Reported" || (f as { status: string }).status === "Verified Fixed");
  const [sel, setSel] = useState("");
  const [tab, setTab] = useState("tech");
  if (!scan) return <Empty msg="No scan yet. Reports appear for Verified Fixed findings." />;
  if (done.length === 0) return <Empty msg="No verified fixes yet. Reports appear once a fix is confirmed." />;
  const cur = (done as unknown as Record<string, string>[]).find((f) => f.id === sel) || (done[0] as unknown as Record<string, string>);
  const md = tab === "tech" ? String(cur.technical_report || "") : String(cur.plain_report || "");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-50">Reports</h1>
      <Card>
        <label className="text-xs text-slate-400">Finding <select aria-label="Select finding" value={String(cur.id)} onChange={(e) => setSel(e.target.value)} className="ml-2 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-sm text-slate-200">{done.map((f) => <option key={String((f as { id: string }).id)} value={String((f as { id: string }).id)}>{String((f as { id: string }).id)} · {String((f as { title: string }).title)}</option>)}</select></label>
        <div className="mt-3"><Tabs tabs={[{ id: "tech", label: "Technical" }, { id: "plain", label: "Plain language" }]} value={tab} onChange={setTab} /></div>
        <article className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-200">{md || "—"}</article>
        <div className="no-print mt-3 flex gap-2">
          <Button variant="outline" aria-label="Copy as Markdown" onClick={() => void navigator.clipboard.writeText(md)}><FileText size={16} /> Copy as Markdown</Button>
          <Button variant="outline" onClick={() => { const b = new Blob([md], { type: "text/markdown" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `${String(cur.id)}.md`; a.click(); URL.revokeObjectURL(u); }}>Download .md</Button>
          <Button variant="outline" onClick={() => window.print()}>Print / Save as PDF</Button>
        </div>
      </Card>
    </div>
  );
}
