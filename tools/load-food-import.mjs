// 외부에서 정리해 온 음식 JSONL → Supabase 적재 (foods · ingredients · food_ingredients · sources · food_relations).
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/load-food-import.mjs <file.jsonl> [--dry-run]
// 같은 slug 는 새 파일 내용으로 덮어쓰고 verified=true 로 노출한다. 덮어쓰기 전 기존 행을 data/raw/_backup_<날짜>/ 에 저장.
// 재료·출처·관계는 이 파일에 든 음식 것만 지우고 다시 넣는다 (다른 음식 데이터는 건드리지 않음).
// 알레르기는 파일 표기(한국어) 그대로 넣는다 — 앱이 읽을 때 표준 키로 바꾼다(apps/web/lib/diet/allergens.ts). DB 도 정리하려면 적재 뒤
// supabase/migrations/0015_allergen_keys.sql 을 다시 실행 (여러 번 실행해도 안전). 적재 뒤: pnpm db:fame (순위·세계 유명도) → apps/web 에서 pnpm embed:foods (임베딩)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const file = process.argv[2];
const DRY = process.argv.includes("--dry-run");
const BASE = process.env.SUPABASE_URL?.replace(/\/$/, "") + "/rest/v1";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !KEY) { console.error("사용: SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. node tools/load-food-import.mjs <file.jsonl> [--dry-run]"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path, { method = "GET", body, prefer, params } = {}) {
  const qs = params ? "?" + new URLSearchParams(params) : "";
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${BASE}/${path}${qs}`, { method, headers: prefer ? { ...H, Prefer: prefer } : H, body: body ? JSON.stringify(body) : undefined });
    if (r.ok) return r.status === 204 || method !== "GET" && !prefer?.includes("representation") ? null : r.json();
    const t = await r.text();
    if (attempt >= 3 || r.status < 500) throw new Error(`${method} ${path} ${r.status} ${t.slice(0, 500)}`);
    await new Promise((res) => setTimeout(res, 1000 * attempt));
  }
}
async function getAll(table, select, extra = {}) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const page = await rest(table, { params: { select, order: "id", offset: String(off), limit: "1000", ...extra } });
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
async function each(rows, n, fn) { for (const c of chunks(rows, n)) await fn(c); }
const slugify = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sourceId = (url) => url.includes("wikidata.org") ? "wikidata" : url.includes("commons.wikimedia.org") ? "wikimedia_commons" : url.includes("wikipedia.org") ? "wikipedia" : "foodis_review";

const rows = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
console.log(`[import] ${rows.length}건 읽음${DRY ? " (dry-run)" : ""}`);

// ── 국가: countries.csv 에 있는데 DB 에 없는 것만 추가
const csv = readFileSync("foodis-data/data/seed/countries.csv", "utf8").split(/\r?\n/).filter(Boolean);
const cols = csv[0].split(",");
const csvCountries = csv.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
const dbCountries = new Set((await getAll("countries", "code", { order: "code" })).map((c) => c.code));
const newCountries = csvCountries.filter((c) => !dbCountries.has(c.code));
console.log(`[countries] 추가 ${newCountries.length}개: ${newCountries.map((c) => c.code).join(" ")}`);
if (!DRY && newCountries.length) await rest("countries", { method: "POST", body: newCountries, prefer: "return=minimal" });

// ── 같은 Wikidata 음식이 DB 에 다른 slug 로 있으면 그 slug 로 맞춰 덮어쓴다 (중복 페이지 방지, 기존 URL 유지)
const dbFoods = await getAll("foods", "*");
const qidOf = (r) => r.sources.find((s) => s.url.includes("wikidata.org/wiki/Q"))?.url.match(/Q\d+/)?.[0];
{
  const fileSlugs = new Set(rows.map((r) => r.slug));
  const dbByQid = new Map(dbFoods.filter((f) => f.wikidata_qid && !fileSlugs.has(f.slug)).map((f) => [f.wikidata_qid, f.slug]));
  let remapped = 0;
  for (const r of rows) {
    const existing = dbByQid.get(qidOf(r));
    if (existing) { r.slug = existing; remapped++; }
  }
  console.log(`[foods] 같은 Wikidata 음식이라 기존 slug 로 맞춘 것 ${remapped}개`);
}

// ── 기존 음식 백업 + wikidata_qid 충돌 확인
const slugs = new Set(rows.map((r) => r.slug));
const overlap = dbFoods.filter((f) => slugs.has(f.slug));
const qidOwner = new Map(dbFoods.filter((f) => f.wikidata_qid && !slugs.has(f.slug)).map((f) => [f.wikidata_qid, f.slug]));
console.log(`[foods] DB ${dbFoods.length}개 · 덮어쓰기 ${overlap.length} · 신규 ${rows.length - overlap.length}`);
const backupDir = `foodis-data/data/raw/_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${file.split(/[\\/]/).pop().replace(/\.jsonl$/, "")}`;
if (existsSync(`${backupDir}/foods_before_import.json`)) console.log(`[backup] ${backupDir} 에 이미 있음 — 처음 백업을 보존하고 건너뜀`);
else if (!DRY) {
  const dir = backupDir;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/foods_before_import.json`, JSON.stringify(overlap));
  const oldSources = [];
  for (const c of chunks(overlap.map((f) => f.id), 150)) oldSources.push(...(await rest("sources", { params: { select: "*", food_id: `in.(${c.join(",")})` } })));
  writeFileSync(`${dir}/sources_before_import.json`, JSON.stringify(oldSources));
  console.log(`[backup] ${dir} — foods ${overlap.length} · sources ${oldSources.length}`);
}

