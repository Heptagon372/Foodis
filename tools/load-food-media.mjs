// 음식 미디어 적재: apps/web/lib/preview/media.json → Supabase (food_photos · food_youtube).
// 사용:
//   pnpm db:media [-- --dry-run]   (= node --env-file=apps/web/.env.local tools/load-food-media.mjs)
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/load-food-media.mjs [--dry-run]
// 전제: 0010_food_media.sql 실행 (food_photos · food_youtube 테이블).
// 전제: s08_load.py 로 foods 가 이미 올라가 있고 slug 가 media.json 키와 같아야 한다.
// 재실행 안전 (upsert). 음식마다 사진 전부 삭제 후 재적재해서 순서(rank)도 맞춘다.
import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const SUPA_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!SUPA_URL || !KEY)) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (또는 --dry-run).");
  process.exit(1);
}

const root = new URL("../", import.meta.url);
const media = JSON.parse(readFileSync(new URL("apps/web/lib/preview/media.json", root), "utf8"));

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path, { method = "GET", body, prefer, params } = {}) {
  const qs = params ? "?" + new URLSearchParams(params) : "";
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}${qs}`, {
    method,
    headers: prefer ? { ...H, Prefer: prefer } : H,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${await r.text()}`);
  // return=minimal 쓰기(201)는 본문이 비어 있다
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function chunked(rows, n, fn) {
  for (let i = 0; i < rows.length; i += n) await fn(rows.slice(i, i + n));
}

async function main() {
  const slugs = Object.keys(media);
  console.log(`[media] ${slugs.length}개 slug 로드`);

  // slug → id 매핑 (foods 테이블에서 가져오기). 페이지네이션 (PostgREST 기본 1000행)
  const slugToId = new Map();
  if (!DRY) {
    for (let from = 0; ; from += 1000) {
      const page = await rest("foods", { params: { select: "id,slug", order: "slug", offset: String(from), limit: "1000" } });
      page.forEach((r) => slugToId.set(r.slug, r.id));
      if (page.length < 1000) break;
    }
    console.log(`[media] foods 매핑 ${slugToId.size}개`);
  }

  const photos = [];
  const videos = [];
  const missing = [];
  for (const slug of slugs) {
    const id = DRY ? `dry-${slug}` : slugToId.get(slug);
    if (!id) { missing.push(slug); continue; }
    const m = media[slug];
    (m.gallery ?? []).forEach((p, i) => photos.push({
      food_id: id, url: p.url, thumb: p.thumb, title: p.title ?? null,
      source: p.source, license: p.license, credit_url: p.credit_url ?? null,
      author: p.author ?? null, fit: p.fit ?? 0, rank: i,
    }));
    if (m.youtube) videos.push({
      food_id: id, video_id: m.youtube.video_id, url: m.youtube.url, title: m.youtube.title,
      channel: m.youtube.channel, duration_sec: m.youtube.duration_sec,
      view_count: m.youtube.view_count, fit: m.youtube.fit ?? null,
    });
  }
  console.log(`[media] photos ${photos.length} · videos ${videos.length} · foods 매칭 안 됨 ${missing.length}`);
  if (missing.length) console.log(`  (예: ${missing.slice(0, 5).join(", ")})`);
  if (DRY) return;

  // 재적재 전 기존 사진 삭제 (rank 깔끔하게). food_id in (…) 로 한 번에.
  const touchedIds = [...new Set(photos.map((p) => p.food_id))];
  console.log(`[media] food_photos: 기존 ${touchedIds.length}개 음식 사진 삭제`);
  await chunked(touchedIds, 200, async (batch) => {
    await rest("food_photos", { method: "DELETE", params: { food_id: `in.(${batch.join(",")})` } });
  });

  console.log(`[media] food_photos: ${photos.length}행 insert`);
  await chunked(photos, 500, async (batch) => {
    await rest("food_photos", { method: "POST", body: batch, prefer: "return=minimal" });
  });

  console.log(`[media] food_youtube: ${videos.length}행 upsert`);
  await chunked(videos, 500, async (batch) => {
    await rest("food_youtube", { method: "POST", body: batch,
      prefer: "resolution=merge-duplicates,return=minimal", params: { on_conflict: "food_id" } });
  });

  console.log("[media] 완료");
}

main().catch((e) => { console.error(e); process.exit(1); });
