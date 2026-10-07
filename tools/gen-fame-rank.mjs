// 나라 안 유명도 순위(fame_rank) · 세계 유명도(popularity) 를 DB(foods 컬럼, 0014)에 매긴다: 지도·홈·맛집탐방·라디오·취향 엔진의 "대표 음식"이 이 순위를 쓴다.
//   pnpm db:fame              (= node --env-file=apps/web/.env.local tools/gen-fame-rank.mjs)
//   pnpm db:fame -- --dry-run (DB 에 쓰지 않고 나라별 상위만 출력)
// 순위: ① dish_targets.csv 에서 사람이 고른 음식(시드 순서 = 대표성 순) → ② 나머지는 Wikidata 언어판 수 많은 순
// popularity = Wikidata 언어판 수. Wikidata 응답은 foodis-data/data/raw/sitelinks.json 에 캐시.
// 쓰기는 set_food_fame(jsonb) 함수(0014, service_role 전용) — 값이 바뀐 행만 고친다. 음식을 새로 적재한 뒤 다시 돌리면 된다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry-run");
const UA = process.env.FOODIS_USER_AGENT ?? "FoodisDataBot/0.1 (fame rank)";
if (!URL_ || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (pnpm db:fame 은 apps/web/.env.local 을 읽는다)");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// 공개(검수된) 음식만 순위를 매긴다 — 화면에 보이는 것과 같은 집합
const foods = [];
for (let off = 0; ; off += 1000) {
  const r = await fetch(`${URL_}/rest/v1/foods?select=slug,country_code,wikidata_qid&verified=eq.true&order=id&offset=${off}&limit=1000`, { headers: H });
  if (!r.ok) throw new Error(`foods ${r.status} ${await r.text()}`);
  const p = await r.json();
  foods.push(...p);
  if (p.length < 1000) break;
}
console.log(`[fame] 공개 음식 ${foods.length}개`);

const CACHE = "foodis-data/data/raw/sitelinks.json";
mkdirSync("foodis-data/data/raw", { recursive: true });
const sitelinks = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const need = [...new Set(foods.map((f) => f.wikidata_qid).filter((q) => q && !(q in sitelinks)))];
for (let i = 0; i < need.length; i += 50) {
  const ids = need.slice(i, i + 50).join("|");
  const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=sitelinks&format=json`, { headers: { "User-Agent": UA } });
  const j = await r.json();
  for (const [q, e] of Object.entries(j.entities ?? {})) sitelinks[q] = Object.keys(e.sitelinks ?? {}).filter((k) => k.endsWith("wiki") && k !== "commonswiki").length;
  if (i % 1000 === 0) console.log(`[fame] Wikidata ${i + 50}/${need.length}`);
  await new Promise((res) => setTimeout(res, 200));
}
writeFileSync(CACHE, JSON.stringify(sitelinks));

// 사람이 고른 대표 음식: dish_targets.csv 중 "자동 후보" 가 아닌 줄, 파일 순서가 대표성 순
const manual = new Map();
readFileSync("foodis-data/data/seed/dish_targets.csv", "utf8").split(/\r?\n/).slice(1).filter(Boolean).forEach((line, i) => {
  if (!line.includes("자동 후보")) manual.set(line.split(",")[0], i);
});

const byCountry = new Map();
for (const f of foods) (byCountry.get(f.country_code) ?? byCountry.set(f.country_code, []).get(f.country_code)).push(f);
const ranks = {};
for (const list of byCountry.values()) {
  list.sort((a, b) => {
    const ma = manual.get(a.slug), mb = manual.get(b.slug);
    if (ma != null || mb != null) return (ma ?? Infinity) - (mb ?? Infinity);
    return (sitelinks[b.wikidata_qid] ?? 0) - (sitelinks[a.wikidata_qid] ?? 0) || a.slug.localeCompare(b.slug);
  });
  list.forEach((f, i) => (ranks[f.slug] = { rank: i + 1, popularity: sitelinks[f.wikidata_qid] ?? null }));
}
for (const cc of ["KR", "JP", "IT", "TH", "MX", "IN"]) console.log(cc, (byCountry.get(cc) ?? []).slice(0, 5).map((f) => f.slug).join(" "));
if (DRY) {
  console.log(`[fame] dry-run — ${Object.keys(ranks).length}개 순위를 계산만 함`);
  process.exit(0);
}

// 2,000개씩 나눠 보낸다 (요청 본문 크기)
const entries = Object.entries(ranks);
let changed = 0;
for (let i = 0; i < entries.length; i += 2000) {
  const r = await fetch(`${URL_}/rest/v1/rpc/set_food_fame`, { method: "POST", headers: H, body: JSON.stringify({ ranks: Object.fromEntries(entries.slice(i, i + 2000)) }) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(r.status === 404 ? `set_food_fame 함수가 없어요 — supabase/migrations/0014_food_catalog.sql 을 먼저 실행하세요 (${t.slice(0, 200)})` : `set_food_fame ${r.status} ${t.slice(0, 500)}`);
  }
  changed += await r.json();
}
console.log(`[fame] ${entries.length}개 순위 → DB (바뀐 행 ${changed}개)`);
