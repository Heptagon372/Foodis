import { HomeView } from "@/components/HomeView";
import type { SiteFacts } from "@/components/landing/types";
import { getContent } from "@/lib/content";
import { pickSlides } from "@/lib/content/slides";
import { GUARD_KEYS } from "@/lib/diet/guard";
import { EVAL_CASES } from "@/lib/foodi/eval/cases";
import { ALLERGENS, DIET_KEYS } from "@/lib/foodi/schema";
import { CHANNELS } from "@/lib/radio/queue";

export const dynamic = "force-dynamic";

// S2 홈 (05 문서 §3): 음성 버튼 중앙 + 오늘의 탐험 + 나를 위한 추천 + 최근 탐험. 데스크톱은 같은 데이터로 랜딩 페이지 (docs/design/18)
export default async function Home() {
  const content = await getContent();
  const [all, countries, foodCount] = await Promise.all([content.listFoods(), content.listCountries(), content.countFoods()]);
  // 추천 후보: 나라마다 유명도 상위 6개 (약 900개). 10,000개를 다 보내면 홈 HTML 이 9MB 가 된다.
  // 취향 엔진의 '대표 음식 먼저' 규칙 때문에 처음 보는 나라는 어차피 상위 3개까지만 추천된다.
  // 유명도 순위가 없는 음식(새로 들어온 것)은 소개가 있으면 넣는다 — 순위표(fame.json)가 비어 있는 미리보기에서도 홈이 비지 않게
  const foods = all.filter((f) => (f.fame_rank == null ? Boolean(f.summary) : f.fame_rank <= 6));
  const continents = Object.fromEntries(countries.map((c) => [c.code, c.continent_group]));
  // 첫 화면 랜덤 음식 슬라이드: 1만 개 전체에서 사진 있는 음식을 나라가 겹치지 않게 18개 (요청마다 새로)
  const slides = pickSlides(all, 18);
  // 데스크톱 랜딩 숫자: 이미 받은 데이터와 코드 상수로만 (서버에서 개수만 — 평가 문항 등은 클라이언트 번들에 넣지 않는다)
  const step = Math.max(1, Math.floor(countries.length / 24));
  const site: SiteFacts = {
    countries: countries.length,
    foods: foodCount,
    continents: new Set(countries.map((c) => c.continent_group)).size,
    channels: Object.keys(CHANNELS).length,
    diets: DIET_KEYS.length,
    allergens: ALLERGENS.length,
    guards: GUARD_KEYS.length,
    evalCases: EVAL_CASES.length,
    flags: countries
      .filter((_, i) => i % step === 0)
      .slice(0, 24)
      .map((c) => ({ code: c.code, flag: c.flag_emoji, name: c.name_ko })),
  };
  return <HomeView foods={foods} slides={slides} continents={continents} preview={content.mode === "preview"} site={site} />;
}
