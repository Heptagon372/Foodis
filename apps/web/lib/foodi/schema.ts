// /api/foodi/ask 계약 (07 문서 §6.3). 클라이언트·서버·LLM 출력 스키마를 한 곳에서 관리한다.
import { z } from "zod";
import { COURSES, METHODS, TASTE_TAGS } from "./vocab";

export const INTENTS = [
  "recommend",
  "explain_food",
  "culture_story",
  "filter_by_diet",
  "compare_similar",
  "passport_status",
  /** 인사·감사·작별·안부·"너 누구야" 같은 가벼운 대화 — LLM 없이 페르소나 문장으로 (social.ts, docs/design/24 §K) */
  "social",
  "out_of_scope",
] as const;
export type Intent = (typeof INTENTS)[number];

export const DIET_KEYS = ["vegan", "vegetarian", "halal", "gluten_free", "dairy_free"] as const;
export type DietKey = (typeof DIET_KEYS)[number];
export type DietLevel = "yes" | "depends" | "no" | "unknown";

/** foodis-data/scripts/common.py ALLERGENS 와 같은 목록. 온보딩에서는 견과류·갑각류·땅콩을 먼저 보여준다 (02 문서 M3) */
export const ALLERGENS = ["nuts", "peanut", "shellfish", "fish", "egg", "soy", "wheat", "dairy", "sesame"] as const;
export type Allergen = (typeof ALLERGENS)[number];

const uuidList = (max: number) => z.array(z.uuid()).max(max).default([]);

export const AskRequest = z.object({
  text: z.string().trim().min(1).max(300),
  context_food_id: z.uuid().optional(),
  input_mode: z.enum(["voice", "text"]).default("voice"),
  /** 이번 대화에서 이미 카드로 보여준 음식 — "다른 거 추천"이 같은 음식을 반복하지 않게 */
  seen_food_ids: uuidList(30),
  /** '푸디의 두뇌' 사용자 선택 (lib/ai/models 의 id). 서버가 목록·키로 다시 검증 — 모르는 값이면 무시하고 기본 체인 */
  model: z.string().max(64).optional(),
  /** 게스트 전용: 브라우저에 저장된 프로필 (로그인 사용자는 DB 프로필을 쓰고 이 값은 무시) */
  guest: z
    .object({
      diet: z.array(z.enum(DIET_KEYS)).max(5).default([]),
      allergens: z.array(z.enum(ALLERGENS)).max(9).default([]),
      explored_countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(60).default([]),
      explored_foods: uuidList(300),
      /** Food DNA: 맛 태그 가중치 (좋아요 ×2 · 먹어봤어요 ×1.5 · 탐험 ×1) — match_foods 의 취향 점수 (02 문서 M6) */
      tag_weights: z.record(z.string().max(30), z.number().min(0).max(1000)).default({}),
    })
    .optional(),
});
export type AskRequest = z.input<typeof AskRequest>;
export type AskRequestParsed = z.output<typeof AskRequest>;

// ── LLM 출력 스키마. 사실(식이·이미지·출처)은 받지 않는다 — 서버가 DB 값으로 채운다.
export const IntentOutput = z.object({
  intent: z.enum(INTENTS),
  diet: z.array(z.enum(DIET_KEYS)).describe("질문에 명시된 식이 조건만"),
  country_code: z.string().nullable().describe("특정 나라를 말했으면 ISO 3166-1 alpha-2, 아니면 null"),
  mentioned_food: z.string().nullable().describe("질문이 가리키는 특정 음식 이름(사용자가 말한 그대로). 없으면 null"),
  mentioned_place: z.string().nullable().describe("나라가 아닌 장소·지역·가상의 곳을 말했으면 그 이름(예: 화성, 북극). 없으면 null"),
  // 1만 개 데이터의 통제 어휘 (vocab.ts) — 질문의 조건을 DB 가 아는 말로 옮긴다 (docs/design/19 §3)
  tastes: z.array(z.enum(TASTE_TAGS)).default([]).describe("원하는 맛·특징. 말하지 않았으면 []"),
  avoid_tastes: z.array(z.enum(TASTE_TAGS)).default([]).describe("싫다·빼 달라고 한 맛 (예: 안 매운 → spicy). 없으면 []"),
  methods: z.array(z.enum(METHODS)).default([]).describe("원하는 조리법. 없으면 []"),
  courses: z.array(z.enum(COURSES)).default([]).describe("원하는 종류(디저트·간식·음료 …). 없으면 []"),
  ingredients: z.array(z.string()).default([]).describe("원하는 재료, 한국어 (예: 감자, 코코넛). 없으면 []"),
  avoid_ingredients: z.array(z.string()).default([]).describe("빼 달라는 재료, 한국어. 없으면 []"),
});
export type IntentOutput = z.infer<typeof IntentOutput>;

export const GenerateOutput = z.object({
  speech: z.string().describe("음성으로 읽을 한국어 해요체. 후보 목록에 있는 음식만 언급"),
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
  image_credit: string | null;
  diet_badges: { key: DietKey; level: DietLevel }[];
  reason: string;
};

export type PassportSummary = {
  countries: number;
  foods: number;
  by_continent: { key: string; label: string; done: number; total: number }[];
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
  /** 질문이 가리킨 음식·장소가 DB에 없을 때 그 이름 — "제 지도에는 없어요" + 대안 (04 문서 §5-3) */
  not_in_map?: string;
  /** passport_status 일 때 요약 카드 (03 문서 #7) */
  passport?: PassportSummary;
  cached?: boolean;
  /** 답을 실제로 만든 모델 (LLM 답일 때만). 템플릿·규칙 답이면 없다 */
  model_used?: ModelUsed;
};

/** downgraded: 고른 premium 모델 대신 기본 모델이 답함 (오늘 사용액이 예산의 80% 초과) */
export type ModelUsed = { id: string; label: string; provider: string; downgraded?: true };
