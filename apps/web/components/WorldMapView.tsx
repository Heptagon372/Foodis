"use client";
// S7 세계 음식 지도 (F-EXP-05): 나라를 탭하면 그 나라로 확대 + 나라 패널(국가 정보·대표 음식) → 국가 페이지·음식·푸디.
// 경로·확대 경계는 서버가 계산해 넘기고(lib/map/world.ts) 여기서는 색칠·탭·이동·확대만. 패널은 넓은 화면에선 지도 위 왼쪽, 좁은 화면에선 지도 바로 아래 (페이지를 스크롤시키지 않는다)
// 3D 회색 점토 지도: 살짝 눕힌 판(CSS perspective) + 땅 실루엣을 아래로 여러 겹 깔아 두께, 흐린 그림자. 고른 나라는 위로 솟는다.
// 색(globals.css 의 --map-* 토큰): 바다 = 회색 바닥, 아직 = 흰 회색, 탐험 = 연한 초록 회색, 150개국 밖 = 탁한 회색(탭 불가)
// 조작: 끌기 = 이동, 휠·두 손가락 = 확대, 대륙 칩·+/− 버튼. 끌고 난 뒤의 클릭은 나라 선택으로 치지 않는다
import Link from "next/link";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Country } from "@/lib/content/types";
import type { Box, WorldMap } from "@/lib/map/world";
import { exploredCountries, useLocal, type LocalState } from "@/lib/client/passport";
import { accentBg } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner } from "./bits";
import { Icon } from "./icons";
import { TopBar } from "./TopBar";
import { Eyebrow, IconButton, ProgressBar, btn, chip } from "./ui";
import { MicIcon } from "./VoiceButton";
import { noteFeature, signal } from "@/lib/client/taste";
import { COUNTRY_INFO } from "@/lib/map/country-info";

/** 나라 패널의 대표 음식 (서버가 fame_rank 순으로 나라별 상위 몇 개만 넘긴다) */
export type TopFood = { slug: string; name_ko: string; name_en: string; image_url: string | null; summary: string | null };
export type UnlockedFood = { slug: string; name_ko: string; name_en: string; image_url: string | null; taste_tags: string[] };
export type UnlockedCountry = { code: string; foods: UnlockedFood[] };

const CHIPS: [string, string][] = [
  ["all", "전체"],
  ["asia", "아시아"],
  ["europe", "유럽"],
  ["mena_africa", "중동·아프리카"],
  ["americas", "아메리카"],
  ["oceania", "오세아니아"],
];
const ZOOM_MS = 280;
/** 땅 두께·고른 나라가 솟는 높이 (화면 px). 두께는 실루엣을 겹겹이 깔아 만든다 */
const DEPTH = 6;
const DEPTH_LAYERS = 6;
const LIFT = 14;
const LIFT_LAYERS = 16;
/** 전체 보기 대비 최대 확대 배율 */
const MAX_ZOOM = 10;
/** 이만큼(px) 움직이기 전까지는 탭으로 본다 */
const DRAG_SLOP = 6;

/** 화면 px 만큼 아래(+)/위(−)로. --u 는 '화면 1px 의 SVG 길이'라 확대와 상관없이 화면에서 같은 거리 */
const shiftY = (px: number): CSSProperties => ({ transform: `translateY(calc(var(--u) * ${px}px))` });

/** 확대 폭을 [전체/MAX_ZOOM, 전체] 로, 화면 가운데를 세계 안으로 묶는다 (비율은 전체 보기와 같게).
 *  화면의 SLACK 만큼은 세계 밖으로 나가도 된다 — 왼쪽 패널 옆 칸으로 끝자락 나라(알래스카 쪽·뉴질랜드 등)를 옮겨 놓을 수 있게 */
const SLACK = 0.3;
function clampBox(b: Box, all: Box): Box {
  const [ax, ay, aw, ah] = all;
  const w = Math.min(aw, Math.max(aw / MAX_ZOOM, b[2]));
  const h = (w * ah) / aw;
  const cx = Math.min(ax + aw - w / 2 + w * SLACK, Math.max(ax + w / 2 - w * SLACK, b[0] + b[2] / 2));
  const cy = Math.min(ay + ah - h / 2 + h * SLACK, Math.max(ay + h / 2 - h * SLACK, b[1] + b[3] / 2));
  return [cx - w / 2, cy - h / 2, w, h];
}

