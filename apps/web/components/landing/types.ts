import type { FoodSummary } from "@/lib/content/types";

/** 히어로 '오늘의 탐험' 회전 카드 한 장 — 취향 엔진이 고른 음식이면 reason("좋아하는 맛" 등)이 붙는다 */
export type RotationFood = FoodSummary & { reason?: string };

// 데스크톱 랜딩에 쓰는 사이트 숫자 — 모두 서버(app/page.tsx)에서 실제 데이터·코드 상수로 계산한다 (지어낸 숫자 금지)
export type SiteFacts = {
  countries: number;
  foods: number;
  continents: number;
  channels: number;
  diets: number;
  allergens: number;
  guards: number;
  evalCases: number;
  flags: { code: string; flag: string; name: string }[];
};
