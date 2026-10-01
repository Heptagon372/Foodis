// 후보 검색 (04 문서 RAG ②~④): 의도에 따라 대상 음식 / 관계 / 하이브리드 검색(match_foods RPC) 중 고른다.
// 식이·알레르기는 DB 가 거른다 — LLM 이 아니라.
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
  /** 의도 분류와 병렬로 미리 계산한 질의 임베딩. 실패했으면 null → 키워드 검색으로 대체 */
  embedding: number[] | null;
  text: string;
};

export type RetrieveResult = {
  foods: FoodRow[];
  needDiet: DietKey[];
  degraded: boolean;
  /** 비슷한 음식(검수된 관계)은 있지만 모두 식이·알레르기 조건에 걸렸다 — 엉뚱한 음식을 '비슷하다'고 내놓지 않는다 */
  similarBlocked?: boolean;
};

const CANDIDATES = 5;

/** 사용자 프로필의 식이 조건 + 이번 질문의 식이 조건 (안전 쪽으로 합집합) */
export const neededDiet = (diet: DietKey[], ctx: UserContext): DietKey[] => [
  ...new Set([...diet, ...(Object.keys(ctx.diet) as DietKey[]).filter((k) => ctx.diet[k])]),
];

export async function retrieve(repo: FoodisRepo, i: RetrieveInput): Promise<RetrieveResult> {
  const needDiet = neededDiet(i.diet, i.ctx);
  const target = i.targetId;

  // 특정 음식에 대한 질문: 그 음식이 곧 후보 (식이 필터 없이 — "먹어도 돼?"에 정직하게 답해야 하므로)
  if (target && (i.intent === "explain_food" || i.intent === "culture_story")) {
    return { foods: await repo.getFoods([target]), needDiet, degraded: false };
  }

  if (target && i.intent === "compare_similar") {
    const related = await repo.getRelatedFoodIds(target, 8);
    const rows = await repo.getFoods([target, ...related]);
    const ok = rows.filter((f, idx) => idx === 0 || fitsProfile(f, needDiet, i.ctx.allergens));
    if (ok.length > 1) return { foods: ok.slice(0, 4), needDiet, degraded: false };
    if (rows.length > 1) return { foods: ok.slice(0, 1), needDiet, degraded: false, similarBlocked: true };
    // 검수된 관계가 아직 없으면 아래 벡터 검색으로 비슷한 음식을 찾는다 (대상 음식은 맨 앞에 둔다)
  }

  // 대륙 조건은 RPC 에 없어서 넉넉히 뽑은 뒤 거른다. culture_story 도 이야기 필드가 있는 음식만 남긴다
  const wide = Boolean(i.continent) || i.intent === "culture_story";
  const baseExclude = [...new Set([...(target ? [target] : []), ...i.seen])];
  const search = async (exclude: string[]) => {
    const p = { ctx: i.ctx, needDiet, countryCode: i.countryCode, excludeFoodIds: exclude, count: wide ? CANDIDATES * 4 : CANDIDATES };
    if (i.embedding) return { ids: await repo.matchFoods({ ...p, embedding: i.embedding }), degraded: false };
    return { ids: await repo.keywordFoods(i.text, p), degraded: true };
  };

  let r = await search(baseExclude);
  // "다른 거"를 계속 눌러 후보가 바닥나면 본 것도 다시 허용 (막다른 답 금지)
  if (!r.ids.length && i.seen.length) r = await search(target ? [target] : []);

  let rows = await repo.getFoods(r.ids);
  if (i.continent) {
    const codes = new Set((await repo.countries()).filter((c) => c.continent_group === i.continent).map((c) => c.code));
    rows = rows.filter((f) => codes.has(f.country_code));
  }
  if (i.intent === "culture_story") {
    const withStory = rows.filter((f) => f.culture_story);
    rows = withStory.length ? withStory : rows;
  }
  rows = rows.slice(0, CANDIDATES);
  if (target && i.intent === "compare_similar") rows = [...(await repo.getFoods([target])), ...rows];
  return { foods: rows, needDiet, degraded: r.degraded };
}
