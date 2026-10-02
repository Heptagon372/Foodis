import { HomeView } from "@/components/HomeView";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

// S2 홈 (05 문서 §3): 🎙 중앙 + 오늘의 탐험 + 나를 위한 추천 + 최근 탐험
export default async function Home() {
  const content = await getContent();
  const [all, countries] = await Promise.all([content.listFoods(), content.listCountries()]);
  // 추천 후보: 소개가 있는 음식 + 나라마다 유명도 상위 6개 (2,000개를 다 보내면 홈이 무거워진다).
  // 취향 엔진의 '대표 음식 먼저' 규칙 때문에 처음 보는 나라는 어차피 상위 3개까지만 추천된다
  const foods = all.filter((f) => f.summary || (f.fame_rank ?? 99) <= 6);
  const continents = Object.fromEntries(countries.map((c) => [c.code, c.continent_group]));
  return <HomeView foods={foods} continents={continents} preview={content.mode === "preview"} />;
}
