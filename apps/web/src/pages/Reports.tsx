import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldSelect } from "../components/field-select";
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
      <Card className="p-5">
        <FieldSelect label="Finding" value={String(cur.id)} onChange={setSel} options={done.map((f) => ({ value: String((f as { id: string }).id), label: `${String((f as { id: string }).id)} · ${String((f as { title: string }).title)}` }))} />
        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList variant="line">
            <TabsTrigger value="tech">Technical</TabsTrigger>
            <TabsTrigger value="plain">Plain language</TabsTrigger>
          </TabsList>
          <TabsContent value="tech">
            <ReportBody md={md} id={String(cur.id)} />
          </TabsContent>
          <TabsContent value="plain">
            <ReportBody md={md} id={String(cur.id)} />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

function ReportBody({ md, id }: { md: string; id: string }) {
  return (
    <div>
      <article className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-200">{md || "—"}</article>
      <div className="no-print mt-3 flex gap-2">
        <Button variant="outline" aria-label="Copy as Markdown" onClick={() => void navigator.clipboard.writeText(md)}><FileText size={16} /> Copy as Markdown</Button>
        <Button variant="outline" onClick={() => { const b = new Blob([md], { type: "text/markdown" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `${id}.md`; a.click(); URL.revokeObjectURL(u); }}>Download .md</Button>
        <Button variant="outline" onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
    </div>
  );
}
