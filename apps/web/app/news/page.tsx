import { Suspense } from "react";
import { NewsView } from "@/components/news/NewsView";

export const metadata = { title: "음식 뉴스 — FOODIS", description: "음식·식문화 뉴스를 30분마다 모아 지금 뜨는 음식을 보여 줘요." };

export default function NewsPage() {
  return (
    <Suspense>
      <NewsView />
    </Suspense>
  );
}
