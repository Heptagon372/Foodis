// 1만 개 정리본(foodis-data/data/import/foodis_foods_10000.jsonl)을 그대로 읽는 메모리 FoodisRepo — 네트워크 없이
// 실서비스와 같은 데이터로 검색·랭킹을 검증한다 (data10k.test.ts · scripts/eval-retrieval-10k.ts). 임베딩은 없다(의미 신호 꺼짐).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import FAME from "@/lib/content/fame.json";
import POPULARITY from "@/lib/content/popularity.json";
import { fameScore } from "../names";
import { canonAllergens } from "@/lib/diet/allergens";
import { checkDiet } from "@/lib/diet/consistency";
import type { IndexedFood, IngRole } from "../food-index";
import { emptyDiet, type CountryRow, type FoodisRepo, type FoodRow } from "../repo";
import { DIET_KEYS, type DietKey, type DietLevel } from "../schema";

const ROOT = resolve(__dirname, "../../../../..");
export const IMPORT_FILE = resolve(ROOT, "foodis-data/data/import/foodis_foods_10000.jsonl");
const COUNTRIES_FILE = resolve(ROOT, "foodis-data/data/seed/countries.csv");
export const hasImportData = () => existsSync(IMPORT_FILE) && existsSync(COUNTRIES_FILE);

type Raw = {
  slug: string; name_ko: string; name_en: string; name_local?: string | null; country_code: string; region_in_country?: string | null;
  origin_note?: string | null; summary?: string | null; history?: string | null; culture_story?: string | null; taste_tags?: string[];
  cooking_method?: string | null; course_type?: string | null; ingredients?: { name_ko: string; name_en?: string; role: string }[];
  diet: Record<DietKey, DietLevel>; allergens?: string[]; diet_note?: string | null; relations?: { to_name: string; type: string }[];
  image_url?: string | null; image_credit?: string | null; sources?: { url: string; title?: string }[];
};

/** uuid 모양 id (AskRequest 가 uuid 를 검사한다) */
export const importId = (i: number) => `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`;

export type ImportData = { raws: Raw[]; rows: IndexedFood[]; countries: (CountryRow & { flag_emoji: string; accent_color: string })[]; idOf: Map<string, string> };

let cached: ImportData | undefined;
export function loadImport(): ImportData {
  if (cached) return cached;
  const fame = FAME as Record<string, number>;
  const raws = readFileSync(IMPORT_FILE, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Raw);
  const csv = readFileSync(COUNTRIES_FILE, "utf8").split(/\r?\n/).filter(Boolean);
  const cols = csv[0].split(",");
  const countries = csv.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v]))) as unknown as ImportData["countries"];
  const idOf = new Map(raws.map((r, i) => [r.slug, importId(i)]));
  const rows: IndexedFood[] = raws.map((r, i) => ({
    id: importId(i), slug: r.slug, name_ko: r.name_ko, name_en: r.name_en, name_local: r.name_local ?? null, country_code: r.country_code,
    tags: r.taste_tags ?? [], method: r.cooking_method ?? null, course: r.course_type ?? null,
    diet: Object.fromEntries(DIET_KEYS.map((k) => [k, r.diet[k] ?? "unknown"])) as Record<DietKey, DietLevel>,
    allergens: canonAllergens(r.allergens), ingredients: (r.ingredients ?? []).map((x) => ({ name: x.name_ko, role: x.role as IngRole })),
    fame_rank: fame[r.slug] ?? null, links: (POPULARITY as Record<string, number>)[r.slug] ?? null, has_image: Boolean(r.image_url), has_story: Boolean(r.culture_story), has_history: Boolean(r.history),
  }));
  cached = { raws, rows, countries, idOf };
  return cached;
}

export function importRepo(): FoodisRepo {
  const d = loadImport();
  const byId = new Map(d.raws.map((r, i) => [importId(i), r]));
  const country = new Map(d.countries.map((c) => [c.code, c]));
  const nameIdx = new Map<string, string>();
  d.raws.forEach((r, i) => [r.slug, r.name_en.toLowerCase(), r.name_ko].forEach((k) => nameIdx.has(k) || nameIdx.set(k, importId(i))));
  const rel = new Map<string, { id: string; type: string }[]>();
  d.raws.forEach((r, i) => {
    for (const x of r.relations ?? []) {
      const to = nameIdx.get(x.to_name.toLowerCase()) ?? nameIdx.get(x.to_name);
      if (!to || to === importId(i)) continue;
      (rel.get(importId(i)) ?? rel.set(importId(i), []).get(importId(i))!).push({ id: to, type: x.type });
      (rel.get(to) ?? rel.set(to, []).get(to)!).push({ id: importId(i), type: x.type });
    }
  });
  const toRow = (id: string): FoodRow => {
    const r = byId.get(id)!;
    const c = country.get(r.country_code)!;
    return {
      id, slug: r.slug, name_ko: r.name_ko, name_en: r.name_en, country_code: r.country_code, origin_note: r.origin_note ?? null, summary: r.summary ?? null,
      history: r.history ?? null, culture_story: r.culture_story ?? null, region_in_country: r.region_in_country ?? null, cooking_method: r.cooking_method ?? null,
      course_type: r.course_type ?? null, ingredients: (r.ingredients ?? []).map((x) => x.name_ko), taste_tags: r.taste_tags ?? [], image_url: r.image_url ?? null,
      image_credit: r.image_credit ?? null, allergens: canonAllergens(r.allergens), diet: checkDiet(d.rows[Number(id.slice(-12))].diet, (r.ingredients ?? []).map((x) => x.name_ko)).diet, diet_note: r.diet_note ?? null,
      country: { name_ko: c?.name_ko ?? r.country_code, flag_emoji: c?.flag_emoji ?? "", accent_color: c?.accent_color ?? "#888" },
      sources: (r.sources ?? []).map((s) => ({ title: s.title ?? null, url: s.url })),
    };
  };
  const names = d.rows
    .map((f) => ({ id: f.id, name_ko: f.name_ko, name_en: f.name_en, name_local: f.name_local, country_code: f.country_code, fame_rank: f.fame_rank, links: f.links }))
    .sort((a, b) => fameScore(b.fame_rank, b.links) - fameScore(a.fame_rank, a.links));
  return {
    foodIndex: async () => d.rows,
    vectorSearch: async () => [],
    neighbors: async () => [],
    relationsOf: async (id) => rel.get(id) ?? [],
    getFoods: async (ids) => ids.filter((id) => byId.has(id)).map(toRow),
    getRelatedFoodIds: async (id, limit, type) => (rel.get(id) ?? []).filter((r) => !type || r.type === type).slice(0, limit).map((r) => r.id),
    allFoodNames: async () => names,
    countries: async () => d.countries.map(({ code, name_ko, name_en, continent_group }) => ({ code, name_ko, name_en, continent_group })),
    getUserContext: async (userId) => ({ userId, diet: emptyDiet(), allergens: [], tagWeights: {}, exploredCountries: [], exploredFoodIds: [] }),
    recordConversation: async () => null,
    recordUsage: async () => {},
    markExplored: async () => {},
    usageTodayUsd: async () => 0,
    cacheGet: async () => null,
    cacheSet: async () => {},
  };
}
