// Orchestrator 가 쓰는 데이터 접근 계약. 실제 구현은 lib/db/foodis-repo.ts (Supabase),
// 테스트는 메모리 구현을 주입한다 → 파이프라인 전체를 네트워크 없이 검증할 수 있다.
import type { DietKey, DietLevel } from "./schema";
import type { Usage } from "@/lib/providers/types";

export type FoodRow = {
  id: string;
  slug: string;
  name_ko: string;
  name_en: string;
  country_code: string;
  summary: string | null;
  culture_story: string | null;
  taste_tags: string[];
  image_url: string | null;
  allergens: string[];
  diet: Record<DietKey, DietLevel>;
  country: { name_ko: string; flag_emoji: string; accent_color: string };
  sources: { title: string | null; url: string }[];
};

export type UserContext = {
  userId: string | null;
  diet: Record<DietKey, boolean>;
  allergens: string[];
  tagWeights: Record<string, number>;
  exploredCountries: string[];
  exploredFoodIds: string[];
};

export type MatchParams = {
  embedding: number[];
  ctx: UserContext;
  needDiet: DietKey[];
  countryCode: string | null;
  excludeFoodIds: string[];
  count: number;
};

export type ConversationLog = {
  userId: string | null;
  inputMode: "voice" | "text";
  intent: string;
  userText: string;
  aiJson: unknown;
  foodIds: string[];
  validated: boolean;
  latencyMs: number;
};

export interface FoodisRepo {
  matchFoods(p: MatchParams): Promise<string[]>;
  /** 임베딩 장애 시 대체 검색: 이름 키워드 + 식이 필터 (11 문서 §6) */
  keywordFoods(text: string, p: Omit<MatchParams, "embedding">): Promise<string[]>;
  getFoods(ids: string[]): Promise<FoodRow[]>;
  getRelatedFoodIds(foodId: string, limit: number): Promise<string[]>;
  /** 검증용: 후보 밖 음식명이 답변에 섞였는지 확인 */
  allFoodNames(): Promise<{ id: string; name_ko: string; name_en: string }[]>;
  getUserContext(userId: string | null): Promise<UserContext>;
  recordConversation(c: ConversationLog): Promise<string | null>;
  recordUsage(usages: Usage[], conversationId: string | null): Promise<void>;
  markExplored(userId: string, foodIds: string[]): Promise<void>;
  usageTodayUsd(): Promise<number>;
  cacheGet<T>(key: string): Promise<T | null>;
  cacheSet(key: string, kind: "answer" | "tts", payload: unknown, ttlHours: number): Promise<void>;
}

export const emptyDiet = (): Record<DietKey, boolean> => ({
  vegan: false,
  vegetarian: false,
  halal: false,
  gluten_free: false,
  dairy_free: false,
});
