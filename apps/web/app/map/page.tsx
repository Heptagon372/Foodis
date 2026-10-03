import { WorldMapView, type TopFood } from "@/components/WorldMapView";
import type { ExploreFood, FoodCat } from "@/components/taste/TasteExplore";
import { getContent } from "@/lib/content";
import type { Country, FoodSummary } from "@/lib/content/types";
import { env } from "@/lib/env";
import { buildWorldMap } from "@/lib/map/world";
import { placesSetup } from "@/lib/places/server";

export const metadata = { title: "World Map — FOODIS" };
export const dynamic = "force-dynamic";

const CHINESE = new Set(["CN", "TW", "HK", "MO"]);
const WESTERN_OUTSIDE_EUROPE = new Set(["US", "CA", "AU", "NZ"]);

/** 맛집탐방 분류: 나라로 한식·중식·일식·양식·기타 하나 + 식단으로 채식·할랄 (겹칠 수 있음) */
function catsOf(f: FoodSummary, c: Country | undefined): FoodCat[] {
  const cc = f.country_code;
  const out: FoodCat[] = [
    cc === "KR" ? "korean" : CHINESE.has(cc) ? "chinese" : cc === "JP" ? "japanese" : c?.continent_group === "europe" || WESTERN_OUTSIDE_EUROPE.has(cc) ? "western" : "other",
  ];
  if (f.diet.vegetarian === "yes" || f.diet.vegan === "yes") out.push("veg");
  if (f.diet.halal === "yes") out.push("halal");
  return out;
}

// S7 세계 음식 지도 (F-EXP-05): 경로는 서버에서 계산하고, 탐험 색칠·탭은 클라이언트(브라우저 Passport)에서
export default async function MapPage() {
  const content = await getContent();
  const [countries, foods] = await Promise.all([content.listCountries(), content.listFoods()]);
  const counts: Record<string, number> = {};
  for (const f of foods) counts[f.country_code] = (counts[f.country_code] ?? 0) + 1;
  // 나라 패널의 대표 음식: 그 나라 안 유명도 순(fame_rank, 없으면 뒤로) 상위 4개만 보낸다
  const rank = (r?: number | null) => r ?? Number.MAX_SAFE_INTEGER;
  const sorted = [...foods].sort((a, b) => rank(a.fame_rank) - rank(b.fame_rank));
  const top: Record<string, TopFood[]> = {};
  for (const f of sorted) {
    const list = (top[f.country_code] ??= []);
    if (list.length < 4) list.push({ slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, image_url: f.image_url, summary: f.summary });
  }
  // 맛집탐방: 한국 안 음식점에서 찾을 음식 목록 (분류는 서버에서 미리)
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const exploreFoods: ExploreFood[] = sorted.map((f) => ({ slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, flag: f.flag, image_url: f.image_url, cats: catsOf(f, byCode.get(f.country_code)) }));
  const mapKey = (env.mapProvider === "naver" ? env.naverMapClientId : env.kakaoMapJsKey) ?? null;
  return (
    <WorldMapView
      map={buildWorldMap()}
      countries={countries}
      counts={counts}
      top={top}
      preview={content.mode === "preview"}
      explore={{ foods: exploreFoods, setup: placesSetup(), mapKey }}
    />
  );
}
