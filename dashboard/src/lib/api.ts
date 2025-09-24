export type Query = Record<string, string | number | boolean | undefined | null>;

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';

export const endpoints = {
  summary: `/api/summary`,
  timeline: `/api/timeline`,
  advicePayload: `/api/advice/payload`,
  advice: `/api/advice`,
  adviceStatus: `/api/advice/status`,
};

function buildQuery(qs?: Query): string {
  if (!qs) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function buildUrl(path: string, qs?: Query): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}${buildQuery(qs)}`;
}

export async function apiGet<T>(path: string, qs?: Query): Promise<T> {
  const res = await fetch(buildUrl(path, qs), { method: 'GET' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  qs?: Query,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(buildUrl(path, qs), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}
