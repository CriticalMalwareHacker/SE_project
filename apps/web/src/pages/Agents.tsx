import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "../components/page";
import { ToneBadge } from "../components/status";
import { useStore } from "../store";

const AGENTS = [
  { id: "guard_gate", name: "Guard Gate", description: "Allowlist scope check, probe budget, and kill switch." },
  { id: "attack", name: "Attack", description: "LLM-proposed payloads sent to the local target; success is checked programmatically." },
  { id: "verify_fix", name: "Verify & Fix", description: "Replay probes, reject hallucinations, and draft whitelisted mitigations." },
  { id: "confirm", name: "Confirm", description: "Re-attack with mutations and loop back if the fix is bypassed." },
  { id: "report", name: "Report", description: "Grounded technical and plain-language reports for verified fixes." },
];

export default function Agents() {
  const { scan, events, settings } = useStore();

  if (!scan) {
    return (
      <div>
        <PageHeader title="Agents" description="The five roles that make up the closed loop." />
        <Card className="gap-0 py-0">
          <EmptyState icon={Users} title="No scan yet" description="Agent activity appears once a scan runs." />
        </Card>
      </div>
    );
  }

  const counters = (scan.agent_counters || {}) as Record<string, number>;
  const tokens = (scan.token_totals || {}) as Record<string, number>;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Agents" description="The five roles that make up the closed loop." />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {AGENTS.map((agent) => {
          const last = [...events].reverse().find((event) => event.agent === agent.id)?.message || "idle";
          const active = scan.status === "Running";
          const modelInfo = settings?.models?.[agent.id] as { provider?: string; model?: string } | undefined;
          return (
            <Card key={agent.id} className="gap-3 p-4">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-primary" />
                <h2 className="text-sm font-medium">{agent.name}</h2>
                <span className="flex-1" />
                <ToneBadge tone={active ? "info" : "neutral"}>{active ? "Active" : "Idle"}</ToneBadge>
              </div>
              <p className="text-sm text-muted-foreground">{agent.description}</p>
              <p className="mono text-xs text-muted-foreground">
                actions <span className="text-foreground">{counters[agent.id] ?? 0}</span>
                <span className="mx-2">·</span>
                tokens <span className="text-foreground">{tokens[agent.id] ?? 0}</span>
              </p>
              {modelInfo && <p className="mono text-xs text-muted-foreground">{modelInfo.provider || ""}: {modelInfo.model || "model not set"}</p>}
              <p className="mono truncate text-xs text-muted-foreground" title={last}>last: {last}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
