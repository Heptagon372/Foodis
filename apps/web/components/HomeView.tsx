"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FoodSummary } from "@/lib/content/types";
import { exploredCountries, foodDna, update, useHydrated, useLocal } from "@/lib/client/passport";
import { speak } from "@/lib/client/voice";
import { FoodCard } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { Intro } from "./Intro";
import { PreviewBanner, Section, Wordmark } from "./bits";
import { startRadio } from "@/lib/client/radio";
import { VoiceButton } from "./VoiceButton";
import { QuestHomeCard } from "./QuestBoard";

const SHORTCUTS: [string, string, string][] = [
  ["/map", "🗺", "세계 지도"],
  ["/radio", "🎧", "라디오"],
  ["/passport/table", "🍽", "My Table"],
  ["/passport#quest", "🏅", "퀘스트"],
];

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
  // 재방문: 세션당 한 번 1초 단축 인트로 (05 문서 §2)
  // 초기값은 읽기만 (StrictMode 가 두 번 불러도 같은 값), 기록은 마운트 뒤에
  const [splash, setSplash] = useState(() => {
    try {
      return typeof window !== "undefined" && !sessionStorage.getItem("foodis:splash");
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("foodis:splash", "1");
    } catch {
      /* 저장소 막힘 → 매번 보여도 1초 */
    }
  }, []);
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
      {hydrated && introSeen && splash && <Intro short onDone={() => setSplash(false)} />}

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

      {/* 새 탐험 도구로 바로 — 탭 바는 3개로 유지하고 홈에서 한 줄로 연다 */}
      <nav className="grid grid-cols-4 gap-2" aria-label="탐험 도구">
        {SHORTCUTS.map(([href, icon, label]) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface py-3 text-caption font-medium text-charcoal/80 shadow-sm transition active:scale-95">
            <span className="text-2xl leading-none" aria-hidden>
              {icon}
            </span>
            {label}
          </Link>
        ))}
      </nav>

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

      <section className="relative overflow-hidden rounded-3xl bg-green-800 p-5 text-ivory">
        <div className="pointer-events-none absolute -right-4 -top-4 flex h-28 items-end gap-1.5 opacity-25" aria-hidden>
          {[0.5, 0.9, 0.65, 1, 0.75, 0.45].map((h, i) => (
            <span key={i} className="w-2.5 rounded-full bg-mint-500" style={{ height: `${h * 100}%` }} />
          ))}
        </div>
        <p className="text-caption font-medium tracking-wide text-mint-500">FOOD CULTURE RADIO</p>
        <p className="mt-1 font-display text-h2 font-semibold leading-snug">
          1분 음식 이야기,
          <br />
          연결을 따라 다음 나라로
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => void startRadio({ channel: "today" })} className="rounded-full bg-mint-500 px-4 py-2 text-sm font-semibold text-green-800 transition active:scale-95">
            ▶ 오늘의 라디오
          </button>
          <Link href="/radio" className="text-sm text-ivory/75 underline-offset-4 hover:underline">
            채널 보기
          </Link>
        </div>
      </section>
      <QuestHomeCard />

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
