// 데모 팩 (06 문서 §6 "데모 10개 질문의 응답 캐시", 11 문서 §6 "Supabase·네트워크 장애 시 데모 모드").
// 발표 전에 실제 파이프라인으로 10문항 답을 만들어 발표 기기 브라우저에 저장 → 현장에서 네트워크·DB·AI 가 죽어도 그대로 답한다.
// 순수 모듈: 서버(팩 생성)와 클라이언트(오프라인 매칭) 양쪽에서 쓴다.
import { normalizeAliases } from "@/lib/foodi/intent";
import type { CountryRow } from "@/lib/foodi/repo";
import type { AskResponse } from "@/lib/foodi/schema";

export type DemoItem = {
  id: string;
  text: string;
  /** 화면 맥락이 필요한 질문 (#4 팔라펠, #6 만두) */
  context_slug?: string;
  context_food_id?: string;
  /** 반드시 같아야 하는 핵심어 (intent.keyTerms) — 비슷한 문장이라도 "목성"이면 "화성" 답을 틀지 않는다 */
  must: string[];
  response: AskResponse;
};

export type DemoPack = {
  version: 1;
  built_at: string;
  /** live = 실제 DB·AI 로 만든 팩 / preview = 미리보기 샘플로 만든 팩 */
  mode: "live" | "preview";
  items: DemoItem[];
  /** 오프라인에서 Passport 질문을 내 기록으로 다시 계산하기 위한 국가 목록 */
  countries: CountryRow[];
  /** 오프라인 캐시에 미리 담을 음식 상세 페이지 */
  food_slugs: string[];
};

/** 호출어·문장부호·공백·끝 어미 차이를 없앤 비교용 문자열 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\s*(푸디야|푸디|foodi)[\s,!.~]*/i, "")
    .replace(/[\s?!.,~…'"“”‘’]+/g, "")
    .replace(/(요|용|해|해줘|줘|줄래|줄래요|주세요|해주세요)$/u, "");
}

const bigrams = (s: string) => {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1);
  return out;
};

/** 글자 2-gram 다이스 계수 (0~1). 음성 인식의 띄어쓰기·조사 차이에 강하다 */
export function similarity(a: string, b: string): number {
  const A = bigrams(normalizeForMatch(a));
  const B = bigrams(normalizeForMatch(b));
  let inter = 0;
  let total = 0;
  for (const [k, n] of A) {
    inter += Math.min(n, B.get(k) ?? 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return total ? (2 * inter) / total : 0;
}

export const MATCH_THRESHOLD = 0.72;

/** 질문과 화면 맥락이 맞는 데모 답 찾기. 맥락이 필요한 질문은 같은 음식 화면에서만 매칭 */
export function matchDemo(pack: DemoPack, text: string, contextFoodId?: string): DemoItem | null {
  let best: { item: DemoItem; score: number } | null = null;
  const plain = normalizeForMatch(normalizeAliases(text));
  for (const item of pack.items) {
    if (item.context_food_id && item.context_food_id !== contextFoodId) continue;
    if (!item.must.every((w) => plain.includes(normalizeForMatch(w)))) continue;
    const score = similarity(text, item.text);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) best = { item, score };
  }
  return best?.item ?? null;
}
