// 후보 검색: 의도에 따라 현재 음식 / 관계 / 하이브리드 검색(match_foods RPC) 중 고른다.
import type { FoodisRepo, UserContext } from "./repo";
import type { DietKey, Intent } from "./schema";

export type RetrieveInput = {
  intent: Intent;
  diet: DietKey[];
  countryCode: string | null;
  contextFoodId?: string;
  ctx: UserContext;
  /** 의도 분류와 병렬로 미리 계산한 질의 임베딩. 실패했으면 null → 키워드 검색으로 대체 */
  embedding: number[] | null;
  text: string;
};

export type RetrieveResult = { foodIds: string[]; degraded: boolean };

const CANDIDATES = 5;

export async function retrieve(repo: FoodisRepo, i: RetrieveInput): Promise<RetrieveResult> {
  const ctxFood = i.contextFoodId;

  if (ctxFood && (i.intent === "explain_food" || i.intent === "culture_story")) {
    return { foodIds: [ctxFood], degraded: false };
  }
  if (ctxFood && i.intent === "compare_similar") {
    const related = await repo.getRelatedFoodIds(ctxFood, CANDIDATES - 1);
    if (related.length) return { foodIds: [ctxFood, ...related], degraded: false };
    // 검수된 관계가 아직 없으면 벡터 검색으로 비슷한 음식을 찾는다
  }

  // 사용자 프로필의 식이 조건 + 이번 질문의 식이 조건을 모두 만족해야 한다 (안전 쪽으로 합집합)
  const needDiet = [...new Set([...i.diet, ...(Object.keys(i.ctx.diet) as DietKey[]).filter((k) => i.ctx.diet[k])])];
  const params = {
    ctx: i.ctx,
    needDiet,
    countryCode: i.countryCode,
    excludeFoodIds: ctxFood ? [ctxFood] : [],
    count: CANDIDATES,
  };

  if (i.embedding) {
    const ids = await repo.matchFoods({ ...params, embedding: i.embedding });
    return { foodIds: ctxFood && i.intent === "compare_similar" ? [ctxFood, ...ids] : ids, degraded: false };
  }
  const ids = await repo.keywordFoods(i.text, params);
  return { foodIds: ids, degraded: true };
}
