import { QuestBoard } from "@/components/QuestBoard";
import { TopBar } from "@/components/TopBar";
import { Eyebrow } from "@/components/ui";

export const metadata = { title: "퀘스트 — FOODIS" };

// 이번 주 퀘스트 + 배지 (예전 Passport 중간에 있던 보드를 '내 기록' 카테고리의 한 화면으로)
export default function QuestsPage() {
  return (
    <main className="space-y-6 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar back={{ href: "/passport", label: "Passport" }} />
      <div className="space-y-1">
        <Eyebrow>Food Quest</Eyebrow>
        <h1 className="text-h1 font-bold text-ink">이번 주 퀘스트</h1>
        <p className="text-sm text-ink-soft">음식을 탐험하면 퀘스트가 채워지고 배지가 쌓여요.</p>
      </div>
      <QuestBoard />
    </main>
  );
}
