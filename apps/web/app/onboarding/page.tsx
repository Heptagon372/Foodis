"use client";
// S1 온보딩 (05 문서 §1): 식이 조건 + 취향 3개. 전부 건너뛸 수 있다 — 마이크 권한·긴 설문이 이탈 지점이라서 (07 문서 §5.2)
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DIET_LABEL } from "@/components/DietBadge";
import { Wordmark } from "@/components/bits";
import { TASTE_LABEL } from "@/lib/content/types";
import { getState, update, useHydrated } from "@/lib/client/passport";
import { DIET_KEYS, type DietKey } from "@/lib/foodi/schema";

const TASTES = ["spicy", "fermented", "sour", "sweet", "umami", "creamy", "fresh", "herbal", "dumpling", "noodle", "bread", "seafood", "legume", "street_food"];
const DIET_HINT: Record<DietKey, string> = {
  vegan: "동물성 재료 없이",
  vegetarian: "고기·생선 없이",
  halal: "이슬람 율법에 맞게",
  gluten_free: "밀·보리 없이",
  dairy_free: "우유·치즈 없이",
};

export default function Onboarding() {
  // 저장된 선택을 초기값으로 쓰므로 하이드레이션 뒤에만 그린다 (서버 HTML 과 불일치 방지)
  return useHydrated() ? <OnboardingForm /> : <main className="min-h-dvh" />;
}

function OnboardingForm() {
  const router = useRouter();
  const [diet, setDiet] = useState<DietKey[]>(() => getState().diet);
  const [tastes, setTastes] = useState<string[]>(() => getState().tastes);
  const flip = <T,>(list: T[], v: T, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : list);

  const finish = (save: boolean) => {
    update((s) => ({ ...s, introSeen: true, onboarded: true, ...(save ? { diet, tastes } : {}) }));
    router.push("/");
  };

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Wordmark />
        <button type="button" onClick={() => finish(false)} className="text-sm text-muted">
          건너뛰기
        </button>
      </header>

      <div className="flex-1 space-y-9 pt-8">
        <section className="space-y-4">
          <div>
            <h1 className="font-display text-h1 font-semibold">식탁에 조건이 있나요?</h1>
            <p className="mt-1 text-sm text-muted">추천에서 맞지 않는 음식은 빼고 보여드려요. 없으면 넘어가도 돼요.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DIET_KEYS.map((k) => {
              const on = diet.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDiet((d) => flip(d, k))}
                  className={`rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${on ? "border-mint-500 bg-mint-100" : "border-line bg-surface"}`}
                >
                  <span className="block font-semibold">{on ? "✓ " : ""}{DIET_LABEL[k]}</span>
                  <span className="text-caption text-muted">{DIET_HINT[k]}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-display text-h2 font-semibold">끌리는 맛 3가지</h2>
            <p className="mt-1 text-sm text-muted">Food DNA 의 첫 재료가 돼요. ({tastes.length}/3)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TASTES.map((t) => {
              const on = tastes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTastes((x) => flip(x, t, 3))}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95 ${on ? "border-green-800 bg-green-800 text-ivory" : "border-line bg-surface"}`}
                >
                  {TASTE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <button type="button" onClick={() => finish(true)} className="mt-8 w-full rounded-full bg-green-800 py-4 text-[17px] font-semibold text-ivory transition active:scale-[0.98]">
        탐험 시작하기
      </button>
      <p className="mt-3 text-center text-caption text-muted">식이 조건은 추천 필터에만 쓰이고, 언제든 Passport에서 바꿀 수 있어요.</p>
    </main>
  );
}
