// 알레르기 표기 통일 (docs/design/19 §2). DB 에는 두 가지 표기가 섞여 있다:
//   - 어드민·초기 280개: 영어 키 (nuts, dairy …) — schema.ts ALLERGENS
//   - 1만 개 정리본(2026-10-07 적재): 한국어 (우유, 밀, 계란, 어류 …)
// 사용자가 고르는 값은 영어 키라서, 한국어 값은 비교에 한 번도 걸리지 않았다 (땅콩 알레르기 사용자에게 땅콩 음식이 추천될 수 있었음).
// → DB 에서 읽는 순간 canonAllergens 로 키를 통일한다. SQL 필터(match_foods)에는 avoidTerms 로 두 표기를 다 넘긴다.
import type { Allergen } from "@/lib/foodi/schema";

/** 사용자가 고르는 9종(schema ALLERGENS) + 데이터에만 있는 7종. 추가 7종은 표시·경고용이고 선택지는 아니다 */
export type AllergenKey = Allergen | "mollusc" | "mustard" | "celery" | "buckwheat" | "sulfite" | "barley" | "rye";

/** 키 → DB 에 나올 수 있는 표기들 (첫 번째가 키 자신) */
const SYNONYMS: Record<AllergenKey, string[]> = {
  nuts: ["nuts", "견과", "견과류", "호두", "잣", "아몬드", "헤이즐넛", "캐슈너트", "피스타치오"],
  peanut: ["peanut", "땅콩"],
  shellfish: ["shellfish", "갑각류", "새우", "게", "가재", "랍스터"],
  fish: ["fish", "어류", "생선", "고등어"],
  egg: ["egg", "계란", "달걀", "난류", "알류"],
  soy: ["soy", "대두", "콩", "두류"],
  wheat: ["wheat", "밀", "밀가루"],
  dairy: ["dairy", "우유", "유제품", "유당"],
  sesame: ["sesame", "참깨", "깨"],
  mollusc: ["mollusc", "조개류", "오징어", "연체류", "홍합", "굴", "전복", "조개"],
  mustard: ["mustard", "겨자"],
  celery: ["celery", "셀러리"],
  buckwheat: ["buckwheat", "메밀"],
  sulfite: ["sulfite", "아황산류", "아황산염"],
  barley: ["barley", "보리"],
  rye: ["rye", "호밀"],
};

const TO_KEY = new Map<string, AllergenKey>(
  (Object.entries(SYNONYMS) as [AllergenKey, string[]][]).flatMap(([k, words]) => words.map((w) => [w.toLowerCase(), k] as const)),
);

export const ALLERGEN_KEYS = Object.keys(SYNONYMS) as AllergenKey[];

/** DB 값 → 표준 키. 모르는 표기는 그대로 둔다(버리면 경고가 사라진다). 중복 제거 */
export function canonAllergens(raw: readonly string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const a of raw ?? []) {
    const t = a.trim();
    if (t) out.add(TO_KEY.get(t.toLowerCase()) ?? t);
  }
  return [...out];
}

/** 사용자가 피하는 키 → SQL 배열 겹침(&&) 비교에 넘길 모든 표기. DB 가 정리되기 전·후 모두 걸린다 */
export const avoidTerms = (keys: readonly string[]): string[] => [...new Set(keys.flatMap((k) => SYNONYMS[k as AllergenKey] ?? [k]))];

/** 음식 알레르기(어느 표기든) 와 피하는 키(어느 표기든) 가 겹치나 */
export function hitsAllergen(foodAllergens: readonly string[], avoid: readonly string[]): boolean {
  if (!avoid.length || !foodAllergens.length) return false;
  const want = new Set(canonAllergens(avoid));
  return canonAllergens(foodAllergens).some((a) => want.has(a));
}

export const ALLERGEN_KO: Record<AllergenKey, string> = {
  nuts: "견과류", peanut: "땅콩", shellfish: "갑각류", fish: "생선", egg: "달걀", soy: "대두", wheat: "밀", dairy: "유제품", sesame: "참깨",
  mollusc: "조개·연체류", mustard: "겨자", celery: "셀러리", buckwheat: "메밀", sulfite: "아황산류", barley: "보리", rye: "호밀",
};
