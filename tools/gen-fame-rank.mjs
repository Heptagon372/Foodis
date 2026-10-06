// 나라 안 유명도 순위(fame_rank) 생성: 지도·홈·취향 엔진의 "대표 음식"이 이 순위를 쓴다.
//   NEXT_PUBLIC_SUPABASE_URL=.. NEXT_PUBLIC_SUPABASE_ANON_KEY=.. node tools/gen-fame-rank.mjs
// 순위: ① dish_targets.csv 에서 사람이 고른 음식(시드 순서 = 대표성 순) → ② 나머지는 Wikidata 언어판 수 많은 순
// 출력: apps/web/lib/content/fame.json { slug: rank } + popularity.json { slug: 위키 언어판 수 } (세계적 유명도 — 푸디 점수식 s_fame, docs/design/19 §6).
// Wikidata 응답은 foodis-data/data/raw/sitelinks.json 에 캐시.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const UA = process.env.FOODIS_USER_AGENT ?? "FoodisDataBot/0.1 (fame rank)";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const foods = [];
for (let off = 0; ; off += 1000) {
  const p = await (await fetch(`${URL_}/rest/v1/foods?select=slug,country_code,wikidata_qid&order=id&offset=${off}&limit=1000`, { headers: H })).json();
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
const fame = {};
for (const list of byCountry.values()) {
  list.sort((a, b) => {
    const ma = manual.get(a.slug), mb = manual.get(b.slug);
    if (ma != null || mb != null) return (ma ?? Infinity) - (mb ?? Infinity);
    return (sitelinks[b.wikidata_qid] ?? 0) - (sitelinks[a.wikidata_qid] ?? 0) || a.slug.localeCompare(b.slug);
  });
  list.forEach((f, i) => (fame[f.slug] = i + 1));
}
writeFileSync("apps/web/lib/content/fame.json", JSON.stringify(fame));
const popularity = Object.fromEntries(foods.filter((f) => sitelinks[f.wikidata_qid] != null).map((f) => [f.slug, sitelinks[f.wikidata_qid]]));
writeFileSync("apps/web/lib/content/popularity.json", JSON.stringify(popularity));
console.log(`[fame] 세계 유명도 ${Object.keys(popularity).length}개 → apps/web/lib/content/popularity.json`);
console.log(`[fame] ${Object.keys(fame).length}개 순위 → apps/web/lib/content/fame.json`);
for (const cc of ["KR", "JP", "IT", "TH", "MX", "IN"]) console.log(cc, (byCountry.get(cc) ?? []).slice(0, 5).map((f) => f.slug).join(" "));
