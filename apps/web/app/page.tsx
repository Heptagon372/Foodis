import { HomeView } from "@/components/HomeView";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

// S2 홈 (05 문서 §3): 🎙 중앙 + 오늘의 탐험 + 나를 위한 추천 + 최근 탐험
export default async function Home() {
  const content = await getContent();
  const foods = await content.listFoods();
  return <HomeView foods={foods} preview={content.mode === "preview"} />;
}
