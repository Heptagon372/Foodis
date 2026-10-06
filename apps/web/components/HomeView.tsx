"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FoodSummary } from "@/lib/content/types";
import { exploredCountries, update, useHydrated, useLocal } from "@/lib/client/passport";
import { impress, useTaste } from "@/lib/client/taste";
import { buildProfile, rankFoods } from "@/lib/taste/engine";
import { FoodCard } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { Intro } from "./Intro";
import { PreviewBanner, Section } from "./bits";
import { startRadio } from "@/lib/client/radio";
import { ImageCredit } from "./ImageCredit";
import { QuestChallengeCard } from "./QuestBoard";
import { TopBar } from "./TopBar";
import { Icon, type IconName } from "./icons";
import { btn, Eyebrow } from "./ui";

/** 날짜로 고정되는 '오늘의 탐험' — 같은 날엔 모두 같은 음식 (공유·대화 소재) */
const todayIndex = (n: number) => {
  const d = new Date();
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return n ? (seed * 2654435761) % n : 0;
};

export function HomeView({ foods, continents, preview }: { foods: FoodSummary[]; continents: Record<string, string>; preview: boolean }) {
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
  const countries = useLocal(exploredCountries);
  const tried = useLocal((s) => Object.values(s.entries).filter((e) => e.statuses.includes("tried")).length);
  const recentFlags = useLocal((s) => [...new Set(Object.values(s.entries).sort((a, b) => b.at - a.at).map((e) => e.flag))].slice(0, 3));
  const fits = (f: FoodSummary) => diet.every((k) => f.diet[k] === "yes" || f.diet[k] === "depends") && !f.allergens.some((a) => (allergens as string[]).includes(a));
  const pool = foods.filter(fits);
  // 오늘의 탐험: 각 나라의 1위 대표 음식 중에서 날짜로 고른다 (사진 있는 것 우선)
  const signature = pool.filter((f) => f.fame_rank === 1 && f.image_url);
  const todayPool = signature.length ? signature : pool;
  const today = todayPool[todayIndex(todayPool.length)] ?? foods[0];
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
    <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:space-y-6 lg:px-0 lg:pt-4">
      {hydrated && !introSeen && <Intro onDone={finishIntro} />}
      {hydrated && introSeen && splash && <Intro short onDone={() => setSplash(false)} />}

      <TopBar />

      {preview && <PreviewBanner />}

      {/* 1행: 히어로(오늘의 탐험 사진 위 큰 인사 + 핵심 CTA) | 이번 주 챌린지 — 레퍼런스 docs/design/17 */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
        <Hero today={today} onTalk={() => open({ listen: true })} onAsk={() => open()} />
        <QuestChallengeCard />
      </div>

      {/* 2행: 기능 타일 4칸 (레퍼런스 Aircraft · Scenarios · Training · Achievements) */}
      <nav className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5" aria-label="탐험 메뉴">
        <Tile href="/map" title="세계 지도" sub={hydrated ? `${countries.length}개국 탐험` : "나라를 골라 떠나기"}>
          <GlobeArt />
        </Tile>
        <Tile href="/radio" title="음식 라디오" sub="1분 음식 이야기" action={{ icon: "play", label: "오늘의 라디오 재생", onClick: () => void startRadio({ channel: "today" }) }}>
          <WaveArt />
        </Tile>
        <Tile href="/community" title="World Table" sub="함께 먹는 이야기">
          <CenterIcon icon="users" />
        </Tile>
        <Tile href="/passport" title="Passport" sub={hydrated ? `${tried}개 음식 기록` : "나의 음식 여권"}>
          <FlagBadges flags={hydrated ? recentFlags : []} />
        </Tile>
      </nav>

      {/* 3행: 상태 스트립 (레퍼런스 Flight Zone · Wind · Altitude · GPS + Fly Now) — 홈 바로 가기도 겸한다 */}
      <section className="panel grid grid-cols-2 gap-1 rounded-[24px] p-2 lg:flex lg:items-center lg:gap-0 lg:p-2.5" aria-label="나의 탐험 현황">
        <Stat href={today ? `/country/${today.country_code}` : "/map"} icon="pin" label="오늘의 나라" value={today ? `${today.flag} ${today.country_name}` : "—"} />
        <Stat href="/passport/table" icon="table" label="먹어본 음식" value={hydrated ? `${tried}개` : "—"} />
        <Stat href="/passport#taste" icon="sparkle" label="취향 반영" value={hydrated ? `${Math.round(profile.confidence * 100)}%` : "—"} />
        <Stat href="/settings#diet" icon="salad" label="식단 조건" value={hydrated ? (diet.length + allergens.length ? `${diet.length + allergens.length}개 반영` : "없음") : "—"} />
        <button type="button" onClick={() => open()} className={`${btn("lime", "lg")} col-span-2 mt-1 lg:mt-0 lg:ml-2 lg:w-56 lg:shrink-0`}>
          <Icon name="search" className="size-5" />
          푸디에게 묻기
        </button>
      </section>

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
            아직 탐험 기록이 없어요. 위의 &lsquo;푸디에게 말하기&rsquo;로 첫 여행을 시작해 보세요.
          </p>
        )}
      </Section>
    </main>
  );
}

