import { create } from "zustand";
import type { Finding, Metrics, ScanState, Settings } from "./api/types";
import { api } from "./api/client";

export interface BusEvent {
  id: number;
  scan_id: string;
  seq: number;
  type: string;
  agent: string;
  message: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

interface Store {
  mode: string;
  scanId: string | null;
  scan: ScanState | null;
  events: BusEvent[];
  settings: Settings | null;
  statusFilter: string;
  severityFilter: string;
  search: string;
  loopPulse: boolean;
  loadMode: () => Promise<void>;
  loadSettings: () => Promise<void>;
  startScan: (body: Record<string, unknown>) => Promise<void>;
  adoptScan: (scanId: string) => Promise<void>;
  refreshScan: () => Promise<void>;
  applyEvent: (e: BusEvent) => void;
  setFilters: (s: Partial<Pick<Store, "statusFilter" | "severityFilter" | "search">>) => void;
  control: (action: string, body?: Record<string, unknown>) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
}

let es: EventSource | null = null;

export function disconnectSSE(): void {
  if (es) {
    es.close();
    es = null;
  }
}

export function connectSSE(scanId: string, onEvent: (e: BusEvent) => void, lastId = 0): void {
  disconnectSSE();
  const url = `/api/scans/${scanId}/events${lastId ? `?lastEventId=${lastId}` : ""}`;
  es = new EventSource(url);
  es.onmessage = (m: MessageEvent) => {
    try {
      onEvent(JSON.parse(m.data) as BusEvent);
    } catch {
      /* ignore */
    }
  };
  es.addEventListener("candidate", (m) => onEvent(JSON.parse((m as MessageEvent).data) as BusEvent));
  es.addEventListener("loopback", (m) => onEvent(JSON.parse((m as MessageEvent).data) as BusEvent));
  es.onerror = () => {
    // EventSource auto-reconnects; on reconnect Last-Event-ID is handled by browser for id: fields
  };
}

export const useStore = create<Store>((set, get) => ({
  mode: "mock",
  scanId: null,
  scan: null,
  events: [],
  settings: null,
  statusFilter: "all",
  severityFilter: "all",
  search: "",
  loopPulse: false,
  loadMode: async () => {
    const m = await api<{ mode: string }>("/api/mode");
    set({ mode: m.mode });
  },
  loadSettings: async () => {
    const s = await api<Settings>("/api/settings");
    set({ settings: s });
  },
  startScan: async (body) => {
    const r = await api<{ id: string }>("/api/scans", { method: "POST", body: JSON.stringify(body) });
    set({ scanId: r.id, events: [], scan: null });
    await get().refreshScan();
    connectSSE(r.id, get().applyEvent);
  },
  adoptScan: async (scanId) => {
    set({ scanId, events: [], scan: null });
    await get().refreshScan();
    connectSSE(scanId, get().applyEvent);
  },
  refreshScan: async () => {
    const { scanId } = get();
    if (!scanId) return;
    const s = await api<ScanState>(`/api/scans/${scanId}`);
    set({ scan: s });
  },
  applyEvent: (e) => {
    set((st) => ({ events: [...st.events.slice(-499), e], loopPulse: e.type === "loopback" ? true : st.loopPulse }));
    if (e.type === "loopback") {
      setTimeout(() => set({ loopPulse: false }), 2500);
    }
    // refresh lightweight: update findings if event carries finding id is complex; poll scan every event (cheap local)
    void get().refreshScan();
  },
  setFilters: (s) => set(s),
  control: async (action, body) => {
    const { scanId } = get();
    if (!scanId) return;
    await api(`/api/scans/${scanId}/${action}`, { method: "POST", body: JSON.stringify(body || {}) });
    await get().refreshScan();
  },
  saveSettings: async (s) => {
    const out = await api<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(s) });
    set({ settings: out });
  },
}));

export function filterFindings(findings: Finding[], search: string, status: string, severity: string): Finding[] {
  return findings.filter((f) => {
    if (status !== "all" && f.status !== status) return false;
    if (severity !== "all" && f.severity !== severity) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${f.id} ${f.title} ${f.endpoint}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function sortFindings(findings: Finding[], key: string, dir: 1 | -1): Finding[] {
  const arr = [...findings];
  arr.sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[key];
    const bv = (b as unknown as Record<string, unknown>)[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
  });
  return arr;
}

export function emptyMetrics(): Metrics {
  return { subtask_completion_rate: 0, reproducibility_score: 0, verified_remediation_rate: 0, time_to_mitigation_avg_s: null, ttm_trend: [] };
}
