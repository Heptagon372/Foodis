// 질문 → 구조화 질의 (docs/design/19 §3). "안 매운 감자 요리, 돼지고기는 빼고" 를
//   { tags: [], notTags: [spicy], ingredients: [감자], notIngredients: [돼지고기] } 로 바꾼다.
// 하드 조건(빼 달라는 것)은 retrieve 가 거르고, 원하는 것은 rank.ts 의 '조건 충족도'가 점수로 반영한다.
import { ALLERGEN_KEYS, canonAllergens } from "@/lib/diet/allergens";
import { ONE_CHAR_ING, type FoodIndex } from "./food-index";
import {
  ALLERGY_WORD, CATEGORY_NOUNS, COURSE_WORDS, INGREDIENT_CONCEPTS, METHOD_WORDS, NEG_AFTER, NEG_BEFORE, NEG_TASTE, SITUATIONS, TASTE_WORDS,
  type Course, type Method, type TasteTag,
} from "./vocab";

export type IngredientAsk = { label: string; names: Set<string>; tag?: TasteTag };

export type QuerySpec = {
  tags: TasteTag[];
  notTags: TasteTag[];
  /** 표현 하나가 여러 조리법일 수 있어 묶음으로 ("구운" = 그릴·통구이·오븐) */
  methods: Method[][];
  notMethods: Method[];
  courses: Course[][];
  notCourses: Course[];
  ingredients: IngredientAsk[];
  notIngredients: IngredientAsk[];
  /** 범주어 ("만두 추천해줘" 의 만두) — 이름에 그 말이 든 음식 */
  terms: string[];
  /** 상황 표현에서 온 약한 신호 ("비 오는 날" → 따뜻한 국물) */
  soft: { tags: TasteTag[]; courses: Course[]; labels: string[] };
  /** 질문에서 말한 알레르기 ("땅콩 알레르기 있는데") — 프로필 알레르기와 합쳐 하드 필터 */
  allergens: string[];
};

export const emptySpec = (): QuerySpec => ({
  tags: [], notTags: [], methods: [], notMethods: [], courses: [], notCourses: [], ingredients: [], notIngredients: [], terms: [],
  soft: { tags: [], courses: [], labels: [] },
  allergens: [],
});

/** 원하는 조건(명시)이 있나 */
export const hasSlots = (s: QuerySpec) => s.tags.length + s.methods.length + s.courses.length + s.ingredients.length + s.terms.length > 0;
export const hasSoft = (s: QuerySpec) => s.soft.tags.length + s.soft.courses.length > 0;

type Span = [number, number];
const overlaps = (a: Span, spans: Span[]) => spans.some(([s, e]) => a[0] < e && a[1] > s);

/** 그 말 앞뒤가 '빼 달라'는 뜻인가 ("안 매운" · "돼지고기 빼고" · "디저트 말고") */
export function negated(t: string, start: number, end: number): boolean {
  return NEG_BEFORE.test(t.slice(Math.max(0, start - 3), start)) || NEG_AFTER.test(t.slice(end, end + 16));
}

function* matches(re: RegExp, t: string) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const m of t.matchAll(g)) {
    // (?:^|\s) 로 시작하는 패턴은 공백을 뺀 실제 단어 위치로
    const lead = m[0].length - m[0].trimStart().length;
    yield [m.index! + lead, m.index! + m[0].length] as Span;
  }
}

/** 띄어쓰기 단위 한글 단어 (위치 포함) */
const words = (t: string) => [...t.matchAll(/[가-힣]+/g)].map((m) => ({ w: m[0], s: m.index!, e: m.index! + m[0].length }));
const PARTICLE = /^(?:$|이|가|을|를|은|는|도|만|로|으로|랑|이랑|과|와|의|요리|음식|들어|넣|류|종류|만든)/;

const conceptCache = new WeakMap<FoodIndex, Map<string, Set<string>>>();
/** 개념(닭·돼지·해산물 …) → 데이터에 있는 재료 이름들 */
function conceptNames(idx: FoodIndex | null, label: string, ing: RegExp): Set<string> {
  if (!idx) return new Set();
  let m = conceptCache.get(idx);
  if (!m) conceptCache.set(idx, (m = new Map()));
  let s = m.get(label);
  if (!s) m.set(label, (s = new Set([...idx.df.keys()].filter((n) => ing.test(n)))));
  return s;
}

/**
 * @param t 별칭을 정리한 질문 (intent.ts normalizeAliases 결과)
 * @param skip 이미 음식·나라 이름으로 쓴 구간 — 그 안의 말은 재료·맛으로 다시 읽지 않는다 ("감자튀김"이 음식 이름이면 감자 조건이 아니다)
 * @param extraTerms 음식 이름이지만 이번엔 범주로 읽기로 한 말 ("만두 추천해줘")
 * @param ingredientTerms 음식 이름이지만 재료로 읽기로 한 말 ("김치 들어간 요리" — 김치 자체가 아니라 김치가 든 음식)
 */
