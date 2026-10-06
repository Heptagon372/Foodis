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
  // 고를 수 있는 음식: 나라마다 유명도 상위 20개 — 한국에서 파는 곳을 찾는 화면이라 1만 개 전부(3MB)는 필요 없다 (docs/design/20)
  const pickable = foods.filter((f) => f.fame_rank == null || f.fame_rank <= 20);
  return <EatsView foods={toExploreFoods(pickable, countries)} setup={placesSetup()} mapKey={mapKey} />;
}
