// Orchestrator 가 쓰는 데이터 접근 계약. 실제 구현은 lib/db/foodis-repo.ts (Supabase),
// 미리보기·테스트는 메모리 구현(lib/preview/source.ts)을 주입한다 → 파이프라인 전체를 네트워크 없이 검증할 수 있다.
import { hitsAllergen } from "@/lib/diet/allergens";
import type { DietKey, DietLevel } from "./schema";
import type { IndexedFood } from "./food-index";
import type { Usage } from "@/lib/providers/types";

export type FoodRow = {
  id: string;
  slug: string;
  name_ko: string;
  name_en: string;
  country_code: string;
  origin_note: string | null;
  summary: string | null;
  history: string | null;
  culture_story: string | null;
  region_in_country?: string | null;
  cooking_method?: string | null;
  course_type?: string | null;
  /** 주재료 → 부재료 순 한국어 이름 (LLM 이 "왜 골랐는지" 말할 근거) */
  ingredients?: string[];
  taste_tags: string[];
  image_url: string | null;
  image_credit: string | null;
  allergens: string[];
  diet: Record<DietKey, DietLevel>;
  diet_note: string | null;
  country: { name_ko: string; flag_emoji: string; accent_color: string };
  sources: { title: string | null; url: string }[];
};

export type CountryRow = { code: string; name_ko: string; name_en: string; continent_group: string };
/** country_code: 사진 인식 후보 목록에 나라를 함께 보여주려고 (F-VIS-01). 테스트 가짜 데이터는 생략 가능 */
/** links: 위키 언어판 수 (세계적 유명도 — DB foods.popularity, 0014) */
export type FoodName = { id: string; name_ko: string; name_en: string; name_local?: string | null; country_code?: string; fame_rank?: number | null; links?: number | null };

export type UserContext = {
  userId: string | null;
  /** profiles.display_name — 인사말의 호칭 ("{이름}님", 없으면 "사용자님"). LLM 프롬프트에는 넣지 않는다 */
  displayName?: string | null;
  diet: Record<DietKey, boolean>;
  allergens: string[];
  tagWeights: Record<string, number>;
  exploredCountries: string[];
  exploredFoodIds: string[];
};

export type VectorParams = {
  embedding: number[];
  needDiet: DietKey[];
  /** 피하는 알레르기 (표준 키) */
  allergens: string[];
  countryCode: string | null;
  excludeFoodIds: string[];
  count: number;
};
export type VectorHit = { id: string; sim: number };
export type RelationEdge = { id: string; type: string };

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
  /** 검색 색인용 1만 개 경량 행. 같은 배열을 돌려주는 동안 색인을 다시 만들지 않는다 (food-index.ts foodIndexOf) */
  foodIndex(): Promise<IndexedFood[]>;
  /** 의미 검색: 질의 임베딩과 가까운 음식 (식이·알레르기·나라는 DB 가 거른다). 임베딩이 없으면 [] */
  vectorSearch(p: VectorParams): Promise<VectorHit[]>;
  /** 저장된 음식 임베딩끼리 가까운 이웃 (비슷한 음식). 임베딩이 없으면 [] */
  neighbors(foodId: string, count: number): Promise<VectorHit[]>;
  /** 검수된 관계 (양방향) */
  relationsOf(foodId: string): Promise<RelationEdge[]>;
  getFoods(ids: string[]): Promise<FoodRow[]>;
  /** 검수된 관계, strength 순. type 을 주면 그 관계만 */
  getRelatedFoodIds(foodId: string, limit: number, type?: string): Promise<string[]>;
  /** 슬롯 추출(음식 이름 인식)·검증(후보 밖 음식명 차단)·음성 인식 힌트용. 유명한 음식부터 */
  allFoodNames(): Promise<FoodName[]>;
  countries(): Promise<CountryRow[]>;
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

/** 식이 조건(yes·depends 허용)과 회피 알레르기를 모두 만족하는가 — match_foods RPC 의 하드 필터와 같은 규칙.
 *  알레르기는 표기(한국어·영어 키)가 달라도 같은 것으로 본다 (lib/diet/allergens.ts) */
export const fitsProfile = (f: Pick<FoodRow, "diet" | "allergens">, need: DietKey[], avoid: string[]) =>
  need.every((k) => f.diet[k] === "yes" || f.diet[k] === "depends") && !hitsAllergen(f.allergens, avoid);
