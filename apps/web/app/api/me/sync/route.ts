// POST /api/me/sync — 로그인 사용자의 Passport · 식이 조건 · 취향 동기화 (F-AUTH-02, 07 문서 /api/me/*)
// 본인 확인은 세션 쿠키(anon 키 + RLS 클라이언트)로, 쓰기는 service_role 로 user_id 를 고정해서 한다.
// 응답은 병합 결과 전체 — 브라우저는 이 값으로 로컬 상태를 맞춘다.
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { computeDna, mergeEntries, mergePrefs, SyncRequest, type EntryMap, type Prefs, type Status } from "@/lib/account/merge";
import { isLive } from "@/lib/content";
import { currentUserId, supabaseAdmin } from "@/lib/db/supabase-server";
import { rateLimit } from "@/lib/guard/ratelimit";

type FoodMeta = { id: string; slug: string; name_ko: string; country_code: string; taste_tags: string[]; countries: { flag_emoji: string } | null };

export async function POST(req: Request) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return jsonError(401, "unauthorized", "로그인이 필요해요");
  const limit = rateLimit(userId + ":sync", 30, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec);
  const body = await parseBody(req, SyncRequest);
  if (!body.ok) return body.res;
  if (!(await isLive())) return jsonError(409, "not_live", "실제 DB 연결 전(미리보기 모드)에는 계정에 저장하지 않아요");
  const { mode, prefs, entries } = body.data;
  const db = supabaseAdmin();

  const [pe, dp, pr] = await Promise.all([
    db.from("passport_entries").select("food_id, status, created_at").eq("user_id", userId),
    db.from("dietary_profiles").select("vegan, vegetarian, halal, gluten_free, dairy_free, allergens").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("tastes, onboarded").eq("user_id", userId).maybeSingle(),
  ]);
  const readErr = pe.error ?? dp.error ?? pr.error;
  if (readErr) return jsonError(500, "sync_read_failed", readErr.message);

  const server: EntryMap = new Map();
  for (const r of pe.data ?? []) {
    const e = server.get(r.food_id) ?? { statuses: new Set<Status>(), at: Date.parse(r.created_at) };
    e.statuses.add(r.status as Status);
    e.at = Math.min(e.at, Date.parse(r.created_at));
    server.set(r.food_id, e);
  }
  const serverPrefs: Prefs | null =
    dp.data || pr.data
      ? {
          diet: dp.data ? (["vegan", "vegetarian", "halal", "gluten_free", "dairy_free"] as const).filter((k) => dp.data![k]) : [],
          allergens: (dp.data?.allergens ?? []) as Prefs["allergens"],
          tastes: pr.data?.tastes ?? [],
          onboarded: pr.data?.onboarded ?? false,
        }
      : null;

  // DB 에 없는 음식(미리보기 샘플 id 등)은 버린다 — 응답에서 빠지고 이 기기에만 남는다
  const wanted = [...new Set([...server.keys(), ...entries.map((e) => e.food_id)])];
  const meta = new Map<string, FoodMeta>();
  for (let i = 0; i < wanted.length; i += 300) {
    const { data, error } = await db.from("foods").select("id, slug, name_ko, country_code, taste_tags, countries(flag_emoji)").in("id", wanted.slice(i, i + 300));
    if (error) return jsonError(500, "sync_read_failed", error.message);
    for (const f of (data ?? []) as unknown as FoodMeta[]) meta.set(f.id, f);
  }

  const { next, touched } = mergeEntries(mode, server, entries.filter((e) => meta.has(e.food_id)));
  const nextPrefs = mergePrefs(mode, serverPrefs, prefs);

  if (touched.length) {
    const del = await db.from("passport_entries").delete().eq("user_id", userId).in("food_id", touched);
    if (del.error) return jsonError(500, "sync_write_failed", del.error.message);
    const rows = touched.flatMap((id) => {
      const e = next.get(id)!;
      return [...e.statuses].map((status) => ({ user_id: userId, food_id: id, status, created_at: new Date(e.at).toISOString() }));
    });
    const ins = await db.from("passport_entries").insert(rows);
    if (ins.error) return jsonError(500, "sync_write_failed", ins.error.message);
  }
  const now = new Date().toISOString();
  if (nextPrefs && prefs) {
    const diet = Object.fromEntries((["vegan", "vegetarian", "halal", "gluten_free", "dairy_free"] as const).map((k) => [k, nextPrefs.diet.includes(k)]));
    const [a, b] = await Promise.all([
      db.from("dietary_profiles").upsert({ user_id: userId, ...diet, allergens: nextPrefs.allergens, updated_at: now }),
      db.from("profiles").upsert({ user_id: userId, tastes: nextPrefs.tastes, onboarded: nextPrefs.onboarded, updated_at: now }),
    ]);
    const err = a.error ?? b.error;
    if (err) return jsonError(500, "sync_write_failed", err.message);
  }
  if (touched.length || prefs) {
    const dna = computeDna(next, (id) => meta.get(id)?.taste_tags ?? [], nextPrefs?.tastes ?? []);
    await db.from("food_dna").upsert({ user_id: userId, tag_weights: dna, updated_at: now });
  }

  return Response.json({
    prefs: nextPrefs,
    entries: [...next].flatMap(([id, e]) => {
      const f = meta.get(id);
      return f ? [{ food_id: id, slug: f.slug, name_ko: f.name_ko, flag: f.countries?.flag_emoji ?? "", cc: f.country_code, tags: f.taste_tags, statuses: [...e.statuses], at: e.at }] : [];
    }),
  });
}
