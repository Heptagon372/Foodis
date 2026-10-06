"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FoodSummary } from "@/lib/content/types";
import { update, useHydrated, useLocal } from "@/lib/client/passport";
import { impress, useTaste } from "@/lib/client/taste";
import { buildProfile, rankFoods } from "@/lib/taste/engine";
import { speak } from "@/lib/client/voice";
import { FoodCard } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { Intro } from "./Intro";
import { DesktopLanding } from "./landing/DesktopLanding";
import type { SiteFacts } from "./landing/types";
import { PreviewBanner, Section } from "./bits";
import { startRadio } from "@/lib/client/radio";
import { VoiceButton } from "./VoiceButton";
import { QuestHomeCard } from "./QuestBoard";
import { TopBar } from "./TopBar";
import { Icon, type IconName } from "./icons";
import { btn, Eyebrow, IconTile } from "./ui";

// 지도·라디오는 탭 바·상단 내비에 있으니, 홈 바로 가기는 '내 기록'과 설정 쪽 (nav.ts 와 같은 이름)
const SHORTCUTS: [string, IconName, string][] = [
  ["/passport/table", "table", "My Table"],
  ["/quests", "quest", "퀘스트"],
  ["/passport#taste", "sparkle", "내 취향"],
  ["/settings#diet", "salad", "식단 설정"],
];

/** 날짜로 고정되는 '오늘의 탐험' — 같은 날엔 모두 같은 음식 (공유·대화 소재) */
const todayIndex = (n: number) => {
  const d = new Date();
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return n ? (seed * 2654435761) % n : 0;
};

