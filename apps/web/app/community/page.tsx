import { Suspense } from "react";
import { CommunityView } from "@/components/community/CommunityView";

export const metadata = { title: "커뮤니티 — FOODIS World Table", description: "밥 먹을 친구를 찾고, 다이어트·할랄·채식·한식·중식·양식·일식 모임에서 음식 이야기를 나눠요." };

// World Table (F-SOC-01): 밥친구 + 모임 피드. 주소의 ?c= 로 카테고리를 기억한다
export default function CommunityPage() {
  return (
    <Suspense>
      <CommunityView />
    </Suspense>
  );
}
