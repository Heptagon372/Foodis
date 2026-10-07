import { notFound } from "next/navigation";
import { ExploreHub } from "@/components/ExploreHub";
import { NearbyFoods } from "@/components/NearbyFoods";
import { getContent } from "@/lib/content";
import type { FoodSummary } from "@/lib/content/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const d = await (await getContent()).getCountry((await params).code.toUpperCase());
  return { title: d ? `${d.country.name_ko} 음식 — FOODIS` : "FOODIS" };
}

// 국가 페이지 (F-EXP-03): Passport 국기 그리드·상세의 국가 링크에서 진입
export default async function CountryPage({ params }: { params: Promise<{ code: string }> }) {
  const content = await getContent();
  const data = await content.getCountry((await params).code.toUpperCase());
  if (!data) notFound();
  const { country, foods } = data;
  // 아직 검수된 음식이 없는 나라(150개국 중 일부)는 막다른 화면 대신 가까운 나라 음식으로 잇는다: 같은 지역 → 같은 대륙 (각각 대표 음식 순)
  let nearby: FoodSummary[] = [];
  if (!foods.length) {
    const others = (await content.listCountries()).filter((c) => c.code !== country.code);
    nearby = await content.foodsInCountries(others.filter((c) => c.region === country.region).map((c) => c.code), 6);
    if (nearby.length < 6) {
      const continent = others.filter((c) => c.region !== country.region && c.continent_group === country.continent_group).map((c) => c.code);
      nearby = [...nearby, ...(await content.foodsInCountries(continent, 6 - nearby.length))];
    }
  }
  return (
    <ExploreHub
      back={{ href: "/passport", label: "Passport" }}
      accent={country.accent_color}
      icon={country.flag_emoji}
      eyebrow={country.region}
      title={country.name_ko}
      subtitle={country.name_en}
      foods={foods}
      emptyText={`${country.name_ko} 음식은 지금 근거를 모으고 검수하는 중이에요. 출처를 확인한 음식만 지도에 올라와요.`}
      ask={foods.length ? { label: `푸디에게 ${country.name_ko} 음식 추천받기`, question: `${country.name_ko} 음식 추천해줘` } : undefined}
      footer={!foods.length && nearby.length ? <NearbyFoods foods={nearby} /> : undefined}
      countryCode={country.code}
      preview={content.mode === "preview"}
    />
  );
}
