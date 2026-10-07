// 점수식 (docs/design/19 §6~§8). 모든 신호를 0~1 로 맞춘 뒤, 이번 질문에서 '켜진' 신호의 가중치만 다시 합 1 로 정규화해 더한다.
//
//   S(f) = Σ_k w_k · s_k(f) / Σ_k w_k   (k ∈ 켜진 신호)   + ε · jitter(f)
//
//   s_sem   의미 유사도   벡터 후보 안에서 min-max 정규화한 코사인 (후보 밖 0)
//   s_slot  조건 충족도   질문의 맛·조리법·코스·재료·범주 조건을 얼마나 만족하나 (재료는 주재료 1 · 부재료 .7 · 양념 .4)
//   s_taste 취향          Food DNA 와 음식 태그의 코사인  Σ_{t∈T_f} w(t) / (‖w‖₂ · √|T_f|)
//   s_fame  대표성        나라 안 유명도 순위 r → 1 / (1 + ln r)
//   s_novel 새로움        안 가본 나라 1 · 가본 나라의 새 음식 .4 · 이미 본 음식 0
//   s_qual  데이터 풍부함  사진 .5 + 문화 이야기 .3 + 역사 .2 (카드·음성 답이 풍성해진다)
//   s_diet  식이 확실성   요청 식이마다 yes 1 · depends .4 의 평균
//
// 그다음 조건을 '모두' 만족하는 음식이 3개 이상이면 그 안에서만 고르고(계단식), MMR 로 나라·맛이 겹치지 않게 5개를 뽑는다.
import type { FoodIndex, IndexedFood, IngRole } from "./food-index";
import { idf } from "./food-index";
import { fameScore } from "./names";
import { hasSlots, hasSoft, type QuerySpec } from "./query";
import type { UserContext } from "./repo";
import type { DietKey, Intent } from "./schema";
import { COURSE_KO, METHOD_KO, TAG_KO, type Course, type Method, type TasteTag } from "./vocab";

export type Signal = "sem" | "slot" | "taste" | "fame" | "novel" | "qual" | "diet";
export type Weights = Record<Signal, number>;

/** 의도·상황별 가중치. 열린 추천은 대표성·새로움, 조건이 있는 추천은 조건 충족도가 이끈다 */
export const WEIGHTS: Record<"open" | "slotted" | "diet" | "story", Weights> = {
  open: { sem: 0.3, slot: 0, taste: 0.15, fame: 0.25, novel: 0.15, qual: 0.15, diet: 0.1 },
  slotted: { sem: 0.25, slot: 0.35, taste: 0.1, fame: 0.1, novel: 0.08, qual: 0.07, diet: 0.05 },
  diet: { sem: 0.2, slot: 0.2, taste: 0.1, fame: 0.15, novel: 0.1, qual: 0.1, diet: 0.15 },
  story: { sem: 0.25, slot: 0.15, taste: 0.05, fame: 0.2, novel: 0.1, qual: 0.25, diet: 0.05 },
};
/** 흔들림 ε·u(f), u = hash(씨앗, 음식) ∈ [0,1) — 같은 날·같은 사람에게는 같은 순서 (24시간 답 캐시와 맞물린다).
 *  조건이 있는 질문은 동점 깨기 정도(0.03), 열린 추천("오늘 뭐 먹지?")은 대표 음식 상위권이 날마다 돌아가며 1순위가 되게(0.2) */
export const JITTER = 0.03;
export const JITTER_OPEN = 0.2;

export type ScoreInput = {
  intent: Intent;
  spec: QuerySpec;
  /** 벡터 검색 결과 food_id → 코사인. 임베딩 장애·미리보기면 null */
  vec: Map<string, number> | null;
  ctx: UserContext;
  needDiet: DietKey[];
  seed: string;
};

export type Scored = { food: IndexedFood; score: number; coverage: number; parts: Partial<Record<Signal, number>>; why: string[] };