/** (ux, uy) 지점을 화면에서 고정한 채 factor 배 확대 */
function zoomBox(b: Box, factor: number, ux: number, uy: number, all: Box): Box {
  const w = Math.min(all[2], Math.max(all[2] / MAX_ZOOM, b[2] / factor));
  const k = w / b[2];
  return clampBox([ux - (ux - b[0]) * k, uy - (uy - b[1]) * k, w, b[3] * k], all);
}

/** 화면 좌표 → SVG 좌표 (눕힌 판이라 근사지만 손가락 아래 지점을 잡기엔 충분) */
function toUser(el: SVGSVGElement, b: Box, x: number, y: number): [number, number] {
  const r = el.getBoundingClientRect();
  return [b[0] + ((x - r.left) / r.width) * b[2], b[1] + ((y - r.top) / r.height) * b[3]];
}

/** 나라별 탐험한 음식 수 (선택 카드의 진행 바) */
const seenByCountry = (s: LocalState) => {
  const n: Record<string, number> = {};
  for (const e of Object.values(s.entries)) n[e.cc] = (n[e.cc] ?? 0) + 1;
  return n;
};

export function WorldMapView({
  map,
  countries,
  counts,
  top,
  preview,
  unlocked,
}: {
  map: WorldMap;
  countries: Country[];
  counts: Record<string, number>;
  top: Record<string, TopFood[]>;
  preview: boolean;
  unlocked: UnlockedCountry;
}) {
  const { open } = useFoodi();
  const explored = useLocal(exploredCountries);
  const seen = useLocal(seenByCountry);
  // n: 끌어서 옮긴 뒤 같은 칩을 다시 눌러도 그 대륙으로 돌아가게
  const [nav, setNav] = useState({ view: "all", n: 0 });
  const view = nav.view;
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const vb = useRef<Box>(map.views.all);
  const anim = useRef<{ raf: number; end?: ReturnType<typeof setTimeout> }>({ raf: 0 });
  const all = map.views.all;

  const byCode = new Map(countries.map((c) => [c.code, c]));
  const done = explored.filter((c) => byCode.has(c)).length;
  const sel = selected ? byCode.get(selected) : undefined;
  // 두께·그림자용 땅 실루엣 한 장 — <use> 로 여러 겹 재사용해 긴 경로 문자열은 DOM 에 한 번만
  const land = useMemo(() => map.others + map.shapes.map((s) => s.d).join(""), [map]);

  // viewBox 는 React 렌더 없이 svg 속성만 바꾼다. --u 도 같이 갱신
  const apply = useCallback((b: Box) => {
    vb.current = b;
    const el = svg.current;
    if (!el) return;
    el.setAttribute("viewBox", b.join(" "));
    el.style.setProperty("--u", String(b[2] / (el.clientWidth || 1)));
  }, []);
  const stop = useCallback(() => {
    cancelAnimationFrame(anim.current.raf);
    clearTimeout(anim.current.end);
  }, []);
  // viewBox 를 ≤300ms 동안 보간
  const animateTo = useCallback(
    (to: Box) => {
      stop();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply(to);
      const from = vb.current;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ZOOM_MS);
        const e = 1 - (1 - t) ** 3; // ease-out
        apply(from.map((v, i) => v + (to[i] - v) * e) as Box);
        if (t < 1) anim.current.raf = requestAnimationFrame(step);
      };
      anim.current.raf = requestAnimationFrame(step);
      // 백그라운드 탭 등에서 rAF 가 멈춰도 목적지에는 도착하게
      anim.current.end = setTimeout(() => (cancelAnimationFrame(anim.current.raf), apply(to)), ZOOM_MS + 50);
    },
    [apply, stop],
  );

  // 고른 나라 → 그 나라로 확대 (패널이 지도 위 왼쪽에 떠 있으면 그 오른쪽 남은 칸 가운데로). 안 골랐으면 대륙 칩 보기로
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const shape = selected ? map.shapes.find((s) => s.code === selected) : undefined;
    if (!shape) {
      animateTo(map.views[nav.view] ?? map.views.all);
      return stop;
    }
    const fig = svg.current?.closest("figure");
    const pw = panel.current && getComputedStyle(panel.current).position === "absolute" ? panel.current.offsetWidth + 24 : 0;
    const L = fig?.clientWidth ? Math.min(0.6, pw / fig.clientWidth) : 0; // 패널이 가리는 왼쪽 비율
    const f = 1 - L;
    const [x, y, w, h] = shape.box;
    const aspect = all[2] / all[3];
    // 나라가 남은 칸의 2/3 쯤 차게. 아주 작은 나라도 MAX_ZOOM 의 절반까지만 (주변 나라가 보이게)
    const W = Math.min(all[2], Math.max((w * 1.5) / f, h * 1.7 * aspect, (all[2] / MAX_ZOOM) * 2));
    const H = W / aspect;
    animateTo(clampBox([x + w / 2 - W * (L + f / 2), y + h / 2 - H * 0.47, W, H], all));
    return stop;
  }, [selected, nav, map, all, animateTo, stop]);

  // 지도 칸 크기가 바뀌면 --u 다시
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(() => apply(vb.current));
    ro.observe(el);
    return () => ro.disconnect();
  }, [apply]);

  // 휠 확대 — passive: false 여야 페이지 스크롤을 막을 수 있어 직접 붙인다
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      stop();
      const [ux, uy] = toUser(el, vb.current, e.clientX, e.clientY);
      apply(zoomBox(vb.current, Math.exp(-e.deltaY * 0.0022), ux, uy, all));
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, [all, apply, stop]);

  // 끌기(이동)·두 손가락(확대). moved 면 이어지는 click 은 삼킨다
  const ptrs = useRef(new Map<number, [number, number]>());
  const gesture = useRef({ moved: false, x0: 0, y0: 0 });
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (ptrs.current.size === 0) gesture.current = { moved: false, x0: e.clientX, y0: e.clientY };
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    stop();
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const el = svg.current;
    const p = ptrs.current.get(e.pointerId);
    if (!el || !p) return;
    const g = gesture.current;
    if (!g.moved) {
      if (ptrs.current.size < 2 && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < DRAG_SLOP) return;
      g.moved = true;
      setDragging(true);
    }
    if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
    const b = vb.current;
    if (ptrs.current.size === 1) {
      const r = el.getBoundingClientRect();
      apply(clampBox([b[0] - ((e.clientX - p[0]) * b[2]) / r.width, b[1] - ((e.clientY - p[1]) * b[3]) / r.height, b[2], b[3]], all));
    } else {
      const other = [...ptrs.current].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(p[0] - other[0], p[1] - other[1]);
        const after = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
        const [ux, uy] = toUser(el, b, (e.clientX + other[0]) / 2, (e.clientY + other[1]) / 2);
        if (before > 0) apply(zoomBox(b, after / before, ux, uy, all));
      }
    }
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
  };
  const onPointerEnd = (e: ReactPointerEvent<SVGSVGElement>) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) setDragging(false);
  };
  const zoomBy = (factor: number) => {
    const b = vb.current;
    animateTo(zoomBox(b, factor, b[0] + b[2] / 2, b[1] + b[3] / 2, all));
  };

  const pick = (code: string) => {
    if (selected !== code) {
      signal("country", null, { cc: code, src: "map" });
      noteFeature("map");
    }
    setSelected((cur) => (cur === code ? null : code));
  };
  const onKey = (code: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(code);
    }
  };
  const isDone = (code: string) => explored.includes(code);
  const fillOf = (code: string) => (isDone(code) ? "var(--map-done)" : "var(--map-top)");
  const label = (code: string, name: string) => `${name}${isDone(code) ? " · 탐험함" : ""}`;
  const total = sel ? (counts[sel.code] ?? 0) : 0;
  const tried = sel ? Math.min(seen[sel.code] ?? 0, total) : 0;
  const selShape = selected ? map.shapes.find((s) => s.code === selected) : undefined;
  const info = sel ? COUNTRY_INFO[sel.code] : undefined;
  const topFoods = sel ? (top[sel.code] ?? []) : [];

  return (
    <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar />
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
          <button key={k} type="button" aria-pressed={view === k} onClick={() => (setSelected(null), setNav((v) => ({ view: k, n: v.n + 1 })))} className={`${chip(view === k)} shrink-0`}>
            {name}
          </button>
        ))}
      </div>

      {/* 지도 + 나라 패널: 넓은 화면은 패널이 지도 위 왼쪽에 겹쳐 뜨고(확대는 그 오른쪽 칸으로), 좁은 화면은 지도 바로 아래 */}
      <div className="relative">
      <figure className="wm-sea relative overflow-hidden rounded-[28px] border border-line shadow-soft [perspective:1100px]" style={{ aspectRatio: map.aspect }}>
        {/* 판을 살짝 눕혀 3D 로. 눕히면 위쪽이 좁아지니 조금 키워 모서리를 채운다 */}
        <div className="size-full [transform:rotateX(16deg)_scale(1.1)] [transform-origin:50%_62%]">
          <svg
            ref={svg}
            viewBox={all.join(" ")}
            className="wm-svg block size-full cursor-grab touch-none select-none"
            data-drag={dragging || undefined}
            role="group"
            aria-label="세계 지도 — 끌어서 움직이고, 나라를 눌러 보세요"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onClickCapture={(e) => {
              if (gesture.current.moved) e.stopPropagation();
            }}
          >
            <defs>
              <path id="wm-land" d={land} />
              <filter id="wm-blur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation={5} />
              </filter>
            </defs>
            {/* 바닥 그림자 → 옆면(아래 겹일수록 진하게) → 윗면 */}
            <g aria-hidden pointerEvents="none">
              <use href="#wm-land" className="wm-shadow" fill="var(--map-shadow)" filter="url(#wm-blur)" style={{ transform: "translate(calc(var(--u) * 5px), calc(var(--u) * 12px))" }} />
              {Array.from({ length: DEPTH_LAYERS }, (_, i) => DEPTH_LAYERS - i).map((k) => (
                <use key={k} href="#wm-land" fill={k > DEPTH_LAYERS / 2 ? "var(--map-side-deep)" : "var(--map-side)"} style={shiftY((k * DEPTH) / DEPTH_LAYERS)} />
              ))}
              {/* 150개국 밖: 윗면만 탁한 회색 (탭 불가) */}
              <path d={map.others} fill="var(--map-off)" stroke="var(--map-edge)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
            </g>
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
                  stroke="var(--map-edge)"
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer outline-none transition-[fill] duration-300 hover:brightness-[0.97] focus-visible:stroke-brand-strong focus-visible:stroke-2"
                />
              );
            })}
            {/* 고른 나라: 두께 바닥에서 LIFT 만큼 솟는다 — 옆면 겹 + 그림자 + 윗면(누르면 다시 내려감). key 로 바뀔 때마다 다시 솟게 */}
            {selShape?.d && (
              <g key={selShape.code}>
                <g aria-hidden pointerEvents="none">
                  <path d={selShape.d} className="wm-shadow wm-rise" fill="var(--map-shadow)" filter="url(#wm-blur)" style={{ transform: "translate(calc(var(--u) * 4px), calc(var(--u) * 8px))" }} />
                  {Array.from({ length: LIFT_LAYERS }, (_, i) => i).map((i) => (
                    <path
                      key={i}
                      d={selShape.d}
                      className="wm-rise"
                      fill={i < LIFT_LAYERS / 3 ? "var(--map-side-deep)" : "var(--map-side)"}
                      style={shiftY(DEPTH - (i * (DEPTH + LIFT)) / LIFT_LAYERS)}
                    />
                  ))}
                </g>
                <path
                  d={selShape.d}
                  className="wm-rise cursor-pointer"
                  fill={fillOf(selShape.code)}
                  stroke="var(--color-brand-strong)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  style={shiftY(-LIFT)}
                  onClick={() => pick(selShape.code)}
                  aria-hidden
                />
              </g>
            )}
            {/* 작은 나라 점: 길이 0 선 + 둥근 끝 + non-scaling-stroke → 확대해도 화면에서 같은 크기. 투명한 굵은 선이 손가락 탭 영역.
                폴리곤이 있는 작은 나라의 점은 탭 보조일 뿐이라 스크린리더·탭 순서에서는 뺀다 */}
            {map.shapes.map((s) => {
              const c = byCode.get(s.code);
              if (!c || !s.dot) return null;
              const d = `M${s.dot[0]} ${s.dot[1]}h0`;
              const on = selected === s.code;
              const a11y = s.d ? { "aria-hidden": true } : { role: "button", tabIndex: 0, "aria-label": label(s.code, c.name_ko), "aria-pressed": on, onKeyDown: onKey(s.code) };
              const ring = on ? "var(--color-brand-strong)" : isDone(s.code) ? "var(--color-brand)" : "var(--map-side-deep)";
              return (
                <g key={s.code} {...a11y} onClick={() => pick(s.code)} style={on ? shiftY(-LIFT / 2) : undefined} className="cursor-pointer outline-none [&:focus-visible>path:nth-child(2)]:stroke-brand-strong">
                  <path d={d} stroke="transparent" strokeWidth={24} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d={d} stroke={ring} strokeWidth={on ? 11 : 8.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d={d} stroke={fillOf(s.code)} strokeWidth={6.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="transition-[stroke] duration-300" />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="absolute right-3 bottom-3 flex flex-col gap-1.5" role="group" aria-label="지도 확대">
          {(
            [
              ["확대", Plus, () => zoomBy(1.6)],
              ["축소", Minus, () => zoomBy(1 / 1.6)],
              ["전체 보기", Maximize2, () => (setSelected(null), setNav((v) => ({ view: "all", n: v.n + 1 })))],
            ] as const
          ).map(([name, Glyph, act]) => (
            <button key={name} type="button" aria-label={name} onClick={act} className="glass grid size-9 place-items-center rounded-full text-ink transition active:scale-95">
              <Glyph className="size-4" strokeWidth={2.25} />
            </button>
          ))}
        </div>
      </figure>

      {sel && (
        <section
          key={sel.code}
          ref={panel}
          aria-live="polite"
          aria-label={`${sel.name_ko} 정보`}
          className="glass mt-4 animate-rise space-y-4 rounded-[24px] p-4 shadow-lift md:absolute md:inset-y-3 md:left-3 md:mt-0 md:w-[min(320px,46%)] md:overflow-y-auto md:overscroll-contain md:[scrollbar-width:thin]"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-[18px] border border-line text-4xl leading-none" style={accentBg(sel.accent_color)} aria-hidden>
              {sel.flag_emoji}
            </span>
            <div className="min-w-0 flex-1">
              <Eyebrow className="text-muted">{sel.region}</Eyebrow>
              <h2 className="text-h2 font-bold leading-tight text-ink">{sel.name_ko}</h2>
              <p className="flex items-center gap-1 text-caption text-muted">
                {sel.name_en}
                {isDone(sel.code) && (
                  <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-leaf">
                    <Icon name="check-circle" className="size-3.5" />
                    탐험함
                  </span>
                )}
              </p>
            </div>
            <IconButton icon="close" label="닫기" variant="ghost" onClick={() => setSelected(null)} className="-mr-2 -mt-2" />
          </div>

          {info && (
            <div className="space-y-2.5">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="flex items-center gap-1.5 font-semibold text-muted">
                  <Icon name="flag" className="size-4" />
                  수도
                </dt>
                <dd className="text-ink">{info.capital}</dd>
                <dt className="flex items-center gap-1.5 font-semibold text-muted">
                  <Icon name="message" className="size-4" />
                  언어
                </dt>
                <dd className="text-ink">{info.lang}</dd>
              </dl>
              <p className="text-sm leading-relaxed text-ink-soft">{info.about}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <Icon name="utensils" className="size-4 text-leaf" />
              대표 음식
            </h3>
            {topFoods.length ? (
              <ol className="-mx-1.5">
                {topFoods.map((f, i) => (
                  <li key={f.slug}>
                    <Link href={`/food/${f.slug}`} className="flex items-center gap-3 rounded-2xl p-1.5 transition hover:bg-ink/5 active:scale-[0.98]">
                      <span className="relative size-12 shrink-0 overflow-hidden rounded-[14px] border border-line" style={accentBg(sel.accent_color, f.image_url)} aria-hidden>
                        <span className="absolute left-1 top-1 grid size-4 place-items-center rounded-full bg-surface/90 text-[10px] font-bold tabular-nums text-ink">{i + 1}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink">{f.name_ko}</span>
                        <span className="line-clamp-1 text-caption text-muted">{f.summary ?? f.name_en}</span>
                      </span>
                      <Icon name="next" className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-caption text-muted">아직 소개된 음식이 없어요. 출처를 확인한 음식부터 차례로 올라와요.</p>
            )}
          </div>

          {total > 0 && (
            <div className="flex items-center gap-3">
              <ProgressBar value={tried} max={total} label={`${sel.name_ko} 음식 탐험 진행`} />
              <span className="shrink-0 text-caption font-semibold tabular-nums text-leaf">
                {tried}/{total}개 탐험
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <Link href={`/country/${sel.code}`} className={`${btn("primary", "md")} flex-1 gap-1.5! whitespace-nowrap px-3!`}>
              나라 페이지
              <Icon name="next" className="-mr-1 size-4" />
            </Link>
            <button type="button" onClick={() => open({ question: `${sel.name_ko} 음식 추천해줘` })} className={`${btn("outline", "md")} flex-1 gap-1.5! whitespace-nowrap px-3!`}>
              <MicIcon className="size-4 text-leaf" /> 푸디에게
            </button>
          </div>
        </section>
      )}
      </div>

      {/* 범례: 색 + 글자 (탐험은 체크 아이콘도) — 색만으로 상태를 말하지 않게 */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-ink-soft" aria-label="범례">
        <li className="flex items-center gap-1.5">
          <span className="grid size-4 place-items-center rounded-full border border-(--map-side) bg-(--map-done) text-brand-strong" aria-hidden>
            <Icon name="check" className="size-2.5" strokeWidth={3} />
          </span>
          탐험한 나라
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-4 rounded-full border border-(--map-side) bg-(--map-top)" aria-hidden />
          아직 안 가 본 나라
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-4 -translate-y-0.5 rounded-full border-2 border-brand-strong bg-(--map-top) shadow-[0_3px_0_var(--map-side-deep)]" aria-hidden />
          고른 나라 (솟아올라요)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-4 rounded-full border border-(--map-side) bg-(--map-off)" aria-hidden />
          준비 중
        </li>
      </ul>

      {!sel && (
        <p className="glass flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-ink-soft">
          <Icon name="pin" className="size-[18px] shrink-0 text-leaf" />
          끌어서 움직이고 나라를 눌러 보세요. 고른 나라로 확대되고 나라 정보·대표 음식이 떠요.
        </p>
      )}

      <TasteExplore unlocked={unlocked} selectedCode={selected} selectedName={sel?.name_ko ?? null} />

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

/** 지도 아래 '맛집탐방' 섹션: 잠금 해제된 나라(지금은 KR)만 검색·선택 가능. 음식을 고르면 /taste/{slug} 로. */
function TasteExplore({ unlocked, selectedCode, selectedName }: { unlocked: UnlockedCountry; selectedCode: string | null; selectedName: string | null }) {
  const [q, setQ] = useState("");
  // 지도에서 고른 나라가 잠금 해제된 나라면 그 나라 음식을 보여준다. 아무것도 안 골랐으면 기본으로 잠금 해제된 나라.
  const showing = selectedCode == null || selectedCode === unlocked.code;
  const locked = selectedCode != null && selectedCode !== unlocked.code;
  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () => unlocked.foods.filter((f) =>
      !needle || f.name_ko.toLowerCase().includes(needle) || f.name_en.toLowerCase().includes(needle) || f.taste_tags.some((t) => t.toLowerCase().includes(needle)),
    ),
    [unlocked.foods, needle],
  );

  return (
    <section aria-labelledby="taste-explore-h" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="taste-explore-h" className="flex items-center gap-2 text-h2 font-bold text-ink">
          <Icon name="utensils" className="size-5 text-leaf" />
          맛집탐방
        </h2>
        <p className="text-caption text-muted">음식을 고르면 가까운 음식점·메뉴판·영업시간을 보여드려요.</p>
      </div>

      {locked ? (
        <div className="card flex items-start gap-3 rounded-3xl p-4">
          <Icon name="key" className="mt-1 size-5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{selectedName ?? "이 나라"}는 아직 잠겨 있어요</p>
            <p className="mt-1 text-caption text-ink-soft">
              지금은 <span className="font-semibold text-leaf">대한민국</span>의 음식점만 찾아드릴 수 있어요. 다른 나라도 곧 열립니다.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-full border border-line bg-sunken px-3.5">
            <Icon name="search" className="size-4 shrink-0 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={40}
              placeholder="예: 떡볶이, 김밥, spicy…"
              aria-label="음식 검색"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="지우기" className="text-caption text-muted hover:text-ink">
                지우기
              </button>
            )}
          </div>

          {showing && list.length === 0 && (
            <p className="card rounded-2xl p-4 text-center text-sm text-muted">&lsquo;{q}&rsquo;에 맞는 음식이 없어요.</p>
          )}

          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {list.slice(0, 24).map((f) => (
              <li key={f.slug}>
                <Link
                  href={`/taste/${f.slug}`}
                  className="group flex h-full items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 transition hover:border-brand hover:shadow-soft active:scale-[0.98]"
                >
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-line" style={accentBg("#1f5f46", f.image_url)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{f.name_ko}</span>
                    <span className="line-clamp-1 text-caption text-muted">{f.taste_tags.slice(0, 2).join(" · ") || f.name_en}</span>
                  </span>
                  <Icon name="next" className="size-4 shrink-0 text-muted group-hover:text-leaf" />
                </Link>
              </li>
            ))}
          </ul>
          {list.length > 24 && <p className="text-caption text-muted">{list.length - 24}개 더 있어요. 검색어로 좁혀 보세요.</p>}
        </>
      )}
    </section>
  );
}
