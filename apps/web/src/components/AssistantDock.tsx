import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, LoaderCircle, Send, ShieldCheck, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/api/client";
import { useStore } from "@/store";

type ChatMessage = { role: "assistant" | "user"; text: string; confirmScan?: boolean };
type CommandReply = { message: string; action?: string; scan_id?: string; requires_confirmation?: boolean; findings?: Array<{ id: string; title: string; endpoint: string; severity: string; status: string }> };
const INITIAL: ChatMessage[] = [{ role: "assistant", text: "I can explain GuardLoop or run a local demo command. I only scan the bundled lab on 127.0.0.1:5001." }];

export default function AssistantDock() {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("guardloop-assistant-chat") || "null");
      if (!Array.isArray(saved)) return INITIAL;
      const valid = saved.filter((item): item is ChatMessage =>
        item && (item.role === "assistant" || item.role === "user") && typeof item.text === "string"
        && !(item.role === "assistant" && ["none", "null", "undefined"].includes(item.text.trim().toLowerCase()))
      );
      return valid.length ? valid : INITIAL;
    }
    catch { return INITIAL; }
  });
  const tail = useRef<HTMLDivElement>(null);
  const { scanId, adoptScan } = useStore();

  useEffect(() => {
    sessionStorage.setItem("guardloop-assistant-chat", JSON.stringify(messages.slice(-80)));
    tail.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function runCommand(command: string, confirmed = false) {
    const result = await api<CommandReply>("/api/assistant/command", {
      method: "POST",
      body: JSON.stringify({ command, confirmed, scan_id: scanId }),
    });
    if (result.scan_id && result.action === "scan") await adoptScan(result.scan_id);
    const details = result.findings?.length
      ? `\n\n${result.findings.map((f) => `• ${f.severity} · ${f.title} (${f.status}) — ${f.endpoint}`).join("\n")}`
      : "";
    setMessages((current) => [...current, { role: "assistant", text: result.message + details, confirmScan: result.requires_confirmation }]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    setMessages((current) => [...current, { role: "user", text: value }]);
    setBusy(true);
    try {
      const command = value.match(/^\/(help|status|findings|demo-users|scan|reset)\s*$/i)?.[1]?.toLowerCase();
      if (command) await runCommand(command);
      else {
        const history = messages.slice(-10).map((item) => ({ role: item.role, content: item.text }));
        const result = await api<{ reply?: unknown }>("/api/assistant/chat", { method: "POST", body: JSON.stringify({ message: value, history }) });
        const reply = typeof result.reply === "string" && result.reply.trim()
          ? result.reply
          : "The assistant provider returned an empty reply. Check the selected model and server logs.";
        setMessages((current) => [...current, { role: "assistant", text: reply }]);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Request failed. Check that GuardLoop is running.";
      const message = detail.startsWith("404 ")
        ? "The backend process is still running an older version without the Assistant API. Stop the dev process with Ctrl+C, then restart it from the project root with: PATH=\"$PWD/.venv/bin:$PATH\" npm run dev"
        : detail;
      setMessages((current) => [...current, { role: "assistant", text: message }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      {!open ? (
        <Button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-50 h-12 rounded-full px-4 shadow-xl" aria-label="Open GuardLoop assistant">
          <Bot /> Assistant
        </Button>
      ) : (
        <aside aria-label="GuardLoop Assistant" className="fixed bottom-4 right-4 top-20 z-40 flex w-[min(370px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-400/10 text-teal-300"><Bot size={19} /></div>
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-100">GuardLoop Assistant</div><div className="flex items-center gap-1 text-[11px] text-slate-400"><ShieldCheck size={12} /> Local demo commands only</div></div>
            <Button variant="ghost" size="icon" aria-label="Collapse assistant" onClick={() => setOpen(false)}><ChevronDown /></Button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${index}-${message.role}`} className={`max-w-[94%] whitespace-pre-wrap rounded-xl px-3 py-2.5 text-sm leading-relaxed ${message.role === "user" ? "ml-auto bg-teal-500/15 text-teal-50" : "mr-auto border border-slate-800 bg-slate-900 text-slate-200"}`}>
                {message.text}
                {message.confirmScan && <Button size="sm" className="mt-3 w-full" disabled={busy} onClick={async () => { setBusy(true); try { await runCommand("scan", true); } catch (e) { setMessages((m) => [...m, { role: "assistant", text: e instanceof Error ? e.message : "Could not start scan." }]); } finally { setBusy(false); } }}>Confirm local scan</Button>}
              </div>
            ))}
            {busy && <div className="mr-auto flex items-center gap-2 px-3 py-2 text-xs text-slate-400"><LoaderCircle className="animate-spin" size={14} /> Working…</div>}
            <div ref={tail} />
          </div>
          <div className="border-t border-slate-800 px-3 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500"><Terminal size={12} /> /help · /status · /findings · /demo-users · /scan · /reset</div>
            <form onSubmit={submit} className="flex items-end gap-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Ask about the agents or enter a command…" rows={2} maxLength={4000} disabled={busy} className="max-h-32 min-h-12 resize-y border-slate-700 bg-slate-900 text-sm" aria-label="Message GuardLoop Assistant" />
              <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send message" className="h-10 w-10"><Send size={16} /></Button>
            </form>
            <div className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500"><Sparkles size={12} className="mt-0.5 shrink-0" /> AI explains and summarizes. Only exact slash commands can run actions.</div>
          </div>
        </aside>
      )}
    </>
  );
}