export function parseQuery(t: string, idx: FoodIndex | null, skip: Span[] = [], extraTerms: string[] = [], ingredientTerms: string[] = []): QuerySpec {
  const spec = emptySpec();
  for (const m of t.matchAll(ALLERGY_WORD)) {
    const key = canonAllergens([m[1]])[0];
    if (key && (ALLERGEN_KEYS as string[]).includes(key) && !spec.allergens.includes(key)) spec.allergens.push(key);
  }
  for (const term of ingredientTerms) {
    const names = idx ? new Set([...idx.df.keys()].filter((n) => n.includes(term))) : new Set<string>();
    if (names.size) spec.ingredients.push({ label: term, names });
    else extraTerms = [...extraTerms, term];
    const at = t.indexOf(term);
    if (at >= 0) skip = [...skip, [at, at + term.length]];
  }
  const claimed: Span[] = [...skip];
  const push = <T>(arr: T[], v: T) => void (arr.includes(v) || arr.push(v));

  for (const [re, tag] of NEG_TASTE)
    for (const sp of matches(re, t)) {
      if (overlaps(sp, skip)) continue;
      push(spec.notTags, tag);
      claimed.push(sp);
    }
  // 재료 묶음 개념은 맛 낱말보다 먼저, 단어 전체를 차지한다 — "돼지고기 빼고"가 '고기(meat) 전부 빼기'가 되지 않게
  const ws = words(t);
  const wordAt = (pos: number) => ws.find((w) => pos >= w.s && pos < w.e);
  for (const c of INGREDIENT_CONCEPTS)
    for (const sp of matches(c.re, t)) {
      const w = wordAt(sp[0]);
      const span: Span = w ? [w.s, w.e] : sp;
      if (overlaps(span, claimed)) continue;
      claimed.push(span);
      const ask: IngredientAsk = { label: c.label, names: conceptNames(idx, c.label, c.ing), tag: c.tag };
      (negated(t, span[0], span[1]) ? spec.notIngredients : spec.ingredients).push(ask);
    }
  for (const [re, tag] of TASTE_WORDS)
    for (const sp of matches(re, t)) {
      if (overlaps(sp, claimed)) continue;
      push(negated(t, sp[0], sp[1]) ? spec.notTags : spec.tags, tag);
    }
  for (const [re, ms] of METHOD_WORDS)
    for (const sp of matches(re, t)) {
      if (overlaps(sp, skip)) continue;
      if (negated(t, sp[0], sp[1])) ms.forEach((m) => push(spec.notMethods, m));
      else if (!spec.methods.some((g) => g.join() === ms.join())) spec.methods.push(ms);
    }
  for (const [re, cs] of COURSE_WORDS)
    for (const sp of matches(re, t)) {
      if (overlaps(sp, skip)) continue;
      if (negated(t, sp[0], sp[1])) cs.forEach((c) => push(spec.notCourses, c));
      else if (!spec.courses.some((g) => g.join() === cs.join())) spec.courses.push(cs);
    }
  for (const [re, s] of SITUATIONS)
    if (re.test(t)) {
      s.tags?.forEach((x) => push(spec.soft.tags, x));
      s.courses?.forEach((x) => push(spec.soft.courses, x));
      push(spec.soft.labels, s.label);
    }

  // 범주어 → 데이터 재료 사전 순
  for (const w of ws) {
    if (overlaps([w.s, w.e], claimed)) continue;
    const noun = [...CATEGORY_NOUNS, ...extraTerms].filter((n) => w.w.startsWith(n) && PARTICLE.test(w.w.slice(n.length))).sort((a, b) => b.length - a.length)[0];
    if (!noun) continue;
    claimed.push([w.s, w.e]);
    if (negated(t, w.s, w.e)) continue;
    push(spec.terms, noun);
  }
  for (const term of extraTerms) if (!spec.terms.includes(term) && t.includes(term)) spec.terms.push(term);
  if (idx)
    for (const w of ws) {
      if (overlaps([w.s, w.e], claimed)) continue;
      for (let len = Math.min(w.w.length, 12); len >= 1; len--) {
        const head = w.w.slice(0, len);
        const names = idx.ingWords.get(head);
        if (!names) continue;
        // 한 글자 재료(쌀·꿀·무 …)는 뒤가 조사·'요리'일 때만 ("무슨"의 무, "파스타"의 파 방지)
        if (len === 1 && !(ONE_CHAR_ING.has(head) && PARTICLE.test(w.w.slice(1)))) continue;
        // 맛·조리법·코스 낱말이 재료 이름과 겹치면 그쪽 뜻으로 이미 읽었다
        if ([...TASTE_WORDS, ...METHOD_WORDS, ...COURSE_WORDS].some(([re]) => re.test(head))) break;
        claimed.push([w.s, w.e]);
        (negated(t, w.s, w.e) ? spec.notIngredients : spec.ingredients).push({ label: head, names });
        break;
      }
    }
  // 같은 맛을 원하면서 빼 달라고 했으면 빼는 쪽이 이긴다 (안전 쪽)
  spec.tags = spec.tags.filter((x) => !spec.notTags.includes(x));
  return spec;
}

/** 두 질의를 합친다 (규칙 + LLM 슬롯) */
export function mergeSpec(a: QuerySpec, b: QuerySpec): QuerySpec {
  const u = <T>(x: T[], y: T[]) => [...new Set([...x, ...y])];
  const ingr = (x: IngredientAsk[], y: IngredientAsk[]) => [...x, ...y.filter((i) => !x.some((j) => j.label === i.label))];
  const groups = <T>(x: T[][], y: T[][]) => [...x, ...y.filter((g) => !x.some((h) => h.join() === g.join()))];
  const notTags = u(a.notTags, b.notTags);
  return {
    tags: u(a.tags, b.tags).filter((t) => !notTags.includes(t)),
    notTags,
    methods: groups(a.methods, b.methods),
    notMethods: u(a.notMethods, b.notMethods),
    courses: groups(a.courses, b.courses),
    notCourses: u(a.notCourses, b.notCourses),
    ingredients: ingr(a.ingredients, b.ingredients),
    notIngredients: ingr(a.notIngredients, b.notIngredients),
    terms: u(a.terms, b.terms),
    soft: { tags: u(a.soft.tags, b.soft.tags), courses: u(a.soft.courses, b.soft.courses), labels: u(a.soft.labels, b.soft.labels) },
    allergens: u(a.allergens, b.allergens),
  };
}
