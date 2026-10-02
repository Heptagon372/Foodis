"use client";
// S7 세계 음식 지도 (F-EXP-05): 나라를 탭하면 아래 카드 → 국가 페이지·푸디. 경로는 서버가 계산해 넘기고(lib/map/world.ts) 여기서는 색칠·탭·확대만.
// 색: 탐험한 나라 = 국가 Accent, 지도에 있지만 아직 = 연민트, 150개국 밖 = 회색(탭 불가)
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Country } from "@/lib/content/types";
import type { Box, WorldMap } from "@/lib/map/world";
import { exploredCountries, useLocal } from "@/lib/client/passport";
import { accentBg } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner, Wordmark } from "./bits";
import { MicIcon } from "./VoiceButton";
import { noteFeature, signal } from "@/lib/client/taste";

const CHIPS: [string, string][] = [
  ["all", "전체"],
  ["asia", "아시아"],
  ["europe", "유럽"],
  ["mena_africa", "중동·아프리카"],
  ["americas", "아메리카"],
  ["oceania", "오세아니아"],
];
const ZOOM_MS = 280;

export function WorldMapView({ map, countries, counts, preview }: { map: WorldMap; countries: Country[]; counts: Record<string, number>; preview: boolean }) {
  const { open } = useFoodi();
  const explored = useLocal(exploredCountries);
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

  // 카드가 하단 탭바에 가리지 않게 (scroll-mb 로 탭바 높이만큼 띄움)
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) card.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  const pick = (code: string) => {
    if (selected !== code) (signal("country", null, { cc: code, src: "map" }), noteFeature("map"));
    setSelected((cur) => (cur === code ? null : code));
  };
  const onKey = (code: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(code);
    }
  };
  const fillOf = (code: string) => (explored.includes(code) ? (byCode.get(code)?.accent_color ?? "var(--color-mint-500)") : "var(--color-mint-100)");
  // 아직인 나라는 민트 테두리로 회색(지도 밖)과 구분, 탐험한 나라는 흰 경계
  const edgeOf = (code: string) => (explored.includes(code) ? "var(--color-surface)" : "var(--color-mint-500)");
  const selShape = selected ? map.shapes.find((s) => s.code === selected) : undefined;

  return (
    <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link href="/passport" className="text-sm font-semibold text-green-800">
          📕 Passport
        </Link>
      </header>
      {preview && <PreviewBanner />}

      <div className="space-y-2">
        <h1 className="font-display text-h1 font-semibold">세계 음식 지도</h1>
        <div className="flex items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-mint-500 transition-[width] duration-300" style={{ width: `${countries.length ? (done / countries.length) * 100 : 0}%` }} />
          </span>
          <span className="text-caption font-semibold tabular-nums text-green-800">
            {done}/{countries.length}개국 탐험
          </span>
        </div>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]" role="group" aria-label="대륙 보기">
        {CHIPS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={view === k}
            onClick={() => setView(k)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition active:scale-95 ${view === k ? "border-mint-500 bg-mint-100 text-green-800" : "border-line bg-surface text-charcoal/80"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <figure className="overflow-hidden rounded-3xl border border-line bg-surface" style={{ aspectRatio: map.aspect }}>
        <svg ref={svg} viewBox={map.views.all.join(" ")} className="block size-full touch-manipulation" role="group" aria-label="세계 지도 — 나라를 눌러 보세요">
          {/* 150개국 밖: 배경으로 한 덩어리 (탭 불가) */}
          <path d={map.others} fill="var(--color-line)" stroke="var(--color-surface)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden />
          {map.shapes.map((s) => {
            const c = byCode.get(s.code);
            if (!c || !s.d) return null;
            return (
              <path
                key={s.code}
                d={s.d}
                role="button"
                tabIndex={0}
                aria-label={`${c.name_ko}${explored.includes(s.code) ? " · 탐험함" : ""}`}
                aria-pressed={selected === s.code}
                onClick={() => pick(s.code)}
                onKeyDown={onKey(s.code)}
                fill={fillOf(s.code)}
                stroke={edgeOf(s.code)}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer outline-none transition-[fill] duration-300 focus-visible:stroke-green-800 focus-visible:stroke-2"
              />
            );
          })}
          {/* 선택 테두리는 맨 위에 한 번 더 — 이웃 나라 경계에 가려지지 않게 */}
          {selShape?.d && <path d={selShape.d} fill="none" stroke="var(--color-green-800)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden />}
          {/* 작은 나라 점: 길이 0 선 + 둥근 끝 + non-scaling-stroke → 확대해도 화면에서 같은 크기. 투명한 굵은 선이 손가락 탭 영역.
              폴리곤이 있는 작은 나라의 점은 탭 보조일 뿐이라 스크린리더·탭 순서에서는 뺀다 */}
          {map.shapes.map((s) => {
            const c = byCode.get(s.code);
            if (!c || !s.dot) return null;
            const d = `M${s.dot[0]} ${s.dot[1]}h0`;
            const a11y = s.d ? { "aria-hidden": true } : { role: "button", tabIndex: 0, "aria-label": `${c.name_ko}${explored.includes(s.code) ? " · 탐험함" : ""}`, "aria-pressed": selected === s.code, onKeyDown: onKey(s.code) };
            return (
              <g key={s.code} {...a11y} onClick={() => pick(s.code)} className="cursor-pointer outline-none [&:focus-visible>path:nth-child(2)]:stroke-green-800">
                <path d={d} stroke="transparent" strokeWidth={24} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <path d={d} stroke={selected === s.code ? "var(--color-green-800)" : edgeOf(s.code)} strokeWidth={selected === s.code ? 11 : 8.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <path d={d} stroke={fillOf(s.code)} strokeWidth={6.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="transition-[stroke] duration-300" />
              </g>
            );
          })}
        </svg>
      </figure>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted" aria-label="범례">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-[conic-gradient(#C8384A_0_33%,#3D4F8C_0_66%,#E0A526_0)]" aria-hidden />
          탐험한 나라
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-full border border-mint-500 bg-mint-100" aria-hidden />
          아직 안 가 본 나라
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-line" aria-hidden />
          준비 중
        </li>
      </ul>

      {sel ? (
        <section key={sel.code} ref={card} className="animate-rise scroll-mb-32 space-y-4 rounded-3xl border border-line bg-surface p-5" style={accentBg(sel.accent_color)} aria-live="polite">
          <div className="flex items-center gap-3">
            <span className="text-5xl leading-none" aria-hidden>
              {sel.flag_emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-semibold uppercase tracking-wide text-charcoal/60">{sel.region}</p>
              <h2 className="font-display text-h2 font-semibold">{sel.name_ko}</h2>
              <p className="text-sm text-charcoal/70">
                {counts[sel.code] ?? 0}개 음식 · {explored.includes(sel.code) ? "✓ 탐험함" : "아직"}
              </p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="grid size-9 shrink-0 place-items-center self-start rounded-full bg-surface/80 text-muted" aria-label="닫기">
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            <Link href={`/country/${sel.code}`} className="flex flex-1 items-center justify-center rounded-2xl bg-green-800 py-3 font-semibold text-ivory transition active:scale-[0.98]">
              나라 페이지 →
            </Link>
            <button type="button" onClick={() => open({ question: `${sel.name_ko} 음식 추천해줘` })} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-mint-500 bg-mint-100 py-3 font-semibold text-green-800 transition active:scale-[0.98]">
              <MicIcon className="size-4" /> 푸디에게 묻기
            </button>
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-center text-sm text-muted">나라를 눌러 보세요. 작은 나라는 대륙을 골라 확대하면 쉬워요.</p>
      )}

      {/* 스크린리더용 목록: 지도를 못 보는 사용자도 같은 곳으로 */}
      <ul className="sr-only" aria-label="지도에 있는 나라">
        {countries.map((c) => (
          <li key={c.code}>
            <Link href={`/country/${c.code}`}>
              {c.name_ko} · {counts[c.code] ?? 0}개 음식 · {explored.includes(c.code) ? "탐험함" : "아직"}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