// ── foods upsert
const qidSeen = new Set();
let qidDropped = 0;
const today = new Date().toISOString().slice(0, 10);
const foodRows = rows.map((r) => {
  const qidUrl = r.sources.find((s) => s.url.includes("wikidata.org/wiki/Q"))?.url;
  let qid = qidUrl?.match(/Q\d+/)?.[0] ?? null;
  if (qid && (qidOwner.has(qid) || qidSeen.has(qid))) { qid = null; qidDropped++; }
  if (qid) qidSeen.add(qid);
  const wiki = (lang) => r.sources.find((s) => s.url.includes(`${lang}.wikipedia.org`))?.url ?? null;
  return {
    slug: r.slug, name_ko: r.name_ko, name_en: r.name_en, name_local: r.name_local ?? null,
    country_code: r.country_code, region_in_country: r.region_in_country ?? null, origin_note: r.origin_note ?? null,
    summary: r.summary ?? null, history: r.history ?? null, culture_story: r.culture_story ?? null,
    cooking_method: r.cooking_method ?? null, taste_tags: r.taste_tags ?? [], course_type: r.course_type ?? null,
    image_url: r.image_url ?? null, image_credit: r.image_credit ?? null,
    diet_vegan: r.diet.vegan, diet_vegetarian: r.diet.vegetarian, diet_halal: r.diet.halal, diet_gluten_free: r.diet.gluten_free, diet_dairy_free: r.diet.dairy_free,
    allergens: r.allergens ?? [], diet_note: r.diet_note ?? null,
    wikidata_qid: qid, wikipedia_en: wiki("en"), wikipedia_ko: wiki("ko"),
    verified: true, verified_at: today, updated_at: new Date().toISOString(),
  };
});
console.log(`[foods] upsert ${foodRows.length}행 (qid 충돌로 비운 것 ${qidDropped})`);
// qid 는 unique 라 파일 안 음식끼리 qid 를 주고받으면 배치 순서에 따라 충돌한다 → 먼저 비우고 다시 채운다
const upsertFoods = (list) => each(list, 500, (b) => rest("foods", { method: "POST", body: b, prefer: "resolution=merge-duplicates,return=minimal", params: { on_conflict: "slug" } }));
if (!DRY) {
  await upsertFoods(foodRows.map((f) => ({ ...f, wikidata_qid: null })));
  await upsertFoods(foodRows);
}

