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

/** 캐시 키 = 정규화 텍스트 + 식이 조건 + 탐험 국가 수 구간 (11 문서 §5). 개인 식별 정보는 넣지 않는다. */
export function answerCacheKey(text: string, ctx: UserContext, contextFoodId?: string): string {
  const diet = Object.entries(ctx.diet)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(",");
  const bucket = Math.min(Math.floor(ctx.exploredCountries.length / 5), 6);
  const raw = [normalizeQuestion(text), diet, ctx.allergens.slice().sort().join(","), bucket, contextFoodId ?? ""].join("|");
  return "answer:" + createHash("sha256").update(raw).digest("hex");
}
