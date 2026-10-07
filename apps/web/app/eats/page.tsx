import { EatsView } from "@/components/eats/EatsView";
import { getContent } from "@/lib/content";
import { env } from "@/lib/env";
import { toExploreFoods } from "@/lib/places/food-cats";
import { placesSetup } from "@/lib/places/server";

export const metadata = { title: "맛집탐방 — FOODIS" };
export const dynamic = "force-dynamic";

// 맛집탐방: 음식을 고르면 한국 안 원하는 곳 반경에서 그 음식을 파는 곳을 지도에 — 메뉴판·영업시간·찾아가는 시간까지
export default async function EatsPage() {
  const content = await getContent();
  const [countries, foods] = await Promise.all([content.listCountries(), content.listFoods()]);
  // 지도 키는 브라우저에 노출되는 공개 키(도메인 등록으로 보호) — 서버 전용 키는 넘기지 않는다
  const mapKey = (env.mapProvider === "naver" ? env.naverMapClientId : env.kakaoMapJsKey) ?? null;
  // 처음엔 나라별 유명도 상위 10개(약 1,400개)만 — 검색어를 치면 화면이 /api/foods/explore 로 10,000개 전체를 뒤진다. 순위가 없는 음식(미리보기)은 모두 보낸다
  const browse = foods.filter((f) => (f.fame_rank ?? 0) <= 10);
  return <EatsView foods={toExploreFoods(browse, countries)} setup={placesSetup()} mapKey={mapKey} />;
}
