"use client";
// S9 음식의 여정 (기능 #14): 지도 위에 정류장 순서대로 경로를 그리고, 아래 타임라인에 관계 설명을 DB 문장 그대로 싣는다.
// 경로·좌표는 서버(lib/journey/)에서 계산 — 여기서는 그리기 애니메이션(CSS, ≤1.2초)과 라디오 버튼만.
// 지도 색은 세계 지도와 같은 토큰(바다 sunken · 땅 surface · 지나는 나라 연두 · 경로 brand) → 다크에서는 밤의 숲 지도
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { FoodSummary } from "@/lib/content/types";
import type { JourneyMap } from "@/lib/journey/map";
import { startRadio } from "@/lib/client/radio";
import { PreviewBanner, RelationRow, Wordmark } from "./bits";
import { Icon } from "./icons";
import { BackLink, Eyebrow, IconTile, btn } from "./ui";

export type JourneyStopView = {
  slug: string;
  name_ko: string;
  flag: string;
  country: string;
  via: { from: number; label: string; description: string } | null;
};

/** 선 그리기에 쓰는 전체 시간 — 마지막 마커가 나타나는 200ms 를 더해도 1.2초 안 */
const DRAW_MS = 1000;
const POP_MS = 200;

// 움직임 줄이기 설정이면 처음부터 다 그려진 상태 (애니메이션 규칙을 media query 안에만 둔다)
const CSS = `
@keyframes jr-draw { from { stroke-dashoffset: 1; opacity: 0 } 6% { opacity: 1 } to { stroke-dashoffset: 0; opacity: 1 } }
@keyframes jr-pop { from { opacity: 0; transform: scale(.4) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: no-preference) {
  .jr-seg { stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0; animation: jr-draw var(--jr-d) ease-in-out var(--jr-at) forwards }
  .jr-pin { opacity: 0; transform-box: fill-box; transform-origin: center; animation: jr-pop ${POP_MS}ms ease-out var(--jr-at) forwards }
}`;

const timing = (at: number, d = 0) => ({ "--jr-at": `${Math.round(at)}ms`, "--jr-d": `${Math.round(d)}ms` }) as CSSProperties;

