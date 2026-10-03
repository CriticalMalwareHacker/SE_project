import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "../store";
import { api } from "../api/client";

export default function Settings() {
  const { settings, saveSettings, scanId } = useStore();
  const [busy, setBusy] = useState(false);
  if (!settings) return <Skeleton className="h-64" />;
  const set = (k: string, v: number) => ({ ...settings, [k]: v }) as typeof settings;
  const num = (label: string, k: string, v: number | undefined) => (
    <Label>{label}<Input type="number" step="any" value={v ?? 0} onChange={(e) => void saveSettings(set(k, Number(e.target.value)))} /></Label>
  );
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-50">Settings</h1>
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-3">
          {num("Reproducibility threshold", "reproducibility_threshold", settings.reproducibility_threshold)}
          {num("Max retry attempts", "max_retry_attempts", settings.max_retry_attempts)}
          {num("Replay count", "replay_count", settings.replay_count)}
          {num("Mutation count", "mutation_count", settings.mutation_count)}
          {num("Probe budget", "probe_budget", settings.probe_budget)}
          {num("LLM call budget", "llm_call_budget", settings.llm_call_budget)}
          {num("Simulation speed (mock)", "sim_speed", settings.sim_speed)}
          {num("Hallucination rate (mock)", "hallucination_rate", settings.hallucination_rate)}
          {num("Fix-failure rate (mock)", "fix_failure_rate", settings.fix_failure_rate)}
        </div>
        <h2 className="mt-4 text-lg font-medium text-slate-50">Models (read-only, from server env)</h2>
        <pre className="mono mt-1 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(settings.models, null, 2)}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setBusy(true); api<{ ok: boolean; detail: string }>("/api/llm/test", { method: "POST" }).then((r) => toast(r.ok ? "OpenRouter OK" : `OpenRouter: ${r.detail}`)).catch((e: Error) => toast(e.message)).finally(() => setBusy(false)); }} disabled={busy}>Test OpenRouter connection</Button>
          {scanId && <Button variant="outline" onClick={() => void api(`/api/scans/${scanId}/export`).then((j) => { const b = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "scan.json"; a.click(); })}>Export scan JSON</Button>}
          <Button variant="destructive" onClick={() => void api("/api/target/reset", { method: "POST" }).then(() => toast.success("Target reset to vulnerable baseline"))}>Reset all data</Button>
        </div>
      </Card>
    </div>
  );
}
