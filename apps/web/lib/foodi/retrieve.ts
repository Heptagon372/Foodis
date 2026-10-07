// 후보 검색 v2 (docs/design/19 §5~§8, 04 문서 RAG ②~④). 1만 개 색인 위에서:
//   ① 하드 필터 — 식이·알레르기·나라·대륙·빼 달라는 재료/맛/코스·이미 본 음식 (DB 가 정한 사실로만 거른다, LLM 이 아니라)
//   ② 의미 검색 — 질의 임베딩과 가까운 120개 (pgvector). 실패하면 이 신호만 끄고 계속
//   ③ 점수 — rank.ts 의 가중합 (의미·조건 충족·취향·대표성·새로움·데이터 풍부함·식이 확실성)
//   ④ 계단식 조건 충족 → MMR 다양화 → 상위 5개만 본문을 가져와 LLM 에 넘긴다
import { hitsAllergen } from "@/lib/diet/allergens";
import type { FoodIndex, IndexedFood } from "./food-index";
import { emptySpec, type QuerySpec } from "./query";
import { mmr, scoreFoods, similarity, structuralNeighbors, tierFilter, violates, type SimScored } from "./rank";
import type { FoodisRepo, FoodRow, UserContext } from "./repo";
import { fitsProfile } from "./repo";
import type { DietKey, Intent } from "./schema";

export type RetrieveInput = {
  intent: Intent;
  diet: DietKey[];
  countryCode: string | null;
  continent: string | null;
  /** 화면에서 보고 있는 음식 또는 발화에서 이름으로 가리킨 음식 */
  targetId: string | null;
  ctx: UserContext;
  /** 이번 대화에서 이미 보여준 음식 — 추천에서 제외 */
  seen: string[];
  /** 의도 분류와 병렬로 미리 계산한 질의 임베딩. 실패했으면 null → 의미 신호 없이 나머지 신호로 */
  embedding: number[] | null;
  text: string;
  index: FoodIndex;
  spec?: QuerySpec;
  /** 동점 깨기 흔들림의 씨앗 (같은 날·같은 사람은 같은 순서) */
  seed?: string;
};

export type RetrieveResult = {
  foods: FoodRow[];
  needDiet: DietKey[];
  degraded: boolean;
  /** 비슷한 음식은 있지만 모두 식이·알레르기 조건에 걸렸다 — 엉뚱한 음식을 '비슷하다'고 내놓지 않는다 */
  similarBlocked?: boolean;
  /** food_id → 고른 이유 (점수에서 나온 사실: "주재료 감자" · "아직 안 가본 나라" …). LLM 과 템플릿이 이유로 쓴다 */
  why: Record<string, string[]>;
};

export const CANDIDATES = 5;
export const VECTOR_POOL = 120;
/** 비슷한 음식으로 말할 수 있는 최소 유사도 (1만 개 실측 분포 기준, docs/design/19 §8) */
export const SIM_MIN = 0.3;

/** 사용자 프로필의 식이 조건 + 이번 질문의 식이 조건 (안전 쪽으로 합집합) */
export const neededDiet = (diet: DietKey[], ctx: UserContext): DietKey[] => [
  ...new Set([...diet, ...(Object.keys(ctx.diet) as DietKey[]).filter((k) => ctx.diet[k])]),
];

const passDiet = (f: IndexedFood, need: DietKey[], avoid: string[]) =>
  need.every((k) => f.diet[k] === "yes" || f.diet[k] === "depends") && !hitsAllergen(f.allergens, avoid);

