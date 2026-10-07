"use client";
// 데스크톱(lg 이상) 홈 = 랜딩 페이지 (docs/design/18). 레퍼런스 구조: 히어로 → 랜덤 음식 슬라이드 → 출처 띠(Partners) → 기능 벤토(Features) → 추천(인기 띠)
// → 왜 FOODIS(Why us) → 이렇게 물어보세요(Review 자리) → FAQ → CTA. 모양은 레퍼런스의 진한 판 + 파낸 모서리(노치) + 도킹 화살표.
// 화면만 그린다 — 인트로·노출 기록·sessionStorage 같은 부수효과는 HomeView 한 곳에서. 숨은 트리(모바일)에서는 사진·영상을 내려받지 않는다
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SlideFood } from "@/lib/content/slides";
import type { FoodSummary } from "@/lib/content/types";
import { exploredCountries, useHydrated, useLocal } from "@/lib/client/passport";
import { useQuest } from "@/lib/client/quest";
import { startRadio } from "@/lib/client/radio";
import { speak } from "@/lib/client/voice";
import { CHANNELS, type ChannelId } from "@/lib/radio/queue";
import type { Ranked } from "@/lib/taste/engine";
import { PreviewBanner } from "../bits";
import { GuardTag, useGuard } from "../DietGuard";
import { accentBg } from "../FoodCard";
import { FoodMarquee } from "../FoodMarquee";
import { useFoodi } from "../FoodiSheet";
import { Icon, type IconName } from "../icons";
import { ImageCredit } from "../ImageCredit";
import { ProgressRing } from "../QuestBoard";
import { TrackLink } from "../TrackLink";
import { btn, Eyebrow, IconButton, IconTile, ProgressBar } from "../ui";
import { VoiceButton } from "../VoiceButton";
import { ASKS, faq, MORE_FEATURES, SOURCES, WHY } from "./copy";
import { AskForm, dockBtn, FoodTile, IntroClip, LandingHead, useCarousel } from "./parts";
import type { RotationFood, SiteFacts } from "./types";

type Recent = { id: string; slug: string; flag: string; name_ko: string };
type Props = {
  today: FoodSummary | undefined;
  /** 히어로 '오늘의 탐험' 카드가 7초마다 돌아가며 보여 줄 음식들 (오늘 음식이 첫 장, 그 뒤는 취향 엔진 순). 비어 있으면 today 만 */
  rotation: RotationFood[];
  ranked: Ranked<FoodSummary>[];
  learning: boolean;
  confidence: number;
  /** 지금 켜진 식단 조건 수 (식이·식단 기준·알레르기) — 히어로 '식단 설정' 바로 가기 */
  conditionCount: number;
  /** 추천 후보를 식이·알레르기로 걸렀는지 — 추천 띠의 '식이 조건 반영' 칩 */
  dietFiltered: boolean;
  recent: Recent[];
  eatsPhoto: FoodSummary | null;
  /** 첫 화면 랜덤 음식 슬라이드 (app/page.tsx 가 요청마다 뽑는다) */
  slides: SlideFood[];
  site: SiteFacts;
  preview: boolean;
};

const ko = (n: number) => n.toLocaleString("ko-KR");

export function DesktopLanding({ today, rotation, ranked, learning, confidence, conditionCount, dietFiltered, recent, eatsPhoto, slides, site, preview }: Props) {
  return (
    <div data-landing className="hidden space-y-20 pb-6 pt-2 lg:block xl:space-y-24">
      {preview && <PreviewBanner />}
      <div className="space-y-8">
        <Hero today={today} rotation={rotation} learning={learning} confidence={confidence} conditionCount={conditionCount} site={site} />
        <FoodMarquee foods={slides} size="lg" />
        <SourcesBand site={site} />
      </div>
      <Features recent={recent} eatsPhoto={eatsPhoto} site={site} />
      {ranked.length > 0 && <ForYou ranked={ranked} learning={learning} confidence={confidence} dietFiltered={dietFiltered} />}
      <WhyUs site={site} />
      <Asks />
      <Faq site={site} />
      <Cta site={site} />
    </div>
  );
}

/* ───────── 히어로: 진한 판 + 왼쪽 위 노치(묻기 알약) + 아래 노치(바로가기 4칸) ───────── */

