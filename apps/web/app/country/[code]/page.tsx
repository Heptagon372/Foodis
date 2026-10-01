import { notFound } from "next/navigation";
import { ExploreHub } from "@/components/ExploreHub";
import { getContent } from "@/lib/content";

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
  return (
    <ExploreHub
      back={{ href: "/passport", label: "Passport" }}
      accent={country.accent_color}
      icon={country.flag_emoji}
      eyebrow={country.region}
      title={country.name_ko}
      subtitle={country.name_en}
      foods={foods}
      emptyText={`아직 검수된 ${country.name_ko} 음식이 없어요. 곧 추가될 예정이에요.`}
      ask={{ label: `푸디에게 ${country.name_ko} 음식 추천받기`, question: `${country.name_ko} 음식 추천해줘` }}
      preview={content.mode === "preview"}
    />
  );
}
