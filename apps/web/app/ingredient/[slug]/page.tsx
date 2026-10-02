import { notFound } from "next/navigation";
import { ExploreHub } from "@/components/ExploreHub";
import { IconTile } from "@/components/ui";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

const CATEGORY: Record<string, string> = { grain: "곡물", legume: "콩류", meat: "고기", poultry: "가금류", seafood: "해산물", dairy: "유제품", egg: "달걀", vegetable: "채소", fruit: "과일", nut: "견과", spice: "향신료", herb: "허브", oil: "기름", sweetener: "감미료" };

// 재료 탐색 (F-EXP-04): "병아리콩" → 팔라펠·차나 마살라. 서로 다른 나라, 같은 재료
export default async function IngredientPage({ params }: { params: Promise<{ slug: string }> }) {
  const content = await getContent();
  const data = await content.getIngredient((await params).slug);
  if (!data) notFound();
  const { ingredient, foods } = data;
  const countries = new Set(foods.map((f) => f.country_code)).size;
  return (
    // 재료는 나라 색이 없어 연두(lime 토큰 값)를 옅게 깐다 — accentBg 가 알파를 덧붙이므로 hex 로 넘긴다
    <ExploreHub
      back={{ href: "/", label: "홈" }}
      accent="#C8F06A"
      icon={<IconTile icon="utensils" size="lg" />}
      eyebrow={`재료${ingredient.category ? ` · ${CATEGORY[ingredient.category] ?? ingredient.category}` : ""}`}
      title={ingredient.name_ko}
      subtitle={`${countries}개 나라 · ${foods.length}가지 음식에 들어가요`}
      foods={foods}
      emptyText="이 재료를 쓰는 검수된 음식이 아직 없어요."
      preview={content.mode === "preview"}
    />
  );
}
