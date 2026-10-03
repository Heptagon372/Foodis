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
  return <EatsView foods={toExploreFoods(foods, countries)} setup={placesSetup()} mapKey={mapKey} />;
}
