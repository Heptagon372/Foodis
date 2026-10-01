// 한국어 맛·재료 표현 → taste_tags (foodis-data/scripts/common.py TASTE_TAGS).
// 임베딩 장애 시 키워드 대체 검색(11 문서 §6)이 "꼬치구이 추천해줘"를 알아듣게 한다. 정상 경로에서는 임베딩이 이 역할을 한다.
const KO_TAGS: [RegExp, string][] = [
  [/매운|매콤|얼큰|칼칼/, "spicy"],
  [/발효|삭힌/, "fermented"],
  [/국물|수프|탕|찌개|스프/, "soupy"],
  [/달콤|단\s*거|디저트|단맛|달달/, "sweet"],
  [/새콤|상큼|시큼|신\s*맛/, "sour"],
  [/짭짤|짠\s*맛/, "salty"],
  [/감칠맛/, "umami"],
  [/훈제|훈연/, "smoky"],
  [/허브|향긋/, "herbal"],
  [/크리미|크림|부드러운/, "creamy"],
  [/바삭/, "crispy"],
  [/진한|묵직|든든/, "rich"],
  [/산뜻|가벼운|신선/, "fresh"],
  [/고소|견과/, "nutty"],
  [/구이|꼬치|숯불|바비큐|그릴/, "grilled"],
  [/튀김|튀긴/, "fried"],
  [/(^|\s)밥|쌀/, "rice"],
  [/국수|누들|라면|(^|\s)면(\s|$|요리)/, "noodle"],
  [/빵/, "bread"],
  [/만두/, "dumpling"],
  [/고기|육류/, "meat"],
  [/해산물|생선|바다/, "seafood"],
  [/채소|야채/, "vegetable"],
  [/콩/, "legume"],
  [/치즈|유제품\s*(좋|들어)/, "dairy"],
  [/길거리|간식|분식/, "street_food"],
];

export const tagsFromText = (text: string): string[] => KO_TAGS.filter(([re]) => re.test(text)).map(([, tag]) => tag);

/** 키워드 대체 검색의 순위: 이름이 불린 음식 → 맛 태그 겹침 → 안 가본 나라·Food DNA → 입력 순서 */
export function rankByKeywords<T extends { name_ko: string; name_en: string; country_code: string; taste_tags: string[] }>(rows: T[], text: string, explored: string[], tagWeights: Record<string, number> = {}): T[] {
  const q = text.toLowerCase();
  const tags = tagsFromText(text);
  const score = (f: T) =>
    (q.includes(f.name_ko) || q.includes(f.name_en.toLowerCase()) ? 100 : 0) +
    f.taste_tags.filter((t) => tags.includes(t)).length * 10 +
    (explored.includes(f.country_code) ? 0 : 3) +
    // Food DNA (0~1 정규화) — 태그 평균 × 6: 미탐험 가산(3)과 비슷한 무게
    (f.taste_tags.length ? (f.taste_tags.reduce((a, t) => a + (tagWeights[t] ?? 0), 0) / f.taste_tags.length) * 6 : 0);
  return rows
    .map((f, i) => ({ f, s: score(f), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.f);
}