// ── 이후 단계용 slug → id (dry-run 은 가짜 id)
const allFoods = DRY ? [...dbFoods, ...rows.filter((r) => !dbFoods.some((f) => f.slug === r.slug)).map((r) => ({ id: `dry-${r.slug}`, slug: r.slug, name_en: r.name_en, name_ko: r.name_ko }))]
  : await getAll("foods", "id,slug,name_en,name_ko");
const idOf = new Map(allFoods.map((f) => [f.slug, f.id]));
const importIds = rows.map((r) => idOf.get(r.slug));

// ── ingredients + food_ingredients
const ings = new Map();
const links = new Map();
for (const r of rows) for (const i of r.ingredients ?? []) {
  const slug = slugify(i.name_en || "") || slugify(i.name_ko);
  if (!slug) continue;
  if (!ings.has(slug)) ings.set(slug, { slug, name_ko: i.name_ko, name_en: i.name_en || i.name_ko });
  links.set(`${r.slug}|${slug}`, { food: r.slug, ing: slug, role: i.role });
}
console.log(`[ingredients] ${ings.size}종 · 연결 ${links.size}개`);
if (!DRY) {
  await each([...ings.values()], 500, (b) => rest("ingredients", { method: "POST", body: b, prefer: "resolution=merge-duplicates,return=minimal", params: { on_conflict: "slug" } }));
  const ingId = new Map((await getAll("ingredients", "id,slug")).map((i) => [i.slug, i.id]));
  await each(importIds, 150, (c) => rest("food_ingredients", { method: "DELETE", params: { food_id: `in.(${c.join(",")})` } }));
  const fi = [...links.values()].map((l) => ({ food_id: idOf.get(l.food), ingredient_id: ingId.get(l.ing), role: l.role }));
  await each(fi, 1000, (b) => rest("food_ingredients", { method: "POST", body: b, prefer: "return=minimal" }));
}

// ── sources
const src = new Map();
for (const r of rows) for (const s of r.sources ?? []) {
  const k = `${r.slug}|${s.field}|${s.url}`;
  if (!src.has(k)) src.set(k, { food_id: idOf.get(r.slug), field: s.field, url: s.url, title: s.title ?? null, license: s.license ?? null, source_type: sourceId(s.url), data_source_id: sourceId(s.url) });
}
console.log(`[sources] ${src.size}행`);
if (!DRY) {
  await each(importIds, 150, (c) => rest("sources", { method: "DELETE", params: { food_id: `in.(${c.join(",")})` } }));
  await each([...src.values()], 1000, (b) => rest("sources", { method: "POST", body: b, prefer: "return=minimal" }));
}

// ── relations: to_name 을 DB 음식 slug·영문명·한국어명으로 찾는다. 못 찾으면 건너뜀
const nameIdx = new Map();
for (const f of allFoods) for (const k of [f.slug, slugify(f.name_en ?? ""), (f.name_ko ?? "").trim()]) if (k && !nameIdx.has(k)) nameIdx.set(k, f.id);
const rel = new Map();
let unresolved = 0;
for (const r of rows) for (const x of r.relations ?? []) {
  const to = nameIdx.get(slugify(x.to_name)) ?? nameIdx.get(x.to_name.trim());
  const from = idOf.get(r.slug);
  if (!to || to === from) { unresolved++; continue; }
  rel.set(`${from}|${to}|${x.type}`, { from_food_id: from, to_food_id: to, relation_type: x.type, description: x.description, strength: 3, verified: true });
}
console.log(`[relations] 연결 ${rel.size}개 · 상대 음식을 못 찾아 건너뜀 ${unresolved}개`);
if (!DRY) {
  await each(importIds, 150, (c) => rest("food_relations", { method: "DELETE", params: { from_food_id: `in.(${c.join(",")})` } }));
  await each([...rel.values()], 1000, (b) => rest("food_relations", { method: "POST", body: b, prefer: "return=minimal" }));
}
console.log(DRY ? "[import] dry-run 끝 — 아무것도 쓰지 않음" : "[import] 완료");
