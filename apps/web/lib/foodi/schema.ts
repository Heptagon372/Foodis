// /api/foodi/ask 계약 (07 문서 §6.3). 클라이언트·서버·LLM 출력 스키마를 한 곳에서 관리한다.
import { z } from "zod";

export const INTENTS = [
  "recommend",
  "explain_food",
  "culture_story",
  "filter_by_diet",
  "compare_similar",
  "passport_status",
  "out_of_scope",
] as const;
export type Intent = (typeof INTENTS)[number];

export const DIET_KEYS = ["vegan", "vegetarian", "halal", "gluten_free", "dairy_free"] as const;
export type DietKey = (typeof DIET_KEYS)[number];
export type DietLevel = "yes" | "depends" | "no" | "unknown";

export const AskRequest = z.object({
  text: z.string().trim().min(1).max(300),
  context_food_id: z.uuid().optional(),
  input_mode: z.enum(["voice", "text"]).default("voice"),
});
export type AskRequest = z.infer<typeof AskRequest>;

// ── LLM 출력 스키마. 사실(식이·이미지·출처)은 받지 않는다 — 서버가 DB 값으로 채운다.
export const IntentOutput = z.object({
  intent: z.enum(INTENTS),
  diet: z.array(z.enum(DIET_KEYS)).describe("질문에 명시된 식이 조건만"),
  country_code: z.string().nullable().describe("특정 나라를 말했으면 ISO 3166-1 alpha-2, 아니면 null"),
});
export type IntentOutput = z.infer<typeof IntentOutput>;

export const GenerateOutput = z.object({
  speech: z.string().describe("음성으로 읽을 2~4문장 한국어 해요체. 후보 목록에 있는 음식만 언급"),
  picks: z
    .array(z.object({ food_id: z.string(), reason: z.string().describe("이 사용자에게 고른 이유, 20자 이내") }))
    .describe("후보 중 고른 음식 1~3개"),
  follow_ups: z.array(z.string()).describe("다음 탐험으로 이어지는 짧은 제안 2~3개"),
});
export type GenerateOutput = z.infer<typeof GenerateOutput>;

// ── 클라이언트 응답
export type FoodCard = {
  food_id: string;
  slug: string;
  name_ko: string;
  country: { code: string; flag: string; accent: string };
  summary: string | null;
  image_url: string | null;
  diet_badges: { key: DietKey; level: DietLevel }[];
  reason: string;
};

export type AskResponse = {
  conversation_id: string | null;
  intent: Intent;
  speech: string;
  cards: FoodCard[];
  follow_ups: string[];
  sources: { food_id: string; title: string | null; url: string }[];
  /** false 면 LLM 답변이 검증에 실패해 템플릿으로 대체된 것 (F-ADM-04 로그 대상) */
  validated: boolean;
  cached?: boolean;
};