const ROLE_W: Record<IngRole, number> = { main: 1, sub: 0.7, seasoning: 0.4 };
const METHOD_FAMILY: Method[][] = [
  ["fried", "deep_fried", "stir_fried"],
  ["grilled", "roasted", "baked", "smoked"],
  ["boiled", "stewed", "braised", "steamed"],
  ["fermented", "pickled", "cured"],
];
const COURSE_NEAR: Partial<Record<Course, Partial<Record<Course, number>>>> = {
  soup: { stew: 0.6 }, stew: { soup: 0.6 }, dessert: { snack: 0.4 }, snack: { dessert: 0.3, side: 0.4 }, side: { snack: 0.4 }, breakfast: { bread: 0.4, snack: 0.3 },
};
/** 태그를 코스로도 만족하는 경우 ("국물" 원하는데 코스가 soup·stew) */
const TAG_BY_COURSE: Partial<Record<TasteTag, Course[]>> = { soup: ["soup", "stew"], noodle: ["noodle"], rice: ["rice"], bread: ["bread"] };

const hash01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};

export const tagHit = (f: IndexedFood, t: TasteTag) => f.tags.includes(t) || Boolean(f.course && TAG_BY_COURSE[t]?.includes(f.course as Course));
const methodHit = (f: IndexedFood, g: Method[]) => {
  if (!f.method) return 0;
  if (g.includes(f.method as Method)) return 1;
  return METHOD_FAMILY.some((fam) => fam.includes(f.method as Method) && g.some((m) => fam.includes(m))) ? 0.5 : 0;
};
const courseHit = (f: IndexedFood, g: Course[]) => {
  if (!f.course) return 0;
  if (g.includes(f.course as Course)) return 1;
  return Math.max(0, ...g.map((c) => COURSE_NEAR[c]?.[f.course as Course] ?? 0));
};
const ingHit = (f: IndexedFood, names: Set<string>, tag?: TasteTag) => {
  let best = 0;
  for (const i of f.ingredients) if (names.has(i.name)) best = Math.max(best, ROLE_W[i.role]);
  if (tag && f.tags.includes(tag)) best = Math.max(best, 0.8);
  return best;
};
const termHit = (f: IndexedFood, term: string) =>
  f.name_ko.includes(term) ? 1 : f.ingredients.some((i) => i.name.includes(term)) ? 0.6 : 0;

/** 조건 충족도: 명시 조건 1, 상황 조건 0.5 무게의 가중 평균 (value). hard 는 명시 조건만의 평균 — 계단식 거르기는 이것만 본다
 *  ("비 오는 날" 같은 상황 신호가 후보를 걸러 버리지 않게). 조건이 없으면 null */
export function coverage(f: IndexedFood, s: QuerySpec): { value: number; hard: number; hits: string[] } | null {
  const groups: [number, number, string | null][] = [];
  for (const t of s.tags) groups.push([1, tagHit(f, t) ? 1 : 0, TAG_KO[t]]);
  for (const g of s.methods) {
    const v = methodHit(f, g);
    groups.push([1, v, v ? `${METHOD_KO[f.method as Method]} 요리` : null]);
  }
  for (const g of s.courses) {
    const v = courseHit(f, g);
    groups.push([1, v, v ? COURSE_KO[f.course as Course] : null]);
  }
  for (const a of s.ingredients) {
    const v = ingHit(f, a.names, a.tag);
    const main = f.ingredients.find((i) => a.names.has(i.name) && i.role === "main");
    groups.push([1, v, v ? `${main ? "주재료" : "재료"} ${a.label}` : null]);
  }
  for (const term of s.terms) groups.push([1, termHit(f, term), termHit(f, term) ? term : null]);
  for (const t of s.soft.tags) groups.push([0.5, tagHit(f, t) ? 1 : 0, null]);
  for (const c of s.soft.courses) groups.push([0.5, courseHit(f, [c]), null]);
  if (!groups.length) return null;
  const total = groups.reduce((a, [w]) => a + w, 0);
  const value = groups.reduce((a, [w, v]) => a + w * v, 0) / total;
  const explicit = groups.filter(([w]) => w === 1);
  const hard = explicit.length ? explicit.reduce((a, [, v]) => a + v, 0) / explicit.length : 1;
  const hits = groups.filter(([w, v, l]) => w === 1 && v >= 0.5 && l).map(([, , l]) => l!);
  if (s.soft.labels.length && groups.some(([w, v]) => w === 0.5 && v > 0)) hits.push(s.soft.labels[0]);
  return { value, hard, hits };
}

