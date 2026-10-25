import { clearAuthTokenCache, getNeonJwt } from "../auth";

export async function api<T>(path: string, opts?: RequestInit, retry = true): Promise<T> {
  const token = await getNeonJwt();
  const headers = new Headers(opts?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const r = await fetch(path, { ...opts, credentials: "same-origin", headers });
  if (r.status === 401 && retry) {
    clearAuthTokenCache();
    return api<T>(path, opts, false);
  }
  if (!r.ok) {
    let detail = "";
    try {
      const j = await r.json();
      detail = (j as { detail?: string }).detail || JSON.stringify(j);
    } catch {
      detail = r.statusText;
    }
    throw new Error(`${r.status} ${detail}`);
  }
  return (await r.json()) as T;
}
