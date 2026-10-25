import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldSelect } from "../components/field-select";
import { EmptyState, PageHeader, SectionCard } from "../components/page";
import { useStore } from "../store";
import type { Finding } from "../api/types";

type ReportFinding = Finding & { technical_report?: string; plain_report?: string };

export default function Reports() {
  const { scan } = useStore();
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("tech");
  const done = ((scan?.findings || []) as ReportFinding[]).filter((finding) => finding.status === "Reported" || finding.status === "Verified Fixed");

  if (!scan) {
    return (
      <div>
        <PageHeader title="Reports" description="Grounded reports for confirmed fixes." />
        <Card className="gap-0 py-0"><EmptyState icon={FileText} title="No scan yet" description="Reports appear for Verified Fixed findings." /></Card>
      </div>
    );
  }
  if (done.length === 0) {
    return (
      <div>
        <PageHeader title="Reports" description="Grounded reports for confirmed fixes." />
        <Card className="gap-0 py-0"><EmptyState icon={FileText} title="No verified fixes yet" description="Reports appear once a fix is confirmed." /></Card>
      </div>
    );
  }

  const current = done.find((finding) => finding.id === selected) || done[0];
  const markdown = tab === "tech" ? String(current.technical_report || "") : String(current.plain_report || "");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Reports" description="Grounded reports for confirmed fixes." />
      <SectionCard>
        <FieldSelect
          label="Finding"
          value={String(current.id)}
          onChange={setSelected}
          options={done.map((finding) => ({ value: String(finding.id), label: `${finding.id} · ${finding.title}` }))}
        />
        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList variant="line">
            <TabsTrigger value="tech">Technical</TabsTrigger>
            <TabsTrigger value="plain">Plain language</TabsTrigger>
          </TabsList>
          <TabsContent value="tech"><ReportBody markdown={markdown} id={String(current.id)} /></TabsContent>
          <TabsContent value="plain"><ReportBody markdown={markdown} id={String(current.id)} /></TabsContent>
        </Tabs>
      </SectionCard>
    </div>
  );
}

function ReportBody({ markdown, id }: { markdown: string; id: string }) {
  return (
    <div>
      <article className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed">{markdown || "—"}</article>
      <div className="no-print mt-3 flex flex-wrap gap-2">
        <Button variant="outline" aria-label="Copy as Markdown" onClick={() => void navigator.clipboard.writeText(markdown)}>
          <FileText size={14} /> Copy as Markdown
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const blob = new Blob([markdown], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `${id}.md`;
            anchor.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download .md
        </Button>
        <Button variant="outline" onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
    </div>
  );
}
