import { notFound } from "next/navigation";
import { FoodDetailView } from "@/components/FoodDetailView";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const food = await getContent().getFood((await params).slug);
  return { title: food ? `${food.name_ko} · ${food.country.name_ko} — FOODIS` : "FOODIS" };
}

// S4 음식 상세 (05 문서 §5)
export default async function FoodPage({ params }: { params: Promise<{ slug: string }> }) {
  const content = getContent();
  const food = await content.getFood((await params).slug);
  if (!food) notFound();
  return <FoodDetailView food={food} preview={content.mode === "preview"} />;
}
