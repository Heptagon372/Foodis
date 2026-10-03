import { BuddyChat } from "@/components/community/buddy/BuddyChat";

export const metadata = { title: "푸랜드 대화 — FOODIS", robots: { index: false } };

// 푸랜드 1:1 대화방. 대화한 두 사람만 열 수 있다 (API 가 확인)
export default async function BuddyChatPage({ params }: { params: Promise<{ id: string }> }) {
  return <BuddyChat id={(await params).id} />;
}