/** 히어로 — 오늘의 탐험 사진을 바탕으로 큰 2단 인사 + 핵심 CTA. 사진 위라 글자는 흰색, 컨트롤은 glass-dark */
function Hero({ today, onTalk, onAsk }: { today: FoodSummary | undefined; onTalk: () => void; onAsk: () => void }) {
  const photo = today?.image_url;
  return (
    <section className="forest-panel relative isolate flex min-h-[22rem] flex-col justify-end overflow-hidden rounded-[28px] p-6 lg:min-h-[25rem] lg:p-9">
      {photo && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 외부 음식 사진 (FoodCard 와 같은 소스) */}
          <img src={photo} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(5_8_6/0.92)_0%,rgb(5_8_6/0.7)_45%,rgb(5_8_6/0.15)_100%),linear-gradient(0deg,rgb(5_8_6/0.75)_0%,transparent_55%)]" />
        </>
      )}
      <Eyebrow className="text-lime">Let&apos;s explore</Eyebrow>
      <h1 className="mt-3 text-[2.25rem] font-bold leading-[1.08] tracking-[-0.03em] text-white lg:text-[3.25rem]">
        <span className="block">오늘은 어디로</span>
        <span className="block">떠나볼까요?</span>
      </h1>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/75">세계 음식 문화를 목소리로 탐험하는 가장 쉬운 방법.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onTalk} className={btn("lime", "lg")} aria-label="푸디에게 말하기">
          <Icon name="mic" className="size-5" />
          푸디에게 말하기
        </button>
        {today && (
          <Link href={`/food/${today.slug}`} className="glass-dark inline-flex h-14 items-center gap-2.5 rounded-full pl-2 pr-4 text-sm transition hover:bg-white/10">
            <span className="grid size-10 place-items-center rounded-full bg-white/10 text-xl" aria-hidden>
              {today.flag}
            </span>
            <span className="leading-tight">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-lime">오늘의 탐험</span>
              <span className="block font-semibold">{today.name_ko}</span>
            </span>
          </Link>
        )}
        <button type="button" onClick={onAsk} aria-label="푸디야, 무엇이든 물어보세요 — 글로 입력" className="glass-dark grid size-14 place-items-center rounded-full transition hover:bg-white/10">
          <Icon name="search" className="size-5" />
        </button>
      </div>
      {today?.image_credit && <ImageCredit credit={today.image_credit} link={false} className="absolute right-3 top-3" />}
    </section>
  );
}

