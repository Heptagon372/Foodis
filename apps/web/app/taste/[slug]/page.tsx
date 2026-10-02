import { notFound } from "next/navigation";
import { TasteView } from "@/components/taste/TasteView";
import { getContent } from "@/lib/content";
import { env } from "@/lib/env";
import { placesSetup } from "@/lib/places/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const food = await (await getContent()).getFood((await params).slug);
  return { title: food ? `${food.name_ko} 한국에서 맛보기 — FOODIS` : "FOODIS" };
}

// 한국에서 맛보기 (docs/design/12): 이 음식을 파는 주변 음식점 — 지도 + 목록
export default async function TastePage({ params }: { params: Promise<{ slug: string }> }) {
  const food = await (await getContent()).getFood((await params).slug);
  if (!food) notFound();
  const setup = placesSetup();
  // 지도 키는 브라우저에 노출되는 공개 키(도메인 등록으로 보호) — 서버 전용 키는 넘기지 않는다
  const mapKey = (env.mapProvider === "naver" ? env.naverMapClientId : env.kakaoMapJsKey) ?? null;
  return <TasteView food={{ id: food.id, slug: food.slug, name_ko: food.name_ko, flag: food.flag, country_name: food.country.name_ko }} setup={setup} mapKey={mapKey} dev={process.env.NODE_ENV !== "production"} />;
}
