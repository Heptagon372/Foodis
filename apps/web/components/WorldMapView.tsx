"use client";
// S7 세계 음식 지도 (F-EXP-05): 나라를 탭하면 아래 카드 → 국가 페이지·푸디. 경로는 서버가 계산해 넘기고(lib/map/world.ts) 여기서는 색칠·탭·확대만.
// 색(테마 토큰 → 라이트는 흰/연두 지도, 다크는 밤의 숲 지도): 바다 = sunken, 아직 = surface + 리프 테두리, 탐험 = brand, 고른 나라 = lime, 130개국 밖 = line(탭 불가)
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Country } from "@/lib/content/types";
import type { Box, WorldMap } from "@/lib/map/world";
import { exploredCountries, useLocal, type LocalState } from "@/lib/client/passport";
import { accentBg } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner } from "./bits";
import { Icon } from "./icons";
import { useRadioMiniVisible } from "./RadioMini";
import { BackLink, Eyebrow, IconButton, ProgressBar, btn, chip } from "./ui";
import { MicIcon } from "./VoiceButton";

const CHIPS: [string, string][] = [
  ["all", "전체"],
  ["asia", "아시아"],
  ["europe", "유럽"],
  ["mena_africa", "중동·아프리카"],
  ["americas", "아메리카"],
  ["oceania", "오세아니아"],
];
const ZOOM_MS = 280;

/** 나라별 탐험한 음식 수 (선택 카드의 진행 바) */
const seenByCountry = (s: LocalState) => {
  const n: Record<string, number> = {};
  for (const e of Object.values(s.entries)) n[e.cc] = (n[e.cc] ?? 0) + 1;
  return n;
};