/** 기능 타일 — 제목 + 초록 부제 + 그림 칸 + 오른쪽 아래 원형 화살표(또는 동작 버튼). 카드 전체가 링크 */
function Tile({ href, title, sub, children, action }: { href: string; title: string; sub: string; children: ReactNode; action?: { icon: IconName; label: string; onClick: () => void } }) {
  return (
    <div className="panel group relative flex flex-col gap-3 rounded-[24px] p-3.5 transition hover:border-leaf/40 lg:p-4">
      <div>
        <Link href={href} className="text-[15px] font-semibold text-ink after:absolute after:inset-0 after:rounded-[24px] lg:text-base">
          {title}
        </Link>
        <p className="text-caption font-medium text-leaf">{sub}</p>
      </div>
      <div className="relative h-24 overflow-hidden rounded-[18px] border border-line bg-[radial-gradient(80%_90%_at_50%_100%,var(--neon-fill),transparent_70%)] lg:h-32" aria-hidden>
        {children}
      </div>
      {action ? (
        <button type="button" onClick={action.onClick} aria-label={action.label} className="cta absolute bottom-5 right-5 z-10 grid size-9 place-items-center rounded-full transition active:scale-95 lg:bottom-6 lg:right-6">
          <Icon name={action.icon} className="size-4 translate-x-px fill-current" />
        </button>
      ) : (
        <span className="glass absolute bottom-5 right-5 grid size-9 place-items-center rounded-full text-ink transition group-hover:text-leaf lg:bottom-6 lg:right-6" aria-hidden>
          <Icon name="next" className="size-4" />
        </span>
      )}
    </div>
  );
}

/** 타일 그림: 격자 바닥 위 네온 지구 */
function GlobeArt() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] bg-[size:22px_22px]">
      <Icon name="earth" className="size-14 text-leaf drop-shadow-[0_0_12px_rgb(61_245_122/0.6)] lg:size-16" strokeWidth={1.25} />
    </div>
  );
}

/** 타일 그림: 라디오 이퀄라이저 막대 */
function WaveArt() {
  return (
    <div className="absolute inset-x-4 bottom-0 top-4 flex items-end justify-center gap-1.5">
      {[0.35, 0.6, 0.9, 0.55, 1, 0.7, 0.45, 0.8, 0.5, 0.3].map((h, i) => (
        <span key={i} className="w-2 rounded-t-full bg-lime/80 shadow-[0_0_10px_rgb(61_245_122/0.5)]" style={{ height: `${h * 100}%` }} />
      ))}
    </div>
  );
}

function CenterIcon({ icon }: { icon: IconName }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <span className="grid size-16 place-items-center rounded-full border border-lime/40 bg-lime-soft text-leaf shadow-[0_0_24px_-4px_rgb(61_245_122/0.6)] lg:size-20">
        <Icon name={icon} className="size-7 lg:size-8" />
      </span>
    </div>
  );
}

/** 타일 그림: 최근 탐험한 나라 국기 3개 = 배지 (없으면 빈 배지 자리) */
function FlagBadges({ flags }: { flags: string[] }) {
  const slots = [0, 1, 2].map((i) => flags[i]);
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-1.5 pb-6 lg:gap-2.5 lg:pb-0">
      {slots.map((f, i) => (
        <span key={i} className={`grid size-10 place-items-center rounded-xl border text-xl lg:size-14 lg:rounded-2xl lg:text-2xl ${f ? "border-lime/50 bg-lime-soft shadow-[0_0_16px_-4px_rgb(61_245_122/0.6)]" : "border-dashed border-line"}`}>
          {f ?? <Icon name="stamp" className="size-5 text-muted" />}
        </span>
      ))}
    </div>
  );
}

/** 상태 스트립 한 칸 — 아이콘 + 작은 라벨 + 값 (데스크톱은 칸 사이 세로 구분선) */
function Stat({ href, icon, label, value }: { href: string; icon: IconName; label: string; value: string }) {
  return (
    <Link href={href} className="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-ink/5 lg:flex-1 lg:rounded-none lg:border-r lg:border-line">
      <Icon name={icon} className="size-5 shrink-0 text-leaf" />
      <span className="min-w-0 leading-tight">
        <span className="block text-[12px] text-ink-soft">{label}</span>
        <span className="block truncate text-sm font-semibold text-ink">{value}</span>
      </span>
    </Link>
  );
}
