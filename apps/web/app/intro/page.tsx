"use client";
// 인트로 다시 보기 (발표 데모용). 홈에서는 첫 방문 1회만 자동으로 나온다.
import { useRouter } from "next/navigation";
import { Intro } from "@/components/Intro";
import { getState, update } from "@/lib/client/passport";

export default function IntroPage() {
  const router = useRouter();
  return (
    <Intro
      onDone={() => {
        update((s) => ({ ...s, introSeen: true }));
        router.push(getState().onboarded ? "/" : "/onboarding");
      }}
    />
  );
}
