// 검색용 음식 색인 (docs/design/19 §5). 1만 개 × 가벼운 필드(이름·태그·조리법·코스·식이·알레르기·재료)만 메모리에 두고
// 질의 해석 · 하드 필터 · 점수 계산을 DB 왕복 없이 한다. 본문(소개·이야기)은 최종 후보 5개만 getFoods 로 가져온다.
import { canonAllergens } from "@/lib/diet/allergens";
import { checkDiet } from "@/lib/diet/consistency";
import { fameScore, nameIndexOf, nameKey, type NameIndex } from "./names";
import type { CountryRow, FoodName } from "./repo";
import type { DietKey, DietLevel } from "./schema";
import { INGREDIENT_STOP, normalizeTags } from "./vocab";

export type IngRole = "main" | "sub" | "seasoning";

/** 저장소(repo.foodIndex)가 돌려주는 행. 태그·재료는 아래 buildFoodIndex 가 정리한다 */
export type IndexedFood = {
  id: string;
  slug: string;
  name_ko: string;
  name_en: string;
  name_local?: string | null;
  country_code: string;
  tags: string[];
  method: string | null;
  course: string | null;
  diet: Record<DietKey, DietLevel>;
  allergens: string[];
  ingredients: { name: string; role: IngRole }[];
  fame_rank: number | null;
  /** 위키 언어판 수 — 세계적 유명도 (없으면 나라 안 순위만) */
  links?: number | null;
  has_image: boolean;
  has_story: boolean;
  has_history: boolean;
};

export type FoodIndex = {
  foods: IndexedFood[];
  byId: Map<string, IndexedFood>;
  continentOf: Map<string, string>;
  countryName: Map<string, string>;
  /** 재료 → 그 재료가 든 음식 수 (IDF 계산) */
  df: Map<string, number>;
  /** 재료 → 음식 번호 (비슷한 음식 후보 찾기) */
  byIngredient: Map<string, number[]>;
  /** 질문에 나올 수 있는 재료 낱말 → 재료 이름들 ("코코넛" → 코코넛, 코코넛 밀크, 코코넛 과육 …) */
  ingWords: Map<string, Set<string>>;
  names: NameIndex;
  foodNames: FoodName[];
};

/** 같은 재료의 다른 표기 → 하나로 (IDF·유사도가 갈라지지 않게) */
const ING_SYNONYM: Record<string, string> = {
  계란: "달걀", 쇠고기: "소고기", 쿠민: "커민", 칠리: "고추", 소젖: "우유", 우유: "우유", 밀가루반죽: "반죽", 빵반죽: "반죽", "다진 고기": "간 고기",
  "코코넛 우유": "코코넛 밀크", 식물성기름: "식용유", "식물성 기름": "식용유", 기: "기 버터", 고수잎: "고수", 쪽파: "파", 대파: "파",
};
export const canonIng = (name: string) => {
  const n = name.trim().replace(/\s+/g, " ");
  return ING_SYNONYM[n] ?? ING_SYNONYM[n.replace(/\s/g, "")] ?? n;
};

/** 한 글자지만 재료로 자주 묻는 말 (질문에서는 앞뒤 경계가 있을 때만 재료로 본다 — query.ts) */
export const ONE_CHAR_ING = new Set(["쌀", "꿀", "팥", "굴", "떡", "무", "김", "파"]);

const memo = new WeakMap<readonly IndexedFood[], FoodIndex>();

/** repo 가 같은 배열을 돌려주는 동안(캐시 10분) 색인을 다시 만들지 않는다 */
export function foodIndexOf(rows: readonly IndexedFood[], countries: readonly CountryRow[]): FoodIndex {
  let idx = memo.get(rows);
  if (!idx) memo.set(rows, (idx = buildFoodIndex(rows, countries)));
  return idx;
}

