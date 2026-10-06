// 외부에서 받은 음식 JSONL 검사: node tools/validate-food-import.mjs foodis-data/data/import/foodis_foods_6819.jsonl
import { readFileSync } from "node:fs";

const file = process.argv[2];
const rows = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l, i) => {
  try { return JSON.parse(l); } catch { return { __bad: i + 1 }; }
});
const countries = new Set(readFileSync("foodis-data/data/seed/countries.csv", "utf8").split(/\r?\n/).slice(1).map((l) => l.split(",")[0]).filter(Boolean));
const catalog = new Set(JSON.parse(readFileSync("apps/web/lib/preview/catalog.json", "utf8")).map((c) => c.s));

const TASTE = new Set("sour sweet salty bitter umami spicy fermented smoky nutty floral herbal rich light creamy crunchy chewy soft hot cold bread soup rice noodle meat seafood vegetable dairy egg fruit".split(" "));
const METHOD = new Set("boiled steamed grilled fried deep_fried stir_fried roasted baked raw fermented pickled smoked braised stewed cured".split(" "));
const COURSE = new Set("main side soup stew rice noodle bread dessert snack drink sauce breakfast".split(" "));
const DIET = new Set(["yes", "depends", "no", "unknown"]);
const REL = new Set(["similar_taste", "shares_ingredient", "same_technique", "historical_link", "regional_variant"]);
const ROLE = new Set(["main", "sub", "seasoning"]);

const issues = {};
const add = (k, slug) => ((issues[k] ??= []).push(slug));
const seen = new Map();
const stat = { summary: 0, history: 0, culture: 0, ingredients: 0, relations: 0, image: 0, sources: 0 };

for (const r of rows) {
  if (r.__bad) { add("JSON 파싱 실패(줄)", r.__bad); continue; }
  const s = r.slug;
  if (!s || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) add("slug 형식", s);
  seen.set(s, (seen.get(s) ?? 0) + 1);
  if (!r.name_ko || !r.name_en) add("이름 누락", s);
  if (!countries.has(r.country_code)) add(`국가코드 미등록`, `${s}(${r.country_code})`);
  for (const t of r.taste_tags ?? []) if (!TASTE.has(t)) add(`taste_tag 범위 밖`, `${s}:${t}`);
  if (r.cooking_method != null && !METHOD.has(r.cooking_method)) add("cooking_method 범위 밖", `${s}:${r.cooking_method}`);
  if (r.course_type != null && !COURSE.has(r.course_type)) add("course_type 범위 밖", `${s}:${r.course_type}`);
  for (const k of ["vegan", "vegetarian", "halal", "gluten_free", "dairy_free"]) if (!DIET.has(r.diet?.[k])) add("diet 값 누락/범위 밖", `${s}:${k}`);
  for (const i of r.ingredients ?? []) if (!ROLE.has(i.role) || !i.name_ko) add("재료 role/이름", s);
  for (const x of r.relations ?? []) if (!REL.has(x.type)) add("relation type 범위 밖", `${s}:${x.type}`);
  if (!(r.sources ?? []).length) add("sources 없음", s);
  for (const x of r.sources ?? []) if (!/^https?:\/\//.test(x.url ?? "")) add("source url 이상", s);
  if (r.image_url && !/^https:\/\/upload\.wikimedia\.org\//.test(r.image_url)) add("이미지 비-Wikimedia", s);
  if (catalog.has(s)) add("기존 catalog 2,147과 slug 겹침", s);
  if (r.summary) stat.summary++; if (r.history) stat.history++; if (r.culture_story) stat.culture++;
  if (r.ingredients?.length) stat.ingredients++; if (r.relations?.length) stat.relations++;
  if (r.image_url) stat.image++; if (r.sources?.length) stat.sources++;
}
for (const [s, n] of seen) if (n > 1) add("slug 중복", `${s}×${n}`);

console.log(`총 ${rows.length}건`);
console.log("채움률:", Object.fromEntries(Object.entries(stat).map(([k, v]) => [k, `${v} (${((v / rows.length) * 100).toFixed(1)}%)`])));
for (const [k, v] of Object.entries(issues)) {
  const uniq = [...new Set(v)];
  console.log(`\n[${k}] ${v.length}건 — 예: ${uniq.slice(0, 8).join(", ")}`);
}
