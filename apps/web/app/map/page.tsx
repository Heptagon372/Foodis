import { WorldMapView, type TopFood } from "@/components/WorldMapView";
import { getContent } from "@/lib/content";
import { buildWorldMap } from "@/lib/map/world";

export const metadata = { title: "World Map — FOODIS" };
export const dynamic = "force-dynamic";

// S7 세계 음식 지도 (F-EXP-05): 경로는 서버에서 계산하고, 탐험 색칠·탭은 클라이언트(브라우저 Passport)에서
export default async function MapPage() {
  const content = await getContent();
  // 나라별 음식 수 · 나라 패널의 대표 음식(그 나라 안 유명도 상위 4개)은 DB 가 세고 골라 준다. 소개는 한 줄(line-clamp-1)로만 보이니 앞부분만
  const [countries, counts, foods] = await Promise.all([content.listCountries(), content.countryFoodCounts(), content.topFoods({ perCountry: 4 })]);
  const top: Record<string, TopFood[]> = {};
  for (const f of foods) {
    (top[f.country_code] ??= []).push({ slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, image_url: f.image_url, summary: f.summary && f.summary.length > 90 ? `${f.summary.slice(0, 90).trimEnd()}…` : f.summary });
  }
  return <WorldMapView map={buildWorldMap()} countries={countries} counts={counts} top={top} preview={content.mode === "preview"} />;
}