export function buildFoodIndex(rows: readonly IndexedFood[], countries: readonly CountryRow[]): FoodIndex {
  const all = rows.map((r): IndexedFood => {
    const n = normalizeTags(r.tags, r.method, r.course);
    const seen = new Set<string>();
    const ingredients = r.ingredients.flatMap((i) => {
      const name = canonIng(i.name);
      if (!name || seen.has(name)) return [];
      seen.add(name);
      return [{ name, role: i.role }];
    });
    // 식이 값이 재료와 모순이면(비건 yes 인데 우유) yes → depends (lib/diet/consistency.ts)
    const diet = checkDiet(r.diet, r.ingredients.map((i) => i.name)).diet;
    return { ...r, tags: n.tags, method: n.method, course: n.course, diet, allergens: canonAllergens(r.allergens), ingredients };
  });
  // 같은 나라 · 같은 이름(띄어쓰기 무시) 중복(1만 개 실DB 17쌍: dongaseu/tonkatsu …)은 검색에서 하나만 — 카드에 같은 음식이 두 번 뜨지 않게.
  // 남기는 쪽: 대표성 → 사진 → 재료 수. 버린 쪽 id 는 남긴 쪽으로 이어 준다(이름 인식·화면에서 보던 음식 id 로 물어도 같은 음식). DB 는 건드리지 않는다
  const keep = new Map<string, IndexedFood>();
  const rank = (f: IndexedFood) => fameScore(f.fame_rank, f.links) + (f.has_image ? 0.01 : 0) + f.ingredients.length * 0.001;
  for (const f of all) {
    const k = `${f.country_code}|${nameKey(f.name_ko)}`;
    const cur = keep.get(k);
    if (!cur || rank(f) > rank(cur)) keep.set(k, f);
  }
  const canonical = new Map(all.map((f) => [f.id, keep.get(`${f.country_code}|${nameKey(f.name_ko)}`)!]));
  const foods = all.filter((f) => canonical.get(f.id) === f);
  const df = new Map<string, number>();
  const byIngredient = new Map<string, number[]>();
  foods.forEach((f, i) => {
    for (const ing of f.ingredients) {
      df.set(ing.name, (df.get(ing.name) ?? 0) + 1);
      (byIngredient.get(ing.name) ?? byIngredient.set(ing.name, []).get(ing.name)!).push(i);
    }
  });
  const ingWords = new Map<string, Set<string>>();
  const addWord = (w: string, ing: string) => (ingWords.get(w) ?? ingWords.set(w, new Set()).get(w)!).add(ing);
  for (const [ing, n] of df) {
    if (n < 2) continue; // 한 번만 나온 재료 이름은 질문 낱말로 쓰지 않는다 (오탐 방지)
    const whole = ing.replace(/\s/g, "");
    if (whole.length >= 2 && !INGREDIENT_STOP.has(ing) && /^[가-힣]+$/.test(whole)) addWord(whole, ing);
    if (ONE_CHAR_ING.has(whole)) addWord(whole, ing);
    for (const tok of ing.split(" ")) if (tok.length >= 2 && tok !== whole && !INGREDIENT_STOP.has(tok) && /^[가-힣]+$/.test(tok)) addWord(tok, ing);
  }
  const foodNames: FoodName[] = all
    .map((f) => {
      const c = canonical.get(f.id)!; // 중복의 영문 이름(tonkatsu)도 남긴 음식(dongaseu)을 가리킨다
      return { id: c.id, name_ko: f.name_ko, name_en: f.name_en, name_local: f.name_local ?? null, country_code: c.country_code, fame_rank: c.fame_rank, links: c.links ?? null };
    })
    // 유명한 음식 먼저 → 음성 인식 키워드 힌트(앞에서 N개)가 가장 물어볼 법한 이름이 된다
    .sort((a, b) => fameScore(b.fame_rank, b.links) - fameScore(a.fame_rank, a.links));
  return {
    foods,
    byId: new Map(all.map((f) => [f.id, canonical.get(f.id)!])),
    continentOf: new Map(countries.map((c) => [c.code, c.continent_group])),
    countryName: new Map(countries.map((c) => [c.code, c.name_ko])),
    df,
    byIngredient,
    ingWords,
    names: nameIndexOf(foodNames),
    foodNames,
  };
}

/** 역문서빈도 ln((N+1)/(df+1)) — 설탕·소금처럼 흔한 재료일수록 0 에 가깝다 */
export const idf = (idx: FoodIndex, ing: string) => Math.log((idx.foods.length + 1) / ((idx.df.get(ing) ?? 0) + 1));