function Hero({ today, rotation, learning, confidence, conditionCount, site }: { today: FoodSummary | undefined; rotation: RotationFood[]; learning: boolean; confidence: number; conditionCount: number; site: SiteFacts }) {
  const { open } = useFoodi();
  const hydrated = useHydrated();
  const q = useQuest();
  const shortcuts: { href: string; icon: IconName; label: string; sub: string }[] = [
    { href: "/passport/table", icon: "table", label: "My Table", sub: "탐험한 음식이 접시로" },
    { href: "/quests", icon: "quest", label: "퀘스트", sub: hydrated && q.ready && q.quests.length ? `${q.doneCount}/${q.quests.length} 완료` : "이번 주 퀘스트" },
    { href: "/passport#taste", icon: "sparkle", label: "내 취향", sub: learning ? "볼수록 배워요" : `취향 반영 ${Math.round(confidence * 100)}%` },
    { href: "/settings#diet", icon: "salad", label: "식단 설정", sub: conditionCount ? `조건 ${conditionCount}개 적용 중` : "비건·할랄·알레르기" },
  ];
  return (
    <section aria-labelledby="desk-hero-title" className="relative [--bh:5.75rem] [--bw:38rem] [--bx:5rem] [--nh:5rem] [--nw:34rem] xl:[--bw:46rem] xl:[--nw:38rem]">
      {/* 형제 ① 왼쪽 위 노치에 앉은 묻기 알약 — 화면에서 맨 위·왼쪽이라 탭 순서도 처음 (판보다 먼저, z-10 으로 위에) */}
      <AskForm tone="dark" className="absolute left-0 top-0 z-10 h-[calc(var(--nh)_-_0.75rem)] w-[calc(var(--nw)_-_0.75rem)]" />
      {/* 판: 음성 구슬이 맥박치므로 desk-shadow(필터)를 걸지 않는다 */}
      <div className="slab notch notch-lg notch-tl notch-b relative grid min-h-[40rem] grid-cols-12 gap-8 rounded-[40px] px-10 pb-[7.5rem] pt-10 xl:px-12">
        <div className="col-span-7 flex flex-col pt-[calc(var(--nh)_-_0.5rem)]">
          <p className="glass-dark inline-flex h-10 w-fit items-center gap-2 rounded-full pl-1.5 pr-4 text-[13px] font-semibold">
            <span className="flex -space-x-2" aria-hidden>
              {site.flags.slice(0, 3).map((f) => (
                <span key={f.code} className="grid size-7 place-items-center rounded-full bg-white/90 text-sm">
                  {f.flag}
                </span>
              ))}
            </span>
            {site.countries}개국 · 음식 {ko(site.foods)}개를 한 지도에
          </p>
          <div className="relative mt-6">
            {/* tabIndex -1: 푸터 '맨 위로'가 포커스를 여기로 옮긴다 */}
            <h1 id="desk-hero-title" tabIndex={-1} className="font-bold text-white outline-none">
              <span className="block text-[1.75rem] font-medium text-white/75">오늘은 어디로</span>
              <span className="block text-hero xl:text-[5.25rem]">떠나볼까요?</span>
            </h1>
            <span aria-hidden className="absolute -bottom-7 left-[38%] inline-flex h-9 -rotate-[4deg] items-center rounded-lg bg-lime px-4 text-[15px] font-semibold text-on-lime shadow-glow">
              Different Cultures, One&nbsp;<span className="font-serif italic">Table.</span>
            </span>
          </div>
          <p className="mt-12 max-w-[30rem] text-subtitle text-white/80">검색창 대신 말로 물어보세요. 푸디가 음식 카드로 답하고, 다음 나라까지 이어 줘요.</p>
          <div className="mt-8 flex items-center gap-5">
            <VoiceButton size="md" state="idle" onPress={() => open({ listen: true })} />
            <span>
              <b className="block text-title font-bold text-white">눌러서 말하기</b>
              <span className="text-caption text-white/70">마이크를 누르고 편하게 말해요</span>
            </span>
            <span aria-hidden className="h-10 w-px bg-white/15" />
            <Link href="/map" className={btn("on-dark", "lg")}>
              <Icon name="map" className="size-5" />
              세계 지도 열기
            </Link>
          </div>
          <ul className="mt-6 flex gap-5 text-sm text-white/70">
            {["로그인 없이 바로 시작", "녹음은 저장하지 않아요"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Icon name="check" className="size-4 text-lime" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-5 flex flex-col">
          <p aria-hidden className="mb-4 text-right text-[12px] tracking-[0.5em] text-white/60">
            VOICE · FOOD · CULTURE
          </p>
          <div className="relative flex-1">{today ? <TodayCard foods={rotation.length ? rotation : [today]} /> : <TodayEmpty />}</div>
        </div>

        {/* 둥근 버튼 2개 (레퍼런스의 하트·북마크 자리) */}
        <div className="absolute bottom-6 right-10 flex gap-3">
          <button type="button" onClick={() => open()} aria-label="사진으로 물어보기" title="푸디 창의 카메라 버튼으로 사진을 보내요" className={ROUND}>
            <Icon name="camera" className="size-6" />
          </button>
          <Link href="/settings" aria-label="설정" className={ROUND}>
            <Icon name="settings" className="size-6" />
          </Link>
        </div>
      </div>

      {/* 형제 ② 아래 노치에 앉은 바로가기 4칸 (모바일 홈 바로 가기와 같은 기능) */}
      <nav aria-label="내 기록 바로 가기" className="absolute bottom-0 left-[calc(var(--bx)_+_0.75rem)] grid h-[calc(var(--bh)_-_0.75rem)] w-[calc(var(--bw)_-_1.5rem)] grid-cols-4 gap-3">
        {shortcuts.map((s) => (
          <Link key={s.href} href={s.href} className="card flex h-full items-center gap-3 rounded-[24px] px-3.5 transition hover:border-leaf/40">
            <IconTile icon={s.icon} tone="soft" size="sm" />
            <span className="min-w-0">
              <b className="block text-sm font-semibold text-ink">{s.label}</b>
              <span className="hidden truncate text-[12px] text-muted xl:block">{s.sub}</span>
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}

const ROUND = "grid size-14 place-items-center rounded-full bg-surface text-leaf shadow-lift ring-[5px] ring-white/12 transition hover:bg-lime hover:text-on-lime";

/** 한 장 보여 주는 시간 · 흐려지며 사라지는 시간 (ms) */
const ROTATE_MS = 7000;
const FADE_MS = 450;

/** 오늘의 탐험 카드 — foods 를 7초마다 한 장씩: 흐려지며 사라졌다가(blur + 투명) 다음 음식 사진·설명이 나타난다.
 *  멈춤: 마우스를 올리거나 카드 안에 포커스가 있을 때(읽는 중) · 탭이 숨겨졌을 때 · prefers-reduced-motion 이면 아예 돌지 않는다 */
function TodayCard({ foods }: { foods: RotationFood[] }) {
  const { open } = useFoodi();
  const [i, setI] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const today = foods[i] ?? foods[0];
  const many = foods.length > 1;

  useEffect(() => {
    if (!many || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setHidden(true);
      fade = setTimeout(() => {
        setI((x) => (x + 1) % foods.length);
        setHidden(false);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => {
      clearInterval(tick);
      if (fade) clearTimeout(fade);
    };
  }, [many, paused, foods.length]);

  // 다음 장 사진을 미리 받아 두어 바뀌는 순간 비지 않게
  useEffect(() => {
    if (!many) return;
    const next = foods[(i + 1) % foods.length]?.image_url;
    if (next) new Image().src = next;
  }, [i, many, foods]);

  const guardFood = useMemo(() => ({ ...today, ingredients: today.ingredient_names }), [today]);
  const guard = useGuard(guardFood);
  const href = `/food/${today.slug}`;
  const blurb = today.summary ?? (today.fame_rank === 1 ? `${today.country_name}에서 가장 널리 알려진 음식이에요. 푸디에게 이야기를 들어 보세요.` : "푸디에게 이 음식 이야기를 물어보세요.");
  const fade = `transition-[opacity,filter] duration-[450ms] ease-out ${hidden ? "opacity-0 blur-sm" : "opacity-100 blur-0"}`;
  return (
    <>
      <article
        className="notch notch-br dock-sm card flex h-full flex-col rounded-[28px] p-2.5"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setPaused(false)}
        aria-live="polite"
      >
        <TrackLink food={today} src="home_today" href={href} aria-label={`${today.name_ko} 사진 — 자세히 보기`} className={`relative block h-52 shrink-0 overflow-hidden rounded-[20px] focus-visible:outline-offset-[-3px] ${fade}`} style={accentBg(today.accent, today.image_url)}>
          <span className="glass absolute left-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-caption font-semibold text-ink">
            <span aria-hidden>{today.flag}</span>
            {today.country_name}
          </span>
          <ImageCredit credit={today.image_credit} link={false} className="absolute bottom-3 right-3" />
          {!today.image_url && (
            <span aria-hidden className="absolute inset-0 grid place-items-center text-6xl">
              {today.flag}
            </span>
          )}
          {many && (
            // 몇 장째인지 — 점만 (글자 없이). 클릭은 사진 링크라 점은 장식
            <span aria-hidden className="glass absolute bottom-3 left-3 flex h-6 items-center gap-1 rounded-full px-2">
              {foods.map((f, k) => (
                <span key={f.id} className={`h-1.5 rounded-full transition-all duration-300 ${k === i ? "w-4 bg-brand" : "w-1.5 bg-ink/30"}`} />
              ))}
            </span>
          )}
        </TrackLink>
        <div className={`flex flex-1 flex-col gap-2 px-3 pb-2 pr-16 pt-4 ${fade}`}>
          {/* 취향 엔진이 고른 장은 이유를 보여 준다 ("좋아하는 맛" · "아직 안 가본 대륙" …), 오늘 음식·대표 음식은 나라 이름 */}
          <Eyebrow className={today.reason ? "flex items-center gap-1 text-leaf" : "text-leaf"}>
            {today.reason && <Icon name="sparkle" className="size-3.5" />}
            {i === 0 ? "오늘의 탐험" : today.reason ? `내 취향 · ${today.reason}` : "오늘의 탐험"}
            {!today.reason && today.fame_rank === 1 ? ` · ${today.country_name}의 대표 음식` : ""}
          </Eyebrow>
          <h2 className="text-h2 font-bold text-ink">{today.name_ko}</h2>
          <p className="line-clamp-2 text-[15px] text-ink-soft">{blurb}</p>
          {guard.hits[0] && (
            <span className="flex">
              <GuardTag r={guard} size="md" />
            </span>
          )}
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {today.summary && (
              <button type="button" onClick={() => speak(`${today.country_name}의 ${today.name_ko}. ${today.summary}`, () => {})} className={btn("soft", "sm")}>
                <Icon name="play" className="size-4" />
                듣기
              </button>
            )}
            <button type="button" onClick={() => open({ contextFoodId: today.id, contextName: today.name_ko, question: "문화 이야기 들려줘" })} className={btn("ghost", "sm")}>
              푸디에게 더 묻기
            </button>
          </div>
        </div>
      </article>
      <TrackLink food={today} src="home_today" href={href} aria-label={`${today.name_ko} 자세히 보기`} className={`${dockBtn("panel")} absolute bottom-0 right-0`}>
        <Icon name="arrow-right" className="size-5" />
      </TrackLink>
    </>
  );
}

function TodayEmpty() {
  return (
    <>
      <div className="notch notch-br dock-sm card flex h-full flex-col justify-end rounded-[28px] p-6 pr-20">
        <Eyebrow>오늘의 탐험</Eyebrow>
        <p className="mt-2 text-h2 font-bold text-ink">세계 지도에서 첫 나라를 골라 보세요</p>
      </div>
      <Link href="/map" aria-label="세계 지도 열기" className={`${dockBtn("panel")} absolute bottom-0 right-0`}>
        <Icon name="arrow-right" className="size-5" />
      </Link>
    </>
  );
}

/* ───────── 출처 띠 (레퍼런스의 Partners 자리 — 실제로 데이터·사진을 가져오는 곳만) ───────── */

function SourcesBand({ site }: { site: SiteFacts }) {
  return (
    <section aria-label="데이터·사진 출처" className="card flex h-[4.75rem] items-center gap-8 rounded-full pl-8 pr-2.5">
      <p className="hidden shrink-0 text-caption font-semibold text-muted xl:block">열린 지식으로 차린 식탁</p>
      <ul className="flex flex-1 items-center justify-around gap-6">
        {SOURCES.map((s) => (
          <li key={s.name}>
            <a href={s.href} target="_blank" rel="noreferrer" className="group flex flex-col leading-tight">
              <b className="text-[17px] font-bold tracking-tight text-ink-soft group-hover:text-ink">{s.name}</b>
              <span className="text-[11px] text-muted">{s.role}</span>
            </a>
          </li>
        ))}
      </ul>
      <Link href="/map" className="slab flex h-14 shrink-0 items-center gap-2 rounded-full px-5 transition hover:brightness-110">
        <span aria-hidden className="flex -space-x-1.5 text-xl">
          {site.flags.slice(3, 8).map((f) => (
            <span key={f.code}>{f.flag}</span>
          ))}
        </span>
        <span className="text-sm font-semibold">{site.countries}개국</span>
        <Icon name="arrow-right" className="size-4 text-lime" />
      </Link>
    </section>
  );
}

/* ───────── 기능 벤토: 엇갈린 2+2 타일 + 도킹 화살표, 아래에 나머지 기능 칩 줄 ───────── */

const RADIO_CHANNELS = (Object.keys(CHANNELS) as ChannelId[]).filter((id) => id !== "today");

function Tile({ span, face, href, label, children }: { span: string; face: string; href: string; label: string; children: ReactNode }) {
  return (
    <div className={`relative ${span}`}>
      <div className={`notch notch-br dock-sm relative h-full rounded-[32px] ${face}`}>{children}</div>
      <Link href={href} aria-label={label} className={`${dockBtn("page")} absolute bottom-0 right-0`}>
        <Icon name="arrow-right" className="size-5" />
      </Link>
    </div>
  );
}

function Features({ recent, eatsPhoto, site }: { recent: Recent[]; eatsPhoto: FoodSummary | null; site: SiteFacts }) {
  const { open } = useFoodi();
  const hydrated = useHydrated();
  const explored = useLocal(exploredCountries).length;
  const q = useQuest();
  const next = q.quests.find((x) => !x.done);
  const earned = q.badges.filter((b) => b.earnedAt != null).length;
  return (
    <section id="features" aria-labelledby="desk-features" className="space-y-8">
      <LandingHead
        id="desk-features"
        eyebrow="What you can do"
        title="말로 묻고, 지도로 떠나고, 근처에서 맛봐요"
        desc={`${site.countries}개국 음식을 음성·지도·라디오로 탐험하고, 마음에 든 음식은 가까운 음식점에서 실제로 먹어 볼 수 있어요.`}
      />
      <div className="grid auto-rows-[minmax(19rem,auto)] grid-cols-12 gap-5">
        {/* ① 라디오 — 랜딩에서 유일한 글로우 면 */}
        <Tile span="col-span-7" face="forest-panel overflow-hidden p-8" href="/radio" label="라디오 채널 모두 보기">
          <div className="pointer-events-none absolute -right-3 -top-3 flex h-28 items-end gap-1.5 opacity-25" aria-hidden>
            {[0.5, 0.9, 0.65, 1, 0.75, 0.45].map((h, i) => (
              <span key={i} className="w-2.5 rounded-full bg-lime" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
          <div className="flex items-baseline gap-2">
            <Eyebrow className="text-lime">Food Culture</Eyebrow>
            <span className="font-serif text-lg italic leading-none text-lime">Radio</span>
          </div>
          <h3 className="relative mt-3 text-[1.75rem] font-bold leading-tight text-white">
            1분 음식 이야기,
            <br />
            연결을 따라 다음 나라로
          </h3>
          <p className="relative mt-2 text-white/75">채널 {site.channels}개 · 대본은 검수된 DB 문장만 읽어요.</p>
          <div className="relative mt-6 flex flex-wrap gap-2 pr-16">
            <button type="button" onClick={() => void startRadio({ channel: "today" })} className={btn("lime", "md")}>
              <Icon name="play" className="size-4" />
              오늘의 라디오
            </button>
            {RADIO_CHANNELS.map((id) => (
              <button key={id} type="button" onClick={() => void startRadio({ channel: id })} className={btn("on-dark", "sm")}>
                <Icon name={CHANNELS[id].icon} className="size-4" />
                {CHANNELS[id].title}
              </button>
            ))}
          </div>
        </Tile>

        {/* ② 세계 지도 — 내 진행 */}
        <Tile span="col-span-5" face="meadow-panel p-8" href="/map" label="세계 지도 열기">
          <Eyebrow>World map</Eyebrow>
          <p className="mt-3 text-[3.5rem] font-bold leading-none tracking-[-0.04em] text-brand tabular-nums">
            {hydrated ? explored : "—"}
            <span className="text-h2 text-ink-soft"> / {site.countries}개국</span>
          </p>
          <ProgressBar className="mt-4 h-2" value={hydrated ? explored : 0} max={site.countries} label="탐험한 나라" />
          <div className="mt-5 flex flex-wrap gap-2 pr-14">
            {hydrated && recent.length ? (
              recent.slice(0, 3).map((r) => (
                <Link key={r.id} href={`/food/${r.slug}`} className="glass inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-ink">
                  <span aria-hidden>{r.flag}</span>
                  {r.name_ko}
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted">아직 탐험한 나라가 없어요. 지도에서 첫 나라를 골라 보세요.</p>
            )}
          </div>
        </Tile>

        {/* ③ 이번 주 퀘스트 */}
        <Tile span="col-span-5" face="card p-8" href="/quests" label="퀘스트 보기">
          <div className="flex items-center gap-3">
            <IconTile icon="quest" size="lg" />
            <Eyebrow>Weekly quest</Eyebrow>
          </div>
          {q.ready && q.quests.length ? (
            <div className="mt-6 flex items-center gap-5 pr-10">
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="text-h2 font-bold text-ink">
                  이번 주 퀘스트 {q.doneCount}/{q.quests.length}
                </h3>
                <p className="text-ink-soft">{next ? `다음: ${next.next}` : "모두 완료했어요"}</p>
                <p className="text-caption text-muted">
                  배지 {earned}/{q.badges.length}
                  {q.streak ? ` · 연속 ${q.streak}주` : ""}
                </p>
              </div>
              <ProgressRing value={q.doneCount} max={q.quests.length} className="size-16" />
            </div>
          ) : (
            <div className="mt-6 h-40 rounded-2xl bg-sunken/70" />
          )}
        </Tile>

        {/* ④ 맛집탐방 — 사진 타일 */}
        <Tile span="col-span-7" face={`overflow-hidden ${eatsPhoto?.image_url ? "" : "card"}`} href="/eats" label="맛집탐방 열기">
          {eatsPhoto?.image_url && (
            <>
              <div className="absolute inset-0" style={accentBg(eatsPhoto.accent, eatsPhoto.image_url)} />
              <div className="absolute inset-0 bg-gradient-to-t from-shade/85 via-shade/25 to-transparent" />
              <span className="glass-dark absolute left-6 top-6 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-caption font-semibold">
                <span aria-hidden>{eatsPhoto.flag}</span>
                {eatsPhoto.name_ko} · {eatsPhoto.country_name}
              </span>
              <ImageCredit credit={eatsPhoto.image_credit} className="absolute right-6 top-6" />
            </>
          )}
          <div className={`absolute inset-x-0 bottom-0 p-8 pr-24 ${eatsPhoto?.image_url ? "text-white" : "text-ink"}`}>
            <Eyebrow className={eatsPhoto?.image_url ? "text-lime" : "text-leaf"}>Eat nearby</Eyebrow>
            <h3 className="mt-2 text-[1.75rem] font-bold leading-tight">탐험한 음식, 근처에서 맛보기</h3>
            <p className={`mt-2 ${eatsPhoto?.image_url ? "text-white/80" : "text-ink-soft"}`}>반경 3~10km 안의 음식점을 찾아요. 위치는 저장하지 않아요.</p>
          </div>
        </Tile>
      </div>

      {/* 나머지 기능 칩 줄 (레퍼런스의 'Its Type Variation · Galaxy' 알약 줄) */}
      <nav aria-label="다른 기능" className="slab flex flex-wrap items-center gap-2 rounded-[32px] p-2.5">
        <span className="inline-flex h-11 items-center rounded-full bg-surface px-5 text-sm font-semibold text-ink">이것도 할 수 있어요</span>
        {MORE_FEATURES.map((f) => {
          const cls = "inline-flex h-11 items-center gap-2 rounded-full border border-white/18 bg-white/8 px-4 text-sm text-white/90 transition hover:bg-white/16";
          const inner = (
            <>
              <Icon name={f.icon} className="size-4 text-lime" />
              {f.label}
            </>
          );
          return f.action === "photo" ? (
            <button key={f.label} type="button" onClick={() => open()} className={cls}>
              {inner}
            </button>
          ) : (
            <Link key={f.label} href={f.href!} className={cls}>
              {inner}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

/* ───────── 나를 위한 추천 (레퍼런스 3의 인기 띠) ───────── */

function ForYou({ ranked, learning, confidence, dietFiltered }: { ranked: Ranked<FoodSummary>[]; learning: boolean; confidence: number; dietFiltered: boolean }) {
  return (
    <section aria-labelledby="desk-foryou" className="space-y-8 rounded-[40px] bg-sunken p-8 xl:p-10">
      <LandingHead
        id="desk-foryou"
        eyebrow="For you"
        title={learning ? "먼저 만나 볼 나라별 대표 음식" : "나를 위한 추천"}
        desc={learning ? "처음엔 나라마다 가장 유명한 음식부터 소개해요. 볼수록 취향을 배워요." : "보고, 누르고, 머문 음식으로 고른 추천이에요."}
        aside={
          <>
            <Link href="/passport#taste" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-[13px] font-semibold text-on-brand">
              <Icon name={learning ? "sparkle" : "check"} className="size-4" />
              {learning ? "볼수록 취향을 배워요" : `취향 반영 ${Math.round(confidence * 100)}%`}
            </Link>
            {dietFiltered && <span className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-4 text-[13px] text-ink-soft">식이 조건 반영</span>}
          </>
        }
      />
      <div className="grid grid-cols-3 gap-5">
        {ranked.map((r) => (
          <FoodTile key={r.food.id} food={r.food} reason={r.reason} />
        ))}
      </div>
    </section>
  );
}

/* ───────── 왜 FOODIS (레퍼런스의 Why us + 둘째 진한 판, 아래로 튀어나온 탭) ───────── */

function WhyUs({ site }: { site: SiteFacts }) {
  const chips = [`식이 ${site.diets}종 · 4단계`, `알레르기 ${site.allergens}종`, `식단 기준 ${site.guards}개`, `점검 질문 ${site.evalCases}개`];
  return (
    <section id="why" aria-labelledby="desk-why" className="desk-shadow">
      <div className="slab relative rounded-[40px] p-10 pb-12">
        <span className="inline-flex h-9 items-center rounded-full bg-lime px-4 text-[12px] font-bold uppercase tracking-[0.14em] text-on-lime">Why FOODIS</span>
        <h2 id="desk-why" className="mt-4 text-section font-bold text-white">
          믿고 물어볼 수 있게 만들었어요
        </h2>
        <p className="mt-3 max-w-xl text-subtitle text-white/75">그럴듯하게 지어내지 않도록, 사실은 DB가 맡고 AI는 해설만 해요.</p>
        <div className="mt-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {WHY.map((w, i) => (
            <article key={w.title} className="min-h-[15rem] space-y-3 rounded-[28px] bg-surface p-6 text-ink">
              <div className="flex items-center justify-between">
                <IconTile icon={w.icon} tone="soft" />
                <span className="text-caption font-semibold tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="text-title font-bold">{w.title}</h3>
              <p className="text-[15px] leading-relaxed text-ink-soft">{w.body}</p>
            </article>
          ))}
        </div>
        <ul className="mt-8 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c} className="inline-flex h-10 items-center rounded-full border border-white/20 bg-white/12 px-4 text-[13px] font-semibold text-white">
              {c}
            </li>
          ))}
        </ul>
        <a href="#faq" className="tab-bottom right-16 inline-flex h-14 items-center gap-2 px-7 text-sm font-semibold">
          자주 묻는 질문
          <Icon name="down" className="size-4 text-lime" />
        </a>
      </div>
    </section>
  );
}

/* ───────── 이렇게 물어보세요 (레퍼런스의 Review 자리 — 지어낸 후기 대신 실제 점검 질문) ───────── */

function Asks() {
  const { open } = useFoodi();
  const c = useCarousel<HTMLDivElement>();
  return (
    <section aria-labelledby="desk-asks" className="space-y-8">
      <LandingHead
        id="desk-asks"
        eyebrow="Try asking"
        title="푸디에게 이렇게 물어보세요"
        desc="푸디가 제대로 답하는지 점검할 때 쓰는 실제 질문이에요. 누르면 바로 물어봐요."
        aside={
          <>
            <IconButton icon="arrow-left" label="이전 질문" variant="outline" onClick={c.prev} disabled={c.atStart} />
            <IconButton icon="arrow-right" label="다음 질문" variant="outline" onClick={c.next} disabled={c.atEnd} />
          </>
        }
      />
      <div ref={c.ref} onScroll={c.onScroll} className="snap-row -mx-6 gap-5 px-6 py-3 [scroll-padding-inline:1.5rem]">
        {ASKS.map((a) => (
          <button key={a.id} type="button" onClick={() => open({ question: a.q })} className="group relative block w-[21rem] shrink-0 rounded-[28px] text-left">
            <div className="notch notch-br dock-sm card flex min-h-[15rem] flex-col rounded-[28px] p-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-7 items-center rounded-full bg-lime-soft px-3 text-[12px] font-semibold text-leaf">{a.tag}</span>
                <Icon name="mic" className="size-4 text-muted" />
              </div>
              <p className="mt-5 text-[1.25rem] font-bold leading-snug text-ink">“{a.q}”</p>
              <p className="mt-auto pr-14 pt-5 text-[14px] text-ink-soft">
                <b className="text-leaf">푸디는</b> {a.does}
              </p>
            </div>
            <span aria-hidden className={`${dockBtn("dark")} absolute bottom-0 right-0 group-hover:bg-lime group-hover:text-on-lime`}>
              <Icon name="arrow-right" className="size-5" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ───────── FAQ (레퍼런스 2: 제목 왼쪽 + 아코디언 / 레퍼런스 3: 첫 항목 펼침·채움) ───────── */

function Faq({ site }: { site: SiteFacts }) {
  const { open } = useFoodi();
  return (
    <section id="faq" aria-labelledby="desk-faq" className="grid grid-cols-12 gap-10">
      <div className="col-span-4 space-y-4 self-start lg:sticky lg:top-(--desk-sticky)">
        <Eyebrow>FAQ</Eyebrow>
        <h2 id="desk-faq" className="text-section font-bold text-ink">
          자주 묻는 질문
        </h2>
        <p className="text-ink-soft">여기 없는 궁금증은 푸디에게 직접 물어보세요. 모르는 건 모른다고 답해요.</p>
        <button type="button" onClick={() => open()} className={btn("primary", "md")}>
          <Icon name="mic" className="size-5" />
          푸디에게 묻기
        </button>
      </div>
      <div className="col-span-8 space-y-3">
        {faq(site.guards).map((f, i) => (
          <details key={f.q} name="faq" open={i === 0} className="group rounded-[24px] border border-line bg-surface shadow-soft transition open:border-transparent open:bg-forest">
            <summary className="flex cursor-pointer list-none items-center gap-4 rounded-[24px] px-6 py-5 text-[17px] font-semibold text-ink group-open:text-white [&::-webkit-details-marker]:hidden">
              <span className="flex-1">{f.q}</span>
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink-soft transition group-open:rotate-45 group-open:bg-lime group-open:text-on-lime">
                <Icon name="plus" className="size-5" />
              </span>
            </summary>
            <p className="px-6 pb-6 text-[15px] leading-relaxed text-white/80">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ───────── CTA (레퍼런스 2의 마지막 한 번 더 + 오른쪽 위 노치에 앉은 인트로 영상) ───────── */

function Cta({ site }: { site: SiteFacts }) {
  const { open } = useFoodi();
  return (
    <section aria-labelledby="desk-cta" className="relative [--nh:13rem] [--nw:22rem]">
      <div className="desk-shadow">
        <div className="slab notch notch-lg notch-tr relative min-h-[26rem] rounded-[40px] p-12 pr-[24rem]">
          <Eyebrow className="text-lime">Start exploring</Eyebrow>
          <h2 id="desk-cta" className="mt-3 text-[3rem] font-bold leading-[1.05] tracking-[-0.035em] text-white">
            다음 나라는
            <br />
            푸디에게 물어보세요
          </h2>
          <p className="mt-5 max-w-md text-subtitle text-white/80">로그인 없이 바로 시작해요. 기록은 원하면 계정으로 이어 가요.</p>
          <div className="mt-8 flex gap-3">
            <button type="button" onClick={() => open({ listen: true })} className={btn("lime", "lg")}>
              <Icon name="mic" className="size-5" />
              말로 물어보기
            </button>
            <Link href="/passport" className={btn("on-dark", "lg")}>
              내 Passport 보기
            </Link>
          </div>
          <div className="absolute bottom-8 right-8 w-[19rem] rounded-[24px] border border-white/15 bg-white/10 p-4">
            <p aria-hidden className="grid grid-cols-8 gap-1 text-[1.5rem] leading-none">
              {site.flags.slice(8, 24).map((f) => (
                <span key={f.code}>{f.flag}</span>
              ))}
            </p>
            <p className="mt-3 text-caption font-semibold text-white">{site.countries}개국이 지도에서 기다려요</p>
            <p className="text-caption text-white/85">
              음식 {ko(site.foods)}개 · 대륙 {site.continents}곳 · 라디오 채널 {site.channels}개
            </p>
          </div>
        </div>
      </div>
      {/* 형제: 오른쪽 위 노치에 앉은 인트로 영상 (화면에 들어올 때 한 번 재생 → 워드마크에서 멈춤). desk-shadow 밖 — 재생 중 필터를 다시 그리지 않게 */}
      <IntroClip className="absolute right-0 top-0 h-[calc(var(--nh)_-_0.75rem)] w-[calc(var(--nw)_-_0.75rem)] rounded-[24px] shadow-lift" />
    </section>
  );
}
