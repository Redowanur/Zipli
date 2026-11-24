export type User = { id: number; email: string; plan: string; created_at: string };
export type Link = {
  id: number; code: string; target_url: string; disabled: boolean;
  expires_at?: string; created_at: string; short_url: string;
};
export type Bucket = { key: string; clicks: number };
export type Stats = {
  code: string; days: number; retention_days: number; total_clicks: number; unique_visitors: number;
  timeseries: Bucket[]; referrers: Bucket[]; countries: Bucket[];
  devices: Bucket[]; browsers: Bucket[]; os: Bucket[];
};
export type Overview = {
  days: number; retention_days: number; total_clicks: number; unique_visitors: number;
  timeseries: Bucket[]; by_link: Record<string, number>;
};

const KEY = "shorturl_token";
export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(KEY)),
  set: (t: string) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const post = (b: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(b) });

export const api = {
  register: (email: string, password: string) =>
    req<{ token: string; user: User }>("/api/auth/register", post({ email, password })),
  login: (email: string, password: string) =>
    req<{ token: string; user: User }>("/api/auth/login", post({ email, password })),
  shortenPublic: (url: string) => req<Link>("/api/links/public", post({ url })),
  me: () => req<{ user: User; link_limit: number; retention_days: number }>("/api/me"),
  links: () => req<{ links: Link[] }>("/api/links?limit=200"),
  createLink: (b: { url: string; alias?: string; expires_at?: string }) =>
    req<Link>("/api/links", post(b)),
  deleteLink: (code: string) => req<void>(`/api/links/${encodeURIComponent(code)}`, { method: "DELETE" }),
  setDisabled: (code: string, disabled: boolean) =>
    req<void>(`/api/links/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify({ disabled }) }),
  stats: (code: string, days: number) =>
    req<Stats>(`/api/links/${encodeURIComponent(code)}/stats?days=${days}`),
  overview: (days: number) => req<Overview>(`/api/stats/overview?days=${days}`),
};
