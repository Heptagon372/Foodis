// 고정 창 속도 제한: /api/foodi/* 사용자·IP별 분당 10회 (11 문서 §7).
// 서버리스 인스턴스마다 메모리가 따로라 완벽하지 않다 — 베타 규모에선 충분하고, 필요하면 Upstash 등으로 교체.
const hits = new Map<string, { windowStart: number; count: number }>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const h = hits.get(key);
  if (!h || now - h.windowStart >= windowMs) {
    hits.set(key, { windowStart: now, count: 1 });
    if (hits.size > 5_000) for (const [k, v] of hits) if (now - v.windowStart >= windowMs) hits.delete(k);
    return { ok: true, retryAfterSec: 0 };
  }
  h.count++;
  return h.count <= limit ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.ceil((h.windowStart + windowMs - now) / 1000) };
}

export function clientKey(req: Request, userId: string | null): string {
  if (userId) return `u:${userId}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return `ip:${ip}`;
}
