import { createHash } from "node:crypto";
import type { UserContext } from "@/lib/foodi/repo";

/** "푸디야, 오늘은 어디로 떠나볼까?" ≈ "오늘은 어디로 떠나볼까" — 호출어·문장부호·공백 차이는 같은 질문으로 본다. */
export function normalizeQuestion(text: string): string {
  return text
    .replace(/^\s*(푸디야|푸디|foodi)[\s,!.~]*/i, "")
    .replace(/[\s?!.,~…'"]+/g, " ")
    .trim()
    .toLowerCase();
}

/** 답을 만드는 파이프라인 판. 검색·해석 규칙이 바뀌면 올린다 — 옛 규칙으로 만든 답이 24시간 캐시에 남아 계속 나가지 않게.
 *  v2: 1만 개 검색·랭킹 (docs/design/19) · v3: 사회적 대화 층 — 인사가 '범위 밖' 답으로 캐시돼 있지 않게 (docs/design/24 §K) */
export const ANSWER_PIPELINE = "v3";

/** 캐시 키 = 정규화 텍스트 + 식이 조건 + 탐험 국가 수 구간 (11 문서 §5). 개인 식별 정보는 넣지 않는다.
 *  modelId: 사용자가 고른 '푸디의 두뇌' — 다른 모델의 답이 섞이지 않게. 자동(기본 체인)이면 비워서 예전 키 그대로 */
export function answerCacheKey(text: string, ctx: UserContext, contextFoodId?: string, modelId?: string | null): string {
  const diet = Object.entries(ctx.diet)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(",");
  const bucket = Math.min(Math.floor(ctx.exploredCountries.length / 5), 6);
  // Food DNA 상위 3개 태그 — 취향이 다른 사람에게 남의 추천을 재사용하지 않게
  const dna = Object.entries(ctx.tagWeights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([t]) => t)
    .join(",");
  const raw = [normalizeQuestion(text), diet, ctx.allergens.slice().sort().join(","), bucket, dna, contextFoodId ?? "", ...(modelId ? [`model=${modelId}`] : [])].join("|");
  return `answer:${ANSWER_PIPELINE}:` + createHash("sha256").update(raw).digest("hex");
}