export async function retrieve(repo: FoodisRepo, i: RetrieveInput): Promise<RetrieveResult> {
  const needDiet = neededDiet(i.diet, i.ctx);
  const target = i.targetId;
  const spec = i.spec ?? emptySpec();
  const idx = i.index;

  // 특정 음식에 대한 질문: 그 음식이 곧 후보 (식이 필터 없이 — "먹어도 돼?"에 정직하게 답해야 하므로)
  if (target && (i.intent === "explain_food" || i.intent === "culture_story")) {
    return { foods: await repo.getFoods([target]), needDiet, degraded: false, why: {} };
  }
  if (target && i.intent === "compare_similar") {
    const r = await similar(repo, i, needDiet);
    if (r) return r;
  }

  const exclude = new Set([...(target ? [target] : []), ...i.seen]);
  const continentCodes = i.continent ? new Set([...idx.continentOf].filter(([, c]) => c === i.continent).map(([cc]) => cc)) : null;
  const pass = (f: IndexedFood) =>
    passDiet(f, needDiet, i.ctx.allergens) &&
    (!i.countryCode || f.country_code === i.countryCode) &&
    (!continentCodes || continentCodes.has(f.country_code)) &&
    (i.intent !== "culture_story" || f.has_story) &&
    !violates(f, spec);

  let vec: Map<string, number> | null = null;
  let degraded = !i.embedding;
  if (i.embedding) {
    try {
      const hits = await repo.vectorSearch({
        embedding: i.embedding,
        needDiet,
        allergens: i.ctx.allergens,
        countryCode: i.countryCode,
        excludeFoodIds: [...exclude],
        count: VECTOR_POOL,
      });
      // 임베딩이 아직 없는 DB(0건)면 빈 결과 — 의미 신호만 끄고 나머지로 고른다
      if (hits.length) vec = new Map(hits.map((h) => [h.id, h.sim]));
      else degraded = true;
    } catch {
      degraded = true;
    }
  }

  let cands = idx.foods.filter((f) => !exclude.has(f.id) && pass(f));
  // "다른 거"를 계속 눌러 후보가 바닥나면 본 것도 다시 허용 (막다른 답 금지)
  if (!cands.length && i.seen.length) cands = idx.foods.filter((f) => f.id !== target && pass(f));

  const scored = scoreFoods(cands, { intent: i.intent, spec, vec, ctx: i.ctx, needDiet, seed: i.seed ?? "" }, (cc) => idx.countryName.get(cc) ?? "");
  const top = mmr(tierFilter(scored, 3), CANDIDATES);
  const rows = await repo.getFoods(top.map((s) => s.food.id));
  const why = Object.fromEntries(top.map((s) => [s.food.id, s.why]));
  return { foods: rows, needDiet, degraded, why };
}

/** 비슷한 음식: 검수된 관계 ∪ 임베딩 이웃 ∪ 재료 역색인 이웃 → rank.ts similarity 로 줄 세운다. 후보가 전혀 없으면 null (일반 검색으로) */
async function similar(repo: FoodisRepo, i: RetrieveInput, needDiet: DietKey[]): Promise<RetrieveResult | null> {
  const idx = i.index;
  const t = idx.byId.get(i.targetId!);
  if (!t) return null;
  const [rels, near] = await Promise.all([repo.relationsOf(t.id).catch(() => []), repo.neighbors(t.id, 40).catch(() => [])]);
  const relType = new Map(rels.map((r) => [r.id, r.type]));
  const cos = new Map(near.map((n) => [n.id, n.sim]));
  const ids = new Set([...relType.keys(), ...cos.keys(), ...structuralNeighbors(t, idx).map((f) => f.id)]);
  ids.delete(t.id);
  // "다른 나라에도 비슷한 거" → 같은 나라는 빼고
  const otherCountry = /다른\s*나라|외국|세계|해외/.test(i.text);
  // byId 는 중복 음식을 남긴 쪽으로 이어 준다 → 같은 음식이 두 번, 또는 대상 자신이 '비슷한 음식'으로 나오지 않게 한 번 더 거른다
  const all: SimScored[] = [...new Set([...ids].map((id) => idx.byId.get(id)))]
    .filter((f): f is IndexedFood => Boolean(f) && f!.id !== t.id && (!otherCountry || f!.country_code !== t.country_code))
    .map((f) => similarity(t, f, idx, { cos: cos.get(f.id), rel: relType.get(f.id) }))
    .filter((s) => s.sim >= SIM_MIN || relType.has(s.food.id))
    .sort((a, b) => b.sim - a.sim);
  if (!all.length) return null;
  const seen = new Set(i.seen);
  const ok = all.filter((s) => !seen.has(s.food.id) && fitsProfile(s.food, needDiet, i.ctx.allergens) && !violates(s.food, i.spec ?? emptySpec()));
  if (!ok.length) return { foods: await repo.getFoods([t.id]), needDiet, degraded: false, similarBlocked: true, why: {} };
  const picked = mmr(
    ok.map((s) => ({ food: s.food, score: s.sim, coverage: 1, parts: {}, why: s.why })),
    3,
    0.85,
  );
  const rows = await repo.getFoods([t.id, ...picked.map((s) => s.food.id)]);
  return { foods: rows, needDiet, degraded: !near.length, why: Object.fromEntries(picked.map((s) => [s.food.id, s.why])) };
}
