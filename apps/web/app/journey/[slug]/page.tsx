import { notFound } from "next/navigation";
import { JourneyView, type JourneyStopView } from "@/components/JourneyView";
import { getContent } from "@/lib/content";
import { RELATION_LABEL, type FoodSummary } from "@/lib/content/types";
import { buildJourneyMap } from "@/lib/journey/map";
import { buildJourney, JOURNEY_TYPES } from "@/lib/journey/route";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const food = await (await getContent()).getFood((await params).slug);
  return { title: food ? `${food.name_ko}의 여정 — FOODIS` : "FOODIS" };
}

// S9 음식의 여정 (기능 #14): 관계 그래프(역사적 연결 → 지역 변이)를 따라 나라를 잇고, 경로·타임라인은 서버에서 계산
export default async function JourneyPage({ params }: { params: Promise<{ slug: string }> }) {
  const content = await getContent();
  const journey = await buildJourney((await params).slug, content.getFood);
  if (!journey) notFound();
  const { food, stops } = journey;

  const map = buildJourneyMap(stops.map((s) => ({ country: s.food.country_code, from: s.via?.from ?? null })));
  // 클라이언트에는 화면에 쓰는 필드만 (식이·이미지 등은 빼서 페이로드를 줄인다)
  const view: JourneyStopView[] = stops.map(({ food: f, via }) => ({
    slug: f.slug,
    name_ko: f.name_ko,
    flag: f.flag,
    country: f.country_name,
    via: via && { from: via.from, label: RELATION_LABEL[via.type], description: via.description },
  }));
  // 여정이 없을 때 막다른 화면 대신: 다른 관계(비슷한 맛·같은 재료…) → 같은 나라 음식
  const similar: FoodSummary[] = [];
  if (stops.length < 2) {
    for (const f of [...food.relations.filter((r) => !(JOURNEY_TYPES as readonly string[]).includes(r.type)).map((r) => r.food), ...food.sameCountry]) {
      if (similar.length < 6 && f.slug !== food.slug && !similar.some((s) => s.slug === f.slug)) similar.push(f);
    }
  }
  return <JourneyView food={{ slug: food.slug, name_ko: food.name_ko }} stops={view} map={map} similar={similar} preview={content.mode === "preview"} />;
}