export function JourneyView({ food, stops, map, similar, preview }: { food: { slug: string; name_ko: string }; stops: JourneyStopView[]; map: JourneyMap; similar: FoodSummary[]; preview: boolean }) {
  const [run, setRun] = useState(0);
  const countries = new Set(stops.map((s) => s.country)).size;
  const hasRoute = stops.length > 1;

  // 구간은 정류장 순서대로 하나씩, 마커는 자기 구간이 거의 다 그려질 때 나타난다
  const per = map.segs.length ? Math.min(450, DRAW_MS / map.segs.length) : 0;
  const pinAt = stops.map(() => 0);
  map.segs.forEach((s, k) => (pinAt[s.to] = k * per + per * 0.7));
  const { r } = map;
  const routeLabel = stops.map((s) => `${s.name_ko}(${s.country})`).join(" → ");

  return (
    <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <style>{CSS}</style>
      <header className="flex items-center justify-between gap-3">
        <BackLink href={`/food/${food.slug}`} label={food.name_ko} />
        <Wordmark className="text-xl" />
      </header>
      {preview && <PreviewBanner />}

      <div className="space-y-1">
        <Eyebrow>Food Journey</Eyebrow>
        <h1 className="text-h1 font-bold text-ink">{food.name_ko}의 여정</h1>
        <p className="text-sm text-ink-soft">{hasRoute ? `${countries}개 나라 · ${stops.length}곳을 이어요` : "아직 한 나라에 머물러 있어요"}</p>
      </div>

      <figure className="relative overflow-hidden rounded-[28px] border border-line bg-sunken shadow-soft" style={{ aspectRatio: map.aspect }}>
        <svg viewBox={map.box.join(" ")} className="block size-full" role="img" aria-label={hasRoute ? `여정 지도: ${routeLabel}` : `${stops[0].name_ko} — ${stops[0].country}`}>
          <path d={map.land} fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          {map.lit.map((l) => (
            <path key={l.code} d={l.d} fill="var(--color-lime)" fillOpacity={0.4} stroke="var(--color-leaf)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          ))}
          {/* key 를 바꾸면 CSS 애니메이션이 처음부터 다시 돈다 (다시 보기) */}
          <g key={run}>
            {map.segs.map((s, k) => (
              <g key={s.to}>
                {/* 연두 글로우(굵고 옅은 선) 위에 초록 경로 — 같은 타이밍으로 함께 그려진다 */}
                <path d={s.d} pathLength={1} className="jr-seg" style={timing(k * per, per)} fill="none" stroke="var(--color-lime)" strokeOpacity={0.55} strokeWidth={r * 0.42} strokeLinecap="round" strokeLinejoin="round" />
                <path d={s.d} pathLength={1} className="jr-seg" style={timing(k * per, per)} fill="none" stroke="var(--color-brand)" strokeWidth={r * 0.16} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ))}
            {map.pins.map((p, i) =>
              p ? (
                <g key={i} transform={`translate(${p[0]} ${p[1]})`}>
                  <g className="jr-pin" style={timing(pinAt[i])}>
                    {/* 출발지는 연두 고리를 굵게 */}
                    <circle r={r} fill="var(--color-surface)" stroke={i === 0 ? "var(--color-lime-strong)" : "var(--color-brand)"} strokeWidth={r * (i === 0 ? 0.22 : 0.12)} />
                    <text fontSize={r * 1.1} fill="var(--color-ink)" textAnchor="middle" dominantBaseline="central" aria-hidden>
                      {stops[i].flag}
                    </text>
                    {hasRoute && (
                      <>
                        <circle cx={r * 0.78} cy={-r * 0.78} r={r * 0.44} fill="var(--color-brand)" stroke="var(--color-surface)" strokeWidth={r * 0.06} />
                        <text x={r * 0.78} y={-r * 0.78} fontSize={r * 0.56} fontWeight={700} fill="var(--color-on-brand)" textAnchor="middle" dominantBaseline="central" aria-hidden>
                          {i + 1}
                        </text>
                      </>
                    )}
                  </g>
                </g>
              ) : null,
            )}
          </g>
        </svg>
        {hasRoute && (
          <button type="button" onClick={() => setRun((n) => n + 1)} className="glass absolute bottom-3 right-3 inline-flex h-10 items-center gap-1.5 rounded-full pl-3 pr-4 text-caption font-semibold text-ink transition active:scale-95">
            <Icon name="replay" className="size-4 text-leaf" />
            다시 보기
          </button>
        )}
      </figure>

      {hasRoute ? (
        <>
          <ol className="relative space-y-3 before:absolute before:bottom-8 before:left-[19px] before:top-8 before:w-0.5 before:rounded-full before:bg-line" aria-label="여정 정류장">
            {stops.map((s, i) => (
              <li key={s.slug} className="relative flex gap-3">
                <span className="relative z-10 mt-3 grid size-10 shrink-0 place-items-center rounded-full border-2 border-brand bg-surface text-xl" aria-hidden>
                  {s.flag}
                  <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold tabular-nums text-on-brand ring-2 ring-canvas">{i + 1}</span>
                </span>
                <Link href={`/food/${s.slug}`} className="card min-w-0 flex-1 rounded-3xl p-4 transition active:scale-[0.99]">
                  <p className="flex items-center gap-1.5 text-caption text-muted">
                    {i + 1}. {s.country}
                    {i === 0 && <span className="rounded-full bg-lime px-2 py-px text-[11px] font-semibold text-on-lime">출발</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-0.5 font-semibold text-ink">
                    {s.name_ko}
                    <Icon name="next" className="size-4 text-muted" />
                  </p>
                  {s.via && (
                    <>
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-caption">
                        <span className="rounded-full bg-lime-soft px-2.5 py-0.5 font-semibold text-leaf">{s.via.label}</span>
                        {/* 바로 앞 정류장이 아니라 앞선 곳에서 갈라진 가지면 어디서 왔는지 */}
                        {s.via.from !== i - 1 && <span className="text-muted">{stops[s.via.from].name_ko}에서</span>}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{s.via.description}</p>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void startRadio({ channel: "today", start: food.slug })} className={`${btn("primary", "lg")} w-full`}>
            <Icon name="headphones" className="size-5" />이 여정을 라디오로 듣기
          </button>
        </>
      ) : (
        <div className="space-y-5">
          <div className="card flex items-start gap-3 rounded-3xl p-4">
            <IconTile icon="route" tone="soft" />
            <div className="space-y-0.5">
              <p className="font-semibold text-ink">아직 이어진 역사 기록이 없어요</p>
              <p className="text-sm text-ink-soft">출처가 확인된 연결만 여정에 올라와요.</p>
            </div>
          </div>
          <RelationRow label="이런 음식도 둘러보세요" foods={similar} />
          <Link href={`/food/${food.slug}`} className={`${btn("outline", "md")} w-full`}>
            <span aria-hidden>{stops[0].flag}</span> {food.name_ko} 이야기로 돌아가기
            <Icon name="next" className="-mr-1 size-4 text-muted" />
          </Link>
        </div>
      )}
    </main>
  );
}