/** 하드 조건 (빼 달라는 것). 통과 못 하면 후보가 아니다 */
export function violates(f: IndexedFood, s: QuerySpec): boolean {
  if (s.notTags.some((t) => f.tags.includes(t))) return true;
  if (f.method && s.notMethods.includes(f.method as Method)) return true;
  if (f.course && s.notCourses.includes(f.course as Course)) return true;
  return s.notIngredients.some((a) => f.ingredients.some((i) => a.names.has(i.name)) || (a.tag ? f.tags.includes(a.tag) : false));
}

/** Food DNA 코사인. 가중치가 없으면 null */
export function tasteScore(f: IndexedFood, w: Record<string, number>): number | null {
  const entries = Object.values(w);
  if (!entries.length || !f.tags.length) return entries.length ? 0 : null;
  const norm = Math.sqrt(entries.reduce((a, x) => a + x * x, 0));
  if (!norm) return null;
  return f.tags.reduce((a, t) => a + (w[t] ?? 0), 0) / (norm * Math.sqrt(f.tags.length));
}

const quality = (f: IndexedFood) => 0.5 * Number(f.has_image) + 0.3 * Number(f.has_story) + 0.2 * Number(f.has_history);

export function weightsFor(intent: Intent, spec: QuerySpec, needDiet: DietKey[]): Weights {
  if (intent === "culture_story") return WEIGHTS.story;
  const slotted = hasSlots(spec) || hasSoft(spec);
  if (intent === "filter_by_diet" || (needDiet.length && !slotted)) return WEIGHTS.diet;
  return slotted ? WEIGHTS.slotted : WEIGHTS.open;
}

export function scoreFoods(foods: IndexedFood[], i: ScoreInput, countryName?: (cc: string) => string): Scored[] {
  const w = weightsFor(i.intent, i.spec, i.needDiet);
  const vals = i.vec ? [...i.vec.values()] : [];
  const vMin = vals.length ? Math.min(...vals) : 0;
  const vMax = vals.length ? Math.max(...vals) : 0;
  const explored = new Set(i.ctx.exploredCountries);
  const exploredFoods = new Set(i.ctx.exploredFoodIds);
  const anyExplored = explored.size > 0 || exploredFoods.size > 0;
  return foods.map((f) => {
    const parts: Partial<Record<Signal, number>> = {};
    const why: string[] = [];
    if (vals.length) parts.sem = vMax > vMin ? Math.max(0, ((i.vec!.get(f.id) ?? vMin) - vMin) / (vMax - vMin)) : i.vec!.has(f.id) ? 1 : 0;
    const cov = coverage(f, i.spec);
    if (cov && w.slot) {
      parts.slot = cov.value;
      why.push(...cov.hits);
    }
    const taste = tasteScore(f, i.ctx.tagWeights);
    if (taste !== null) {
      parts.taste = taste;
      if (taste >= 0.5) why.push("취향과 비슷한 맛");
    }
    parts.fame = fameScore(f.fame_rank, f.links);
    if (f.fame_rank && f.fame_rank <= 3) why.push(`${countryName?.(f.country_code) ?? ""} 대표 음식`.trim());
    if (anyExplored) {
      parts.novel = exploredFoods.has(f.id) ? 0 : explored.has(f.country_code) ? 0.4 : 1;
      if (parts.novel === 1) why.push("아직 안 가본 나라");
    }
    parts.qual = quality(f);
    if (i.needDiet.length) {
      parts.diet = i.needDiet.reduce((a, k) => a + (f.diet[k] === "yes" ? 1 : f.diet[k] === "depends" ? 0.4 : 0), 0) / i.needDiet.length;
      if (parts.diet === 1) why.push("식이 조건 확실");
    }
    let num = 0;
    let den = 0;
    for (const k of Object.keys(parts) as Signal[]) {
      num += w[k] * parts[k]!;
      den += w[k];
    }
    const score = (den ? num / den : 0) + (w === WEIGHTS.open ? JITTER_OPEN : JITTER) * hash01(`${i.seed}:${f.id}`);
    return { food: f, score, coverage: cov?.hard ?? 1, parts, why: [...new Set(why)].slice(0, 3) };
  });
}

