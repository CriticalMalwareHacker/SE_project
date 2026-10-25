import { create } from "zustand";
import type { Finding, Metrics, ScanState, Settings } from "./api/types";
import { api } from "./api/client";
import { clearAuthTokenCache, getNeonJwt } from "./auth";

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
  reset: () => void;
}

let streamController: AbortController | null = null;

export function disconnectSSE(): void {
  streamController?.abort();
  streamController = null;
}

export function connectSSE(scanId: string, onEvent: (e: BusEvent) => void, lastId = 0): void {
  disconnectSSE();
  streamController = new AbortController();
  const signal = streamController.signal;
  void (async () => {
    let cursor = lastId;
    while (!signal.aborted) {
      try {
        const token = await getNeonJwt();
        if (!token) return;
        const url = `/api/scans/${scanId}/events${cursor ? `?lastEventId=${cursor}` : ""}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
        if (response.status === 401) {
          clearAuthTokenCache();
          return;
        }
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const id = frame.match(/^id:\s*(\d+)/m)?.[1];
            const data = frame.match(/^data:\s*(.+)$/m)?.[1];
            if (id) cursor = Number(id);
            if (data) {
              try { onEvent(JSON.parse(data) as BusEvent); } catch { /* ignore malformed SSE frames */ }
            }
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      if (!signal.aborted) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  })();
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
  reset: () => {
    disconnectSSE();
    set({
      mode: "mock",
      scanId: null,
      scan: null,
      events: [],
      settings: null,
      statusFilter: "all",
      severityFilter: "all",
      search: "",
      loopPulse: false,
    });
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
