import { WorldMapView, type TopFood } from "@/components/WorldMapView";
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
  // 나라 패널의 대표 음식: 그 나라 안 유명도 순(fame_rank, 없으면 뒤로) 상위 4개만 보낸다. 소개는 한 줄(line-clamp-1)로만 보이니 앞부분만
  const rank = (r?: number | null) => r ?? Number.MAX_SAFE_INTEGER;
  const top: Record<string, TopFood[]> = {};
  for (const f of [...foods].sort((a, b) => rank(a.fame_rank) - rank(b.fame_rank))) {
    const list = (top[f.country_code] ??= []);
    if (list.length < 4) list.push({ slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, image_url: f.image_url, summary: f.summary && f.summary.length > 90 ? `${f.summary.slice(0, 90).trimEnd()}…` : f.summary });
  }
  return <WorldMapView map={buildWorldMap()} countries={countries} counts={counts} top={top} preview={content.mode === "preview"} />;
}