/** 계단식 거르기 ① 조건 충족: 명시 조건을 모두(≥0.99) 만족하는 후보가 need 개 이상이면 그 안에서, 아니면 절반 이상(≥0.5), 아니면 전부
 *              ② 식이 확실성: 식이 조건을 말했고 전부 yes 인 후보가 need 개 이상이면 그 안에서 ("비건 디저트"에 '조리법에 따라 다름'을 앞세우지 않는다) */
export function tierFilter(scored: Scored[], need: number): Scored[] {
  let out = scored;
  let tiered = false;
  for (const min of [0.99, 0.5]) {
    const hit = scored.filter((s) => s.coverage >= min);
    if (hit.length >= need) {
      out = hit;
      tiered = true;
      break;
    }
  }
  if (!tiered) {
    const any = scored.filter((s) => s.coverage > 0);
    if (any.length) out = any;
  }
  const sure = out.filter((s) => s.parts.diet === 1);
  return out.some((s) => s.parts.diet !== undefined) && sure.length >= need ? sure : out;
}

/** 두 음식이 얼마나 겹치나 (다양성용): 같은 나라 .6 + 태그 자카드 .4 */
const redundancy = (a: IndexedFood, b: IndexedFood) => 0.6 * Number(a.country_code === b.country_code) + 0.4 * jaccard(a.tags, b.tags);

/** MMR: argmax λ·S(f) − (1−λ)·max_{g∈선택} 겹침(f,g) — 같은 나라·같은 맛만 줄줄이 나오지 않게 */
export function mmr(scored: Scored[], k: number, lambda = 0.75): Scored[] {
  const pool = [...scored].sort((a, b) => b.score - a.score).slice(0, Math.max(k * 8, 40));
  const out: Scored[] = [];
  while (out.length < k && pool.length) {
    let bi = 0;
    let best = -Infinity;
    pool.forEach((s, j) => {
      const r = out.length ? Math.max(...out.map((o) => redundancy(s.food, o.food))) : 0;
      const v = lambda * s.score - (1 - lambda) * r;
      if (v > best) [best, bi] = [v, j];
    });
    out.push(pool.splice(bi, 1)[0]);
  }
  return out;
}

export const jaccard = (a: readonly string[], b: readonly string[]) => {
  if (!a.length && !b.length) return 0;
  const sb = new Set(b);
  const inter = a.filter((x) => sb.has(x)).length;
  return inter / (new Set([...a, ...b]).size || 1);
};

// ── 비슷한 음식 (compare_similar)
//   sim(a,b) = Σ w_k s_k / Σ w_k
//   cos .35 (임베딩 이웃일 때) · 재료 가중 자카드 .25 · 태그 자카드 .15 · 조리법 .08 · 코스 .07 · 검수된 관계 .10 · 다른 나라 .05
//   재료 가중 자카드 WJ = Σ_i min(w_a(i), w_b(i)) / Σ_i max(w_a(i), w_b(i)),  w_x(i) = 역할(주 1·부 .7·양념 .4) × idf(i)
export const SIM_WEIGHTS = { cos: 0.35, ing: 0.25, tag: 0.15, method: 0.08, course: 0.07, rel: 0.1, away: 0.05 };
export const REL_WEIGHT: Record<string, number> = { regional_variant: 1, similar_taste: 0.9, shares_ingredient: 0.7, same_technique: 0.6, historical_link: 0.5 };

