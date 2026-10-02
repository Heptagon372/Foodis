import { WorldMapView } from "@/components/WorldMapView";
import { getContent } from "@/lib/content";
import { buildWorldMap } from "@/lib/map/world";

export const metadata = { title: "World Map — FOODIS" };
export const dynamic = "force-dynamic";

// S7 세계 음식 지도 (F-EXP-05): 경로는 서버에서 계산하고, 탐험 색칠·탭은 클라이언트(브라우저 Passport)에서
export default async function MapPage() {
  const content = await getContent();
  const [countries, foods] = await Promise.all([content.listCountries(), content.listFoods()]);
  const counts: Record<string, number> = {};
  for (const f of foods) counts[f.country_code] = (counts[f.country_code] ?? 0) + 1;
  return <WorldMapView map={buildWorldMap()} countries={countries} counts={counts} preview={content.mode === "preview"} />;
}
