"use client";
// S1 온보딩 (05 문서 §1): 식이 조건 + 취향 3개. 전부 건너뛸 수 있다 — 마이크 권한·긴 설문이 이탈 지점이라서 (07 문서 §5.2)
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DIET_LABEL } from "@/components/DietBadge";
import { Wordmark } from "@/components/bits";
import { TASTE_LABEL } from "@/lib/content/types";
import { getState, update, useHydrated } from "@/lib/client/passport";
import { DIET_KEYS, type Allergen, type DietKey } from "@/lib/foodi/schema";
import { ALLERGEN_LABEL } from "@/components/DietBadge";
import { GuardPicker } from "@/components/DietGuard";
import { Icon } from "@/components/icons";
import { btn, chip } from "@/components/ui";

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
  const [allergens, setAllergens] = useState<Allergen[]>(() => getState().allergens ?? []);
  const [guards, setGuards] = useState<string[]>(() => getState().guards ?? []);
  const [more, setMore] = useState(() => guards.length > 0);
  const flip = <T,>(list: T[], v: T, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : list);

  const finish = (save: boolean) => {
    update((s) => ({ ...s, onboarded: true, ...(save ? { diet, guards, tastes, allergens } : {}) }));
    router.push("/");
  };

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Wordmark />
        <button type="button" onClick={() => finish(false)} className={btn("ghost", "sm")}>
          건너뛰기
        </button>
      </header>

      <div className="flex-1 space-y-9 pt-8">
        <section className="space-y-4">
          <div>
            <h1 className="text-h1">
              <span className="block font-medium text-ink-soft">식탁에</span>
              <span className="block font-bold text-ink">조건이 있나요?</span>
            </h1>
            <p className="mt-2 text-sm text-ink-soft">추천에서 맞지 않는 음식은 빼고 보여드려요. 없으면 넘어가도 돼요.</p>
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
                  className={`flex min-h-16 items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.98] ${on ? "border-brand bg-brand text-on-brand shadow-brand" : "border-line bg-surface text-ink"}`}
                >
                  {/* 켜짐은 색만이 아니라 체크 표시로도 알린다 */}
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${on ? "border-on-brand/60 bg-on-brand/15" : "border-line"}`} aria-hidden>
                    {on && <Icon name="check" className="size-3.5" strokeWidth={2.5} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{DIET_LABEL[k]}</span>
                    <span className={`text-caption ${on ? "text-on-brand/80" : "text-muted"}`}>{DIET_HINT[k]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className={`${btn("ghost", "sm")} w-full justify-between`}>
            종교 · 채식 단계 · 다이어트 · 건강 조건 {guards.length ? `(${guards.length})` : "더 보기"}
            <Icon name="next" className={`size-4 transition ${more ? "rotate-90" : ""}`} />
          </button>
          {more && (
            <GuardPicker
              extraOnly
              diet={diet}
              guards={guards}
              onChange={(n) => {
                setDiet(n.diet);
                setGuards(n.guards);
              }}
            />
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-h2 font-bold text-ink">피해야 할 재료</h2>
            <p className="mt-1 text-sm text-ink-soft">이 재료가 들어간 음식은 추천하지 않아요. 다른 알레르기는 Passport에서 더 고를 수 있어요.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["nuts", "shellfish", "peanut"] as Allergen[]).map((a) => {
              const on = allergens.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAllergens((x) => flip(x, a))}
                  // 켜짐 = 빼는 재료 → 식이 '불가' 의미색 + X 아이콘
                  className={on ? "inline-flex h-10 select-none items-center gap-1.5 rounded-full border border-diet-no bg-diet-no/10 px-4 text-sm font-semibold text-diet-no transition active:scale-[0.97]" : chip(false)}
                >
                  {on && <Icon name="close" className="size-4" strokeWidth={2.25} />}
                  {ALLERGEN_LABEL[a]}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-h2 font-bold text-ink">끌리는 맛 3가지</h2>
            <p className="mt-1 text-sm text-ink-soft">Food DNA 의 첫 재료가 돼요. ({tastes.length}/3)</p>
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
                  className={chip(on)}
                >
                  {on && <Icon name="check" className="size-4" strokeWidth={2.25} />}
                  {TASTE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <button type="button" onClick={() => finish(true)} className={`${btn("primary", "lg")} mt-8 w-full`}>
        탐험 시작하기
      </button>
      <p className="mt-3 text-center text-caption text-muted">식이 조건은 추천 필터에만 쓰이고, 언제든 Passport에서 바꿀 수 있어요.</p>
    </main>
  );
}