export function WorldMapView({ map, countries, counts, preview }: { map: WorldMap; countries: Country[]; counts: Record<string, number>; preview: boolean }) {
  const { open } = useFoodi();
  const explored = useLocal(exploredCountries);
  const seen = useLocal(seenByCountry);
  const mini = useRadioMiniVisible();
  const [view, setView] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const vb = useRef<Box>(map.views.all);

  const byCode = new Map(countries.map((c) => [c.code, c]));
  const done = explored.filter((c) => byCode.has(c)).length;
  const sel = selected ? byCode.get(selected) : undefined;

  // 대륙 칩 → viewBox 를 ≤300ms 동안 보간. 프레임마다 React 렌더를 돌리지 않고 svg 속성만 바꾼다
  useEffect(() => {
    const el = svg.current;
    const to = map.views[view] ?? map.views.all;
    if (!el) return;
    const from = vb.current;
    const set = (b: Box) => ((vb.current = b), el.setAttribute("viewBox", b.join(" ")));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return void set(to);
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ZOOM_MS);
      const e = 1 - (1 - t) ** 3; // ease-out
      set(from.map((v, i) => v + (to[i] - v) * e) as Box);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // 백그라운드 탭 등에서 rAF 가 멈춰도 목적지에는 도착하게
    const end = setTimeout(() => set(to), ZOOM_MS + 50);
    return () => (cancelAnimationFrame(raf), clearTimeout(end));
  }, [view, map.views]);

  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) card.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  const pick = (code: string) => setSelected((cur) => (cur === code ? null : code));
  const onKey = (code: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(code);
    }
  };
  const isDone = (code: string) => explored.includes(code);
  const fillOf = (code: string) => (selected === code ? "var(--color-lime)" : isDone(code) ? "var(--color-brand)" : "var(--color-surface)");
  // 아직인 나라는 옅은 리프 테두리로 '누를 수 있는 땅'(지도 밖 회색과 구분), 탐험한 나라끼리는 surface 경계로 갈라 보이게
  const edgeOf = (code: string) => (isDone(code) ? { stroke: "var(--color-surface)", strokeOpacity: 1 } : { stroke: "var(--color-leaf)", strokeOpacity: 0.45 });
  const label = (code: string, name: string) => `${name}${isDone(code) ? " · 탐험함" : ""}`;
  const total = sel ? (counts[sel.code] ?? 0) : 0;
  const tried = sel ? Math.min(seen[sel.code] ?? 0, total) : 0;
  const selShape = selected ? map.shapes.find((s) => s.code === selected) : undefined;

  return (
    <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <BackLink href="/" label="홈" />
        <Link href="/passport" className="glass inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-caption font-semibold text-ink transition active:scale-95">
          <Icon name="passport" className="size-[18px] text-leaf" />
          Passport
        </Link>
      </header>
      {preview && <PreviewBanner />}

      <div className="space-y-3">
        <div className="space-y-1">
          <Eyebrow>World Food Map</Eyebrow>
          <h1 className="text-h1 font-bold text-ink">세계 음식 지도</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="shrink-0 text-ink-soft">
            <span className="text-h2 font-bold tabular-nums text-leaf">{done}</span>
            <span className="text-caption font-semibold tabular-nums">/{countries.length}개국 탐험</span>
          </p>
          <ProgressBar value={done} max={countries.length} label="세계 지도 탐험 진행" />
        </div>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]" role="group" aria-label="대륙 보기">
        {CHIPS.map(([k, name]) => (
          <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`${chip(view === k)} shrink-0`}>
            {name}
          </button>
        ))}
      </div>

      <figure className="overflow-hidden rounded-[28px] border border-line bg-sunken shadow-soft" style={{ aspectRatio: map.aspect }}>
        <svg ref={svg} viewBox={map.views.all.join(" ")} className="block size-full touch-manipulation" role="group" aria-label="세계 지도 — 나라를 눌러 보세요">
          {/* 130개국 밖: 배경으로 한 덩어리 (탭 불가). 다크에서 누를 수 있는 땅보다 밝아 보이지 않게 옅게 */}
          <path d={map.others} fill="var(--color-line)" fillOpacity={0.6} stroke="var(--color-sunken)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden />
          {map.shapes.map((s) => {
            const c = byCode.get(s.code);
            if (!c || !s.d) return null;
            return (
              <path
                key={s.code}
                d={s.d}
                role="button"
                tabIndex={0}
                aria-label={label(s.code, c.name_ko)}
                aria-pressed={selected === s.code}
                onClick={() => pick(s.code)}
                onKeyDown={onKey(s.code)}
                fill={fillOf(s.code)}
                {...edgeOf(s.code)}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer outline-none transition-[fill] duration-300 focus-visible:stroke-brand-strong focus-visible:stroke-2 focus-visible:[stroke-opacity:1]"
              />
            );
          })}
          {/* 선택 테두리는 맨 위에 한 번 더 — 이웃 나라 경계에 가려지지 않게 */}
          {selShape?.d && <path d={selShape.d} fill="none" stroke="var(--color-brand-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden />}
          {/* 작은 나라 점: 길이 0 선 + 둥근 끝 + non-scaling-stroke → 확대해도 화면에서 같은 크기. 투명한 굵은 선이 손가락 탭 영역.
              폴리곤이 있는 작은 나라의 점은 탭 보조일 뿐이라 스크린리더·탭 순서에서는 뺀다 */}
          {map.shapes.map((s) => {
            const c = byCode.get(s.code);
            if (!c || !s.dot) return null;
            const d = `M${s.dot[0]} ${s.dot[1]}h0`;
            const on = selected === s.code;
            const a11y = s.d ? { "aria-hidden": true } : { role: "button", tabIndex: 0, "aria-label": label(s.code, c.name_ko), "aria-pressed": on, onKeyDown: onKey(s.code) };
            // 점의 바깥 고리는 바다 위에서도 보여야 해서 아직인 나라도 리프를 진하게
            const ring = on ? "var(--color-brand-strong)" : isDone(s.code) ? "var(--color-surface)" : "var(--color-leaf)";
            return (
              <g key={s.code} {...a11y} onClick={() => pick(s.code)} className="cursor-pointer outline-none [&:focus-visible>path:nth-child(2)]:stroke-brand-strong">
                <path d={d} stroke="transparent" strokeWidth={24} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <path d={d} stroke={ring} strokeWidth={on ? 11 : 8.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <path d={d} stroke={fillOf(s.code)} strokeWidth={6.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="transition-[stroke] duration-300" />
              </g>
            );
          })}
        </svg>
      </figure>

      {/* 범례: 색 + 글자 (탐험은 체크 아이콘도) — 색만으로 상태를 말하지 않게 */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-ink-soft" aria-label="범례">
        <li className="flex items-center gap-1.5">
          <span className="grid size-4 place-items-center rounded-full bg-brand text-on-brand" aria-hidden>
            <Icon name="check" className="size-2.5" strokeWidth={3} />
          </span>
          탐험한 나라
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-4 rounded-full border border-leaf/50 bg-surface" aria-hidden />
          아직 안 가 본 나라
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-4 rounded-full border-2 border-brand-strong bg-lime" aria-hidden />
          고른 나라
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-4 rounded-full bg-line" aria-hidden />
          준비 중
        </li>
      </ul>

      {sel ? (
        // 고르면 카드가 떠 있는 탭 바(68px + 아래 max(12px, 안전 영역)) 위로 올라오게 스크롤 — 가운데 푸디 구슬이 솟은 만큼(+24px), 미니 플레이어가 있으면 그 위로.
        // 지도 위에 겹쳐 띄우지 않는 건 남쪽 나라(호주·남아공 등)를 가리지 않기 위해
        <section
          key={sel.code}
          ref={card}
          className={`glass animate-rise space-y-4 rounded-[28px] p-4 shadow-lift ${mini ? "scroll-mb-[calc(176px+max(0.75rem,env(safe-area-inset-bottom)))]" : "scroll-mb-[calc(104px+max(0.75rem,env(safe-area-inset-bottom)))]"}`}
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-[18px] border border-line text-4xl leading-none" style={accentBg(sel.accent_color)} aria-hidden>
              {sel.flag_emoji}
            </span>
            <div className="min-w-0 flex-1">
              <Eyebrow className="text-muted">{sel.region}</Eyebrow>
              <h2 className="text-h2 font-bold text-ink">{sel.name_ko}</h2>
              <p className="mt-0.5 flex items-center gap-1 text-caption font-semibold text-ink-soft">
                {isDone(sel.code) ? (
                  <>
                    <Icon name="check-circle" className="size-4 text-leaf" />
                    탐험함
                  </>
                ) : (
                  <>
                    <Icon name="compass" className="size-4 text-muted" />
                    아직 안 가 봤어요
                  </>
                )}
              </p>
            </div>
            <IconButton icon="close" label="닫기" variant="ghost" onClick={() => setSelected(null)} className="-mr-2 -mt-2" />
          </div>
          {total ? (
            <div className="flex items-center gap-3">
              <ProgressBar value={tried} max={total} label={`${sel.name_ko} 음식 탐험 진행`} />
              <span className="shrink-0 text-caption font-semibold tabular-nums text-leaf">
                {tried}/{total}개 음식 탐험
              </span>
            </div>
          ) : (
            <p className="text-caption text-muted">아직 소개된 음식이 없어요 · 0개 음식</p>
          )}
          <div className="flex gap-2">
            <Link href={`/country/${sel.code}`} className={`${btn("primary", "md")} flex-1 gap-1.5! whitespace-nowrap px-3!`}>
              나라 페이지
              <Icon name="next" className="-mr-1 size-4" />
            </Link>
            <button type="button" onClick={() => open({ question: `${sel.name_ko} 음식 추천해줘` })} className={`${btn("outline", "md")} flex-1 gap-1.5! whitespace-nowrap px-3!`}>
              <MicIcon className="size-4 text-leaf" /> 푸디에게 묻기
            </button>
          </div>
        </section>
      ) : (
        <p className="glass flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-ink-soft">
          <Icon name="pin" className="size-[18px] shrink-0 text-leaf" />
          나라를 눌러 보세요. 작은 나라는 대륙을 골라 확대하면 쉬워요.
        </p>
      )}

      {/* 스크린리더용 목록: 지도를 못 보는 사용자도 같은 곳으로 */}
      <ul className="sr-only" aria-label="지도에 있는 나라">
        {countries.map((c) => (
          <li key={c.code}>
            <Link href={`/country/${c.code}`}>
              {c.name_ko} · {counts[c.code] ?? 0}개 음식 · {isDone(c.code) ? "탐험함" : "아직"}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