// 홈은 컨트롤러: 계산·부수효과(인트로·노출 기록·sessionStorage)는 여기 한 곳에서, 화면은 모바일(<main lg:hidden>)과 데스크톱 랜딩(DesktopLanding, hidden lg:block) 둘로 그린다
export function HomeView({ foods, continents, preview, site }: { foods: FoodSummary[]; continents: Record<string, string>; preview: boolean; site: SiteFacts }) {
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
  const tastes = useLocal((s) => s.tastes);
  const signals = useTaste((s) => s.signals);
  const features = useTaste((s) => s.features);
  const ignored = useTaste((s) => s.impressions);
  const recent = useLocal((s) => Object.entries(s.entries).sort((a, b) => b[1].at - a[1].at).slice(0, 8));

  const allergens = useLocal((s) => s.allergens ?? []);
  const fits = (f: FoodSummary) => diet.every((k) => f.diet[k] === "yes" || f.diet[k] === "depends") && !f.allergens.some((a) => (allergens as string[]).includes(a));
  const pool = foods.filter(fits);
  // 오늘의 탐험: 각 나라의 1위 대표 음식 중에서 날짜로 고른다 (사진 있는 것 우선)
  const signature = pool.filter((f) => f.fame_rank === 1 && f.image_url);
  const todayPool = signature.length ? signature : pool;
  const today = todayPool[todayIndex(todayPool.length)] ?? foods[0];
  // 데스크톱 '맛집탐방' 타일 사진: 오늘의 탐험과 겹치지 않는 사진 있는 대표 음식 (라이브는 fame_rank 가 비어 사진 있는 아무 음식)
  const photoPool = (signature.length ? signature : pool.filter((f) => f.image_url)).filter((f) => f.id !== today?.id);
  const eatsPhoto = photoPool.length ? photoPool[(todayIndex(photoPool.length) + 7) % photoPool.length] : null;
  // 나를 위한 추천: 취향 엔진 (lib/taste/engine.ts). 초반엔 나라별 대표 음식, 신호가 쌓이면 취향 순
  const continentOf = (cc: string) => continents[cc];
  const profile = useMemo(() => buildProfile(signals, features, (cc) => continents[cc], Date.now(), { tastes }), [signals, features, continents, tastes]);
  const ranked = rankFoods(pool, profile, continentOf, { limit: 6, exclude: new Set(today ? [today.id] : []), ignored });
  const picks = ranked.map((r) => r.food);
  const learning = profile.confidence < 0.3;
  // 노출 기록 (지나친 추천을 알기 위해) — 화면에 들어올 때 한 번
  const shown = useRef(false);
  useEffect(() => {
    if (!hydrated || shown.current || !picks.length) return;
    shown.current = true;
    impress(picks);
  }, [hydrated, picks]);

  const finishIntro = () => {
    update((s) => ({ ...s, introSeen: true }));
    if (!onboarded) router.push("/onboarding");
  };

  return (
    <>
      {/* Intro 는 fixed 오버레이 — lg:hidden 트리 밖에 둬야 데스크톱에서도 보이고 introSeen 이 기록된다 */}
      {hydrated && !introSeen && <Intro onDone={finishIntro} />}
      {hydrated && introSeen && splash && <Intro short onDone={() => setSplash(false)} />}

    <main className="space-y-8 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:hidden">
      <TopBar />

      {preview && <PreviewBanner />}

      {/* 2단 인사 (레퍼런스 'Good Morning, / Plant Parent') → 음성 구슬 → 글로 묻기 알약 → 바로 가기.
          데스크톱: 왼쪽 인사 패널 | 오른쪽 오늘의 탐험 */}
      <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-stretch lg:gap-6 lg:space-y-0">
        <section className="flex flex-col items-center gap-6 pt-2 text-center lg:meadow-panel lg:justify-center lg:rounded-[32px] lg:p-8 lg:shadow-soft">
          <h1 className="text-h1 lg:text-[2.25rem]">
            <span className="block font-medium text-ink-soft">오늘은 어디로</span>
            <span className="block text-[2rem] font-bold text-ink lg:text-[2.75rem]">떠나볼까요?</span>
          </h1>
          <VoiceButton state="idle" onPress={() => open({ listen: true })} />
          <button
            type="button"
            onClick={() => open()}
            aria-label="푸디야, 무엇이든 물어보세요 — 글로 입력"
            className="glass flex h-12 w-full max-w-sm items-center gap-3 rounded-full pl-4 pr-1.5 text-left transition active:scale-[0.98]"
          >
            <Icon name="search" className="size-5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-[15px] text-ink-soft">푸디야, 무엇이든 물어보세요</span>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-on-brand" aria-hidden>
              <Icon name="arrow-right" className="size-[18px]" />
            </span>
          </button>
          <nav className="grid w-full grid-cols-4 gap-2.5 lg:max-w-md" aria-label="바로 가기">
            {SHORTCUTS.map(([href, icon, label]) => (
              <Link key={href} href={href} className="glass flex flex-col items-center gap-2 rounded-3xl px-1 pb-3 pt-3.5 text-caption font-semibold text-ink-soft transition hover:text-ink active:scale-95">
                <IconTile icon={icon} tone="soft" />
                {label}
              </Link>
            ))}
          </nav>
        </section>

        {today && (
          <Section title="오늘의 탐험">
            <FoodCard
              size="L"
              food={{ ...today, country_name: today.country_name }}
              src="home_today"
              reason={today.fame_rank === 1 ? `${today.country_name}의 대표 음식` : undefined}
              action={
                <>
                  <button type="button" onClick={() => today.summary && speak(`${today.country_name}의 ${today.name_ko}. ${today.summary}`, () => {})} className={btn("soft", "sm")}>
                    <Icon name="play" className="size-4" />
                    듣기
                  </button>
                  <button type="button" onClick={() => open({ contextFoodId: today.id, contextName: today.name_ko, question: "문화 이야기 들려줘" })} className={btn("ghost", "sm")}>
                    푸디에게 더 묻기
                  </button>
                </>
              }
            />
          </Section>
        )}
      </div>

      {/* 라디오 · 퀘스트 — 데스크톱은 나란히 */}
      <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        {/* 라디오 — 홈의 유일한 숲 패널 + 유일한 연두 CTA */}
        <section className="forest-panel relative overflow-hidden rounded-[28px] p-5 text-white">
          <div className="pointer-events-none absolute -right-3 -top-3 flex h-28 items-end gap-1.5 opacity-25" aria-hidden>
            {[0.5, 0.9, 0.65, 1, 0.75, 0.45].map((h, i) => (
              <span key={i} className="w-2.5 rounded-full bg-lime" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
          <div className="flex items-baseline gap-2">
            <Eyebrow className="text-lime">Food Culture</Eyebrow>
            <span className="font-serif text-lg italic leading-none text-lime">Radio</span>
          </div>
          <p className="relative mt-2 text-h2 font-bold text-white">
            1분 음식 이야기,
            <br />
            연결을 따라 다음 나라로
          </p>
          <div className="relative mt-5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void startRadio({ channel: "today" })} className={btn("lime", "sm")}>
              <Icon name="play" className="size-4" />
              오늘의 라디오
            </button>
            <Link href="/radio" className={btn("on-dark", "sm")}>
              채널 보기
            </Link>
          </div>
        </section>
        <QuestHomeCard />
      </div>

      {picks.length > 0 && (
        <Section
          title={learning ? "먼저 만나 볼 나라별 대표 음식" : "나를 위한 추천"}
          more={
            <Link href="/passport#taste" className="inline-flex items-center gap-1 text-caption font-medium text-leaf">
              <Icon name={learning ? "sparkle" : "check"} className="size-4" />
              {learning ? "볼수록 취향을 배워요" : `취향 반영 ${Math.round(profile.confidence * 100)}%`}
              {diet.length > 0 && " · 식이 조건 반영"}
            </Link>
          }
        >
          <div className="snap-row -mx-5 px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:*:w-full xl:grid-cols-6">
            {ranked.map((r) => (
              <FoodCard key={r.food.id} food={r.food} size="M" reason={r.reason} src="home_rec" />
            ))}
          </div>
        </Section>
      )}

      <Section title="최근 탐험">
        {recent.length ? (
          <div className="flex flex-wrap gap-2">
            {recent.map(([id, e]) => (
              <Link key={id} href={`/food/${e.slug}`} className="glass inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-ink transition active:scale-[0.97]">
                <span aria-hidden>{e.flag}</span>
                {e.name_ko}
              </Link>
            ))}
          </div>
        ) : (
          <p className="flex items-start gap-2 text-sm text-muted">
            <Icon name="mic" className="mt-px size-4 shrink-0 text-leaf" />
            아직 탐험 기록이 없어요. 위의 마이크 버튼으로 첫 여행을 시작해 보세요.
          </p>
        )}
      </Section>
    </main>

      <DesktopLanding
        today={today}
        ranked={ranked}
        learning={learning}
        confidence={profile.confidence}
        dietCount={diet.length + allergens.length}
        recent={recent.map(([id, e]) => ({ id, slug: e.slug, flag: e.flag, name_ko: e.name_ko }))}
        eatsPhoto={eatsPhoto}
        site={site}
        preview={preview}
      />
    </>
  );
}
