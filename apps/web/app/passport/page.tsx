import { PassportView } from "@/components/PassportView";
import { getContent } from "@/lib/content";

export const metadata = { title: "Passport — FOODIS" };
export const dynamic = "force-dynamic";

// S5 Passport (05 문서 §6)
export default async function PassportPage() {
  const content = await getContent();
  // Food DNA 매칭 추천 후보: 홈과 같은 나라별 대표 음식 상위 6개 (lib/taste/dna.ts 가 내 DNA 로 다시 줄 세운다)
  const [countries, foods] = await Promise.all([content.listCountries(), content.topFoods({ perCountry: 6 })]);
  return <PassportView countries={countries} foods={foods} preview={content.mode === "preview"} />;
}
