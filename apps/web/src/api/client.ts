export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers || {}) } });
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