export function ingredientJaccard(a: IndexedFood, b: IndexedFood, idx: FoodIndex): { value: number; shared: string[] } {
  const wa = new Map(a.ingredients.map((i) => [i.name, ROLE_W[i.role] * idf(idx, i.name)]));
  const wb = new Map(b.ingredients.map((i) => [i.name, ROLE_W[i.role] * idf(idx, i.name)]));
  let min = 0;
  let max = 0;
  const shared: string[] = [];
  for (const k of new Set([...wa.keys(), ...wb.keys()])) {
    const x = wa.get(k) ?? 0;
    const y = wb.get(k) ?? 0;
    min += Math.min(x, y);
    max += Math.max(x, y);
    if (x && y) shared.push(k);
  }
  // 흔한 재료(설탕·소금)는 idf 가 낮아 공유해도 이유로 말하지 않는다
  shared.sort((p, q) => idf(idx, q) - idf(idx, p));
  return { value: max ? min / max : 0, shared: shared.filter((s) => idf(idx, s) > 2.5).slice(0, 2) };
}

export type SimScored = { food: IndexedFood; sim: number; why: string[] };

export function similarity(a: IndexedFood, b: IndexedFood, idx: FoodIndex, extra: { cos?: number; rel?: string }): SimScored {
  const W = SIM_WEIGHTS;
  const ing = ingredientJaccard(a, b, idx);
  const tag = jaccard(a.tags, b.tags);
  const method = a.method && b.method ? (a.method === b.method ? 1 : METHOD_FAMILY.some((f) => f.includes(a.method as Method) && f.includes(b.method as Method)) ? 0.5 : 0) : 0;
  const course = a.course && b.course ? (a.course === b.course ? 1 : (COURSE_NEAR[a.course as Course]?.[b.course as Course] ?? 0)) : 0;
  const rel = extra.rel ? (REL_WEIGHT[extra.rel] ?? 0.5) : 0;
  const away = a.country_code !== b.country_code ? 1 : 0;
  let num = W.ing * ing.value + W.tag * tag + W.method * method + W.course * course + W.rel * rel + W.away * away;
  let den = W.ing + W.tag + W.method + W.course + W.rel + W.away;
  if (extra.cos !== undefined) {
    num += W.cos * extra.cos;
    den += W.cos;
  }
  const why: string[] = [];
  if (ing.shared.length) why.push(`같은 재료 ${ing.shared.join("·")}`);
  if (method === 1 && a.method) why.push(`같은 조리법(${METHOD_KO[a.method as Method]})`);
  const sharedTags = a.tags.filter((t) => b.tags.includes(t) && !["soft", "hot", "cold"].includes(t)).slice(0, 2);
  if (sharedTags.length >= 2) why.push(`비슷한 맛(${sharedTags.map((t) => TAG_KO[t]).join("·")})`);
  if (extra.rel === "regional_variant") why.push("지역 변형");
  else if (extra.rel === "historical_link") why.push("역사로 이어진 음식");
  return { food: b, sim: num / den, why: why.slice(0, 2) };
}

/** 구조가 비슷한 후보: 흔하지 않은 재료(idf > 2)를 공유하는 음식들. 1만 개 전체를 훑지 않고 역색인으로 */
export function structuralNeighbors(a: IndexedFood, idx: FoodIndex, limit = 200): IndexedFood[] {
  const count = new Map<number, number>();
  for (const ing of a.ingredients) {
    const v = idf(idx, ing.name);
    if (v <= 2) continue;
    for (const j of idx.byIngredient.get(ing.name) ?? []) count.set(j, (count.get(j) ?? 0) + v * ROLE_W[ing.role]);
  }
  return [...count]
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([j]) => idx.foods[j])
    .filter((f) => f.id !== a.id);
}
