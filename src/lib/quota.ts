// Reading Google's 429 answers. The body names the exhausted quota (e.g. quotaId
// "GenerateRequestsPerDayPerProjectPerModel-FreeTier") and how long to wait ("retryDelay": "41s").

export interface QuotaInfo {
  /** A daily quota: waiting seconds does not help, it starts over at midnight Pacific time. */
  daily: boolean;
  /** Google's suggested wait before the next attempt. */
  retryAfterSec?: number;
  /** The exhausted limit, e.g. 20 requests. */
  limit?: number;
  /** The model the quota belongs to. */
  model?: string;
}

export function quotaInfo(e: unknown): QuotaInfo {
  const raw = e instanceof Error ? e.message : String(e);
  const ids = [...raw.matchAll(/"quotaId"\s*:\s*"([^"]+)"/g)].map((m) => m[1]!);
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(raw)?.[1] ?? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(raw)?.[1];
  const limit = /"quotaValue"\s*:\s*"(\d+)"/.exec(raw)?.[1] ?? /limit:\s*(\d+)/.exec(raw)?.[1];
  return {
    daily: ids.some((id) => /PerDay/i.test(id)) || (!ids.length && /per day/i.test(raw)),
    retryAfterSec: delay ? Math.ceil(Number(delay)) : undefined,
    limit: limit ? Number(limit) : undefined,
    model: /"model"\s*:\s*"([^"]+)"/.exec(raw)?.[1],
  };
}

/** When Google's daily quotas start over: midnight Pacific time, e.g. 09:00 in Germany. */
export function dailyQuotaReset(now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const sinceMidnightMs = ((parts.hour ?? 0) * 3600 + (parts.minute ?? 0) * 60 + (parts.second ?? 0)) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnightMs + 86_400_000);
}
