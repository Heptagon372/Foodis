import { Suspense } from "react";
import { CommunityView } from "@/components/community/CommunityView";
import { env } from "@/lib/env";

export const metadata = { title: "커뮤니티 — FOODIS World Table", description: "밥 먹을 친구를 찾고, 다이어트·할랄·채식·한식·중식·양식·일식 모임에서 음식 이야기를 나눠요." };

// World Table (F-SOC-01): 게시판 · 푸랜드(밥친구 찾기 지도) · 모임. 주소의 ?c= 로 카테고리, ?tab= 으로 탭을 기억한다
export default function CommunityPage() {
  return (
    <Suspense>
      <CommunityView mapProvider={env.mapProvider} mapKey={(env.mapProvider === "naver" ? env.naverMapClientId : env.kakaoMapJsKey) ?? null} />
    </Suspense>
  );
}
