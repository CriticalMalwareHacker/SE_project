import { Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToneBadge } from "../components/status";
import { useStore } from "../store";
import { Empty } from "./Findings";

const AGENTS = [
  { id: "guard_gate", name: "Guard Gate", desc: "Allowlist scope check, probe budget, kill switch." },
  { id: "attack", name: "Attack Agents", desc: "LLM-proposed payloads sent to the local target; success by programmatic check." },
  { id: "verify_fix", name: "Verify & Fix", desc: "Replay N times, reject hallucinations, draft and apply whitelisted mitigations." },
  { id: "confirm", name: "Confirm Agent", desc: "Re-attack with mutations; loop back if the fix is bypassed." },
  { id: "report", name: "Report Agent", desc: "Grounded technical + plain-language reports for verified fixes." },
];

export default function Agents() {
  const { scan, events, settings } = useStore();
  if (!scan) return <Empty msg="No scan yet. Agent cards appear once a scan runs." />;
  const counters = (scan.agent_counters || {}) as Record<string, number>;
  const tokens = (scan.token_totals || {}) as Record<string, number>;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-50">Agents</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {AGENTS.map((a) => {
          const last = [...events].reverse().find((e) => e.agent === a.id)?.message || "idle";
          const active = scan.status === "Running";
          const modelInfo = settings?.models?.[a.id] as { provider?: string; model?: string } | undefined;
          return (
            <Card key={a.id} className="p-5">
              <CardHeader className="mb-1 flex-row items-center gap-2 p-0">
                <Users size={16} className="text-teal-400" />
                <CardTitle>{a.name}</CardTitle>
                <span className="flex-1" />
                <ToneBadge tone={active ? "info" : "neutral"}>{active ? "Active" : "Idle"}</ToneBadge>
              </CardHeader>
              <CardContent className="p-0">
                <CardDescription className="mb-2">{a.desc}</CardDescription>
                <p className="mono tabular-nums text-xs text-slate-300">actions: {counters[a.id] ?? 0} · tokens: {tokens[a.id] ?? 0}</p>
                {modelInfo && <p className="mono mt-1 text-xs text-slate-500">{modelInfo.provider || ""}: {modelInfo.model || "model not set"}</p>}
                <p className="mono mt-1 truncate text-xs text-slate-500" title={last}>last: {last}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
