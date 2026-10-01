"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FoodSummary } from "@/lib/content/types";
import { exploredCountries, foodDna, update, useHydrated, useLocal } from "@/lib/client/passport";
import { speak } from "@/lib/client/voice";
import { FoodCard } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { Intro } from "./Intro";
import { PreviewBanner, Section, Wordmark } from "./bits";
import { VoiceButton } from "./VoiceButton";

/** 날짜로 고정되는 '오늘의 탐험' — 같은 날엔 모두 같은 음식 (공유·대화 소재) */
const todayIndex = (n: number) => {
  const d = new Date();
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return n ? (seed * 2654435761) % n : 0;
};

export function HomeView({ foods, preview }: { foods: FoodSummary[]; preview: boolean }) {
  const router = useRouter();
  const { open } = useFoodi();
  const hydrated = useHydrated();
  const introSeen = useLocal((s) => s.introSeen);
  const onboarded = useLocal((s) => s.onboarded);
  const diet = useLocal((s) => s.diet);
  const countries = useLocal(exploredCountries);
  const dna = useLocal(foodDna);
  const recent = useLocal((s) => Object.entries(s.entries).sort((a, b) => b[1].at - a[1].at).slice(0, 8));

  const allergens = useLocal((s) => s.allergens ?? []);
  const fits = (f: FoodSummary) => diet.every((k) => f.diet[k] === "yes" || f.diet[k] === "depends") && !f.allergens.some((a) => (allergens as string[]).includes(a));
  const pool = foods.filter(fits);
  const today = pool[todayIndex(pool.length)] ?? foods[0];
  // 나를 위한 추천: 안 가본 나라 우선 → Food DNA 태그 점수 (match_foods 와 같은 취지의 클라이언트 근사)
  const picks = pool
    .filter((f) => f.id !== today?.id)
    .map((f) => ({ f, s: (countries.includes(f.country_code) ? 0 : 3) + f.taste_tags.reduce((a, t) => a + (dna[t] ?? 0), 0) * 0.5 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map((x) => x.f);

  const finishIntro = () => {
    update((s) => ({ ...s, introSeen: true }));
    if (!onboarded) router.push("/onboarding");
  };

  return (
    <main className="space-y-8 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      {hydrated && !introSeen && <Intro onDone={finishIntro} />}

      <header className="flex items-center justify-between">
        <Wordmark />
        <Link href="/passport" className="rounded-full bg-surface px-3 py-1.5 text-caption font-semibold text-green-800 shadow-sm">
          📕 {countries.length}개국
        </Link>
      </header>

      {preview && <PreviewBanner />}

      <section className="flex flex-col items-center gap-5 pt-2 text-center">
        <h1 className="font-display text-h1 font-semibold">🌎 오늘은 어디로 떠나볼까요?</h1>
        <VoiceButton state="idle" onPress={() => open({ listen: true })} />
        <button type="button" onClick={() => open()} className="text-sm text-muted underline decoration-line underline-offset-4">
          “푸디야, 무엇이든 물어보세요” · 글로 입력
        </button>
      </section>

      {today && (
        <Section title="오늘의 탐험">
          <FoodCard
            size="L"
            food={{ ...today, country_name: today.country_name }}
            action={
              <>
                <button type="button" onClick={() => today.summary && speak(`${today.country_name}의 ${today.name_ko}. ${today.summary}`, () => {})} className="rounded-full bg-mint-100 px-3 py-1.5 text-sm font-medium text-green-800">
                  ▶ 듣기
                </button>
                <button type="button" onClick={() => open({ contextFoodId: today.id, contextName: today.name_ko, question: "문화 이야기 들려줘" })} className="rounded-full px-3 py-1.5 text-sm text-muted">
                  푸디에게 더 묻기
                </button>
              </>
            }
          />
        </Section>
      )}

      {picks.length > 0 && (
        <Section title="나를 위한 추천" more={diet.length > 0 ? <span className="text-caption text-muted">식이 조건 반영</span> : undefined}>
          <div className="snap-row -mx-5 px-5 pb-2">
            {picks.map((f) => (
              <FoodCard key={f.id} food={f} size="M" />
            ))}
          </div>
        </Section>
      )}

      <Section title="최근 탐험">
        {recent.length ? (
          <div className="flex flex-wrap gap-2">
            {recent.map(([id, e]) => (
              <Link key={id} href={`/food/${e.slug}`} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium">
                <span aria-hidden>{e.flag}</span>
                {e.name_ko}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">아직 탐험 기록이 없어요. 위의 🎙 버튼으로 첫 여행을 시작해 보세요.</p>
        )}
      </Section>
    </main>
  );
}
