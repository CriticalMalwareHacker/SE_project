import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, SectionCard } from "../components/page";
import { useStore } from "../store";
import { api } from "../api/client";

export default function Settings() {
  const { settings, saveSettings, scanId } = useStore();
  const [busy, setBusy] = useState(false);

  if (!settings) {
    return (
      <div>
        <PageHeader title="Settings" description="Loop budgets, thresholds, and model routing." />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const update = (key: string, value: number) => {
    void saveSettings({ ...settings, [key]: value } as typeof settings).catch((error: Error) => toast.error(error.message));
  };

  const numberField = (label: string, key: string, value: number | undefined) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`setting-${key}`}>{label}</Label>
      <Input
        id={`setting-${key}`}
        type="number"
        step="any"
        value={value ?? 0}
        onChange={(event) => update(key, Number(event.target.value))}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Loop budgets, thresholds, and model routing." />

      <SectionCard title="Loop controls" description="Saved to the server as you edit.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {numberField("Reproducibility threshold", "reproducibility_threshold", settings.reproducibility_threshold)}
          {numberField("Max retry attempts", "max_retry_attempts", settings.max_retry_attempts)}
          {numberField("Replay count", "replay_count", settings.replay_count)}
          {numberField("Mutation count", "mutation_count", settings.mutation_count)}
          {numberField("Probe budget", "probe_budget", settings.probe_budget)}
          {numberField("LLM call budget", "llm_call_budget", settings.llm_call_budget)}
          {numberField("Simulation speed (mock)", "sim_speed", settings.sim_speed)}
          {numberField("Hallucination rate (mock)", "hallucination_rate", settings.hallucination_rate)}
          {numberField("Fix-failure rate (mock)", "fix_failure_rate", settings.fix_failure_rate)}
        </div>
      </SectionCard>

      <SectionCard title="Agent providers and models" description="Read-only from apps/server/.env. Credentials stay on the server.">
        <pre className="mono overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">{JSON.stringify(settings.models, null, 2)}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void api<{ ok: boolean; detail: string }>("/api/llm/test", { method: "POST" })
                .then((result) => toast(result.ok ? "Attack Agent provider connected" : result.detail))
                .catch((error: Error) => toast.error(error.message))
                .finally(() => setBusy(false));
            }}
          >
            Test Attack Agent provider
          </Button>
          {scanId && (
            <Button
              variant="outline"
              onClick={() =>
                void api(`/api/scans/${scanId}/export`)
                  .then((json) => {
                    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = "scan.json";
                    anchor.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              Export scan JSON
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => {
              void api("/api/target/reset", { method: "POST" })
                .then(() => toast.success("Target reset to vulnerable baseline"))
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            Reset all data
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
