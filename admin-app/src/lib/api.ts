// One client for /admin/api/*. Every call goes through here so auth failure,
// loading and error handling are answered once rather than per component.
//
// The Worker verifies the Cloudflare Access JWT on every one of these, so a
// 403 here means the session lapsed — the honest response is to send the
// person back through Access, not to render an empty dashboard that looks
// like "no data".

export class AuthLapsed extends Error {}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/admin/api${path}`, { headers: { Accept: "application/json" } });
  if (r.status === 401 || r.status === 403) throw new AuthLapsed("session expired");
  const body = await r.json().catch(() => ({ error: "unreadable response" }));
  if (!r.ok || (body as { ok?: boolean }).ok === false) {
    throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
  }
  return body as T;
}

export interface Code {
  slug: string; dest: string; rule: string | null; label: string;
  surface: string | null; notes: string | null; active: boolean; url: string;
  scans: { scans: number; days: number; ios: number; android: number; other: number; last_scan: string | null };
  money: { gifts: number; dollars: number; last_gift: string | null };
}
export interface Analytics {
  days: number; since: string;
  daily: { day: string; n: number }[];
  byCode: { slug: string; n: number }[];
  byCity: { city: string; region: string; country: string; lat: string; lon: string; n: number }[];
  byDevice: { k: string; n: number }[];
  byBrowser: { k: string; n: number }[];
  byOs: { k: string; n: number }[];
  gifts: { slug: string; gifts: number; dollars: number }[];
  totals: { scans: number; cities: number; days: number; likely_bots: number };
}
export interface HistoryEvent {
  slug: string; action: string; old_dest: string | null;
  new_dest: string | null; actor: string | null; at: string;
}

export const api = {
  codes: () => get<{ you: string; codes: Code[] }>("/codes"),
  analytics: (days: number) => get<Analytics>(`/analytics?days=${days}`),
  history: () => get<{ events: HistoryEvent[] }>("/history"),
};
