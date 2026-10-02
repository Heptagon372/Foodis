// 라우트·페이지 공용: 콘텐츠에서 음식 찾기 · 키 설정 상태 (서버 전용)
import "server-only";
import { getContent } from "@/lib/content";
import { env } from "@/lib/env";
import type { FoodLite } from "./nearby";

export async function foodLite(slug: string): Promise<FoodLite | null> {
  const content = await getContent();
  const f = await content.getFood(slug);
  if (!f) return null;
  return { id: f.id, slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, country_code: f.country_code, country_name: f.country.name_ko, course_type: f.course_type, live: content.mode === "live" };
}

/** 개발 미리보기에서만 예시 데이터 허용 — 운영 빌드에서는 어떤 경우에도 false */
export const allowExample = () => process.env.NODE_ENV !== "production";

/** 화면에 보여줄 키 설정 상태 (값은 절대 내보내지 않고 있음/없음만) */
export function placesSetup() {
  return {
    kakaoRest: Boolean(env.kakaoRestKey),
    mapProvider: env.mapProvider,
    mapKey: env.mapProvider === "naver" ? Boolean(env.naverMapClientId) : Boolean(env.kakaoMapJsKey),
    google: Boolean(env.googleMapsKey),
    ftc: Boolean(env.ftcFranchiseKey),
    example: allowExample() && !env.kakaoRestKey,
  };
}
export type PlacesSetup = ReturnType<typeof placesSetup>;
