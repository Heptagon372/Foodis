"use client";
// Food DNA 3D (Passport): 나의 맛 DNA 를 천천히 도는 네온 이중 나선으로 그리고, 가로대(가닥) 하나하나를
// DNA 매칭으로 고른 추천 음식 카드에 빛이 흐르는 선으로 잇는다 — "왜 이 음식인지"가 선으로 보인다.
// 알고리즘은 lib/taste/dna.ts (순수 함수). 이 파일은 그리기와 상호작용만:
//  - 음식 카드에 마우스·포커스 → 이어진 가닥만 밝게 / 가닥 이름에 마우스 → 그 가닥에 닿는 음식만 밝게
//  - 화면 밖이거나 prefers-reduced-motion 이면 회전·흐름을 멈춘다
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Country, FoodSummary } from "@/lib/content/types";
import { foodDna, useHydrated, useLocal } from "@/lib/client/passport";
import { useTaste } from "@/lib/client/taste";
import { buildProfile, rankFoods } from "@/lib/taste/engine";
import { dnaPicks, dnaStrands, foodiNudge, pickReason, type DnaPick, type Strand } from "@/lib/taste/dna";
import { useFoodi } from "./FoodiSheet";
import { Icon } from "./icons";
import { TrackLink } from "./TrackLink";
import { btn, Eyebrow } from "./ui";

/* ───────── 나선 기하 (viewBox 단위) ───────── */
const W = 150;
const ROW = 34;
const TOP = 22;
const CX = 96; // 나선 축 — 왼쪽은 가닥 이름 자리
const R = 34; // 나선 반지름
const TWIST = 0.85; // 가로대 사이 비틀림 (rad)
const SPEED = 0.00055; // rad/ms → 약 11초에 한 바퀴
const GHOST: Strand[] = Array.from({ length: 6 }, (_, i) => ({ tag: `ghost${i}`, label: "", w: 0.18 }));

const rungY = (i: number) => TOP + i * ROW;

type Hover = { kind: "food"; id: string } | { kind: "tag"; tag: string } | null;

export function FoodDna({ foods, countries }: { foods: FoodSummary[]; countries: Country[] }) {
  const hydrated = useHydrated();
  const { open } = useFoodi();
  const passportDna = useLocal(foodDna);
  const tastes = useLocal((s) => s.tastes);
  const diet = useLocal((s) => s.diet);
  const allergens = useLocal((s) => s.allergens ?? []);
  const explored = useLocal((s) => s.entries);
  const signals = useTaste((s) => s.signals);
  const features = useTaste((s) => s.features);
  const ignored = useTaste((s) => s.impressions);

  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const continentOf = useCallback((cc: string) => byCode.get(cc)?.continent_group, [byCode]);
  const profile = useMemo(() => buildProfile(signals, features, continentOf, Date.now(), { tastes }), [signals, features, continentOf, tastes]);
  const strands = useMemo(() => dnaStrands(passportDna, profile.tags), [passportDna, profile.tags]);
  const picks = useMemo(() => {
    const fits = (f: FoodSummary) =>
      !explored[f.id] && diet.every((k) => f.diet[k] === "yes" || f.diet[k] === "depends") && !f.allergens.some((a) => (allergens as string[]).includes(a));
    const ranked = rankFoods(foods.filter(fits), profile, continentOf, { limit: 14, ignored });
    return dnaPicks(ranked, strands, 4);
  }, [foods, explored, diet, allergens, profile, continentOf, ignored, strands]);
  const nudge = useMemo(() => foodiNudge(strands, profile, { country: (cc) => byCode.get(cc)?.name_ko }), [strands, profile, byCode]);

  const [hover, setHover] = useState<Hover>(null);
  const ready = strands.length >= 2;
  const shown = ready ? strands : GHOST;
  const active = useMemo(() => {
    if (!hover) return null;
    if (hover.kind === "tag") return { tags: new Set([hover.tag]), foods: new Set(picks.filter((p) => p.links.includes(hover.tag)).map((p) => p.food.id)) };
    const p = picks.find((x) => x.food.id === hover.id);
    return { tags: new Set(p?.links ?? []), foods: new Set([hover.id]) };
  }, [hover, picks]);

  if (!hydrated) return <div className="forest-panel h-[26rem] animate-pulse rounded-[28px]" aria-hidden />;

  return (
    <section className="forest-panel relative isolate overflow-hidden rounded-[28px] p-4 sm:p-5" aria-label="Food DNA와 DNA 매칭 추천">
      {/* 3D 바닥: 원근 격자 + 아래쪽 네온 안개 */}
      <div aria-hidden className="dna-floor pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2" />
      <div aria-hidden className="pointer-events-none absolute -left-10 top-10 -z-10 size-56 rounded-full bg-[radial-gradient(circle,rgb(61_245_122/0.22),transparent_65%)] blur-xl" />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow className="flex items-center gap-1.5 text-lime">
            <Icon name="sparkle" className="size-3.5" />
            Food DNA
          </Eyebrow>
          <h3 className="mt-1 text-title font-bold leading-snug text-white">
            {ready ? (
              <>
                <span className="text-lime">{strands[0].label}</span>·<span className="text-lime">{strands[1].label}</span> 쪽으로 끌리는 탐험가
              </>
            ) : (
              "음식을 탐험하면 DNA가 그려져요"
            )}
          </h3>
        </div>
        {ready && (
          <span className="shrink-0 rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/80">
            가닥 {strands.length}
          </span>
        )}
      </header>

      <Linked strands={shown} ready={ready} picks={picks} active={active} setHover={setHover} />

      {nudge && (
        <button type="button" onClick={() => open({ question: nudge.questions[0] })} className={`${btn("lime", "md")} mt-4 w-full`}>
          <Icon name="mic" className="size-5" />
          푸디에게 내 DNA로 추천받기
        </button>
      )}
    </section>
  );
}

/** 나선 | 음식 카드 + 둘을 잇는 선(겹친 SVG). 선의 끝점은 실제 화면 위치를 재서 그린다 (크기가 바뀌면 다시) */
function Linked({ strands, ready, picks, active, setHover }: { strands: Strand[]; ready: boolean; picks: DnaPick<FoodSummary>[]; active: { tags: Set<string>; foods: Set<string> } | null; setHover: (h: Hover) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const helix = useRef<SVGSVGElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [geo, setGeo] = useState<{ w: number; h: number; anchors: Record<string, { x: number; y: number }>; ends: Record<string, { x: number; y: number }> } | null>(null);

  const measure = useCallback(() => {
    const b = box.current?.getBoundingClientRect();
    const s = helix.current?.getBoundingClientRect();
    if (!b || !s) return;
    const k = s.width / W;
    const anchors: Record<string, { x: number; y: number }> = {};
    strands.forEach((st, i) => (anchors[st.tag] = { x: s.left - b.left + CX * k, y: s.top - b.top + rungY(i) * k }));
    const ends: Record<string, { x: number; y: number }> = {};
    for (const [id, el] of cards.current) {
      const r = el.getBoundingClientRect();
      ends[id] = { x: r.left - b.left, y: r.top - b.top + r.height / 2 };
    }
    setGeo({ w: b.width, h: b.height, anchors, ends });
  }, [strands]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [measure, picks]);

  return (
    <div ref={box} className="relative mt-4 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-4 sm:gap-6">
      <Helix svgRef={helix} strands={strands} ready={ready} active={active?.tags ?? null} onTag={(tag) => setHover(tag ? { kind: "tag", tag } : null)} />

      <ul className="relative z-10 space-y-2.5" aria-label="DNA 매칭 추천 음식">
        {picks.map((p) => {
          const on = !active || active.foods.has(p.food.id);
          return (
            <li key={p.food.id}>
              <TrackLink
                food={p.food}
                src="dna"
                href={`/food/${p.food.slug}`}
                ref={(el: HTMLAnchorElement | null) => {
                  if (el) cards.current.set(p.food.id, el);
                  else cards.current.delete(p.food.id);
                }}
                onMouseEnter={() => setHover({ kind: "food", id: p.food.id })}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover({ kind: "food", id: p.food.id })}
                onBlur={() => setHover(null)}
                className={`group flex items-center gap-2.5 rounded-2xl border p-1.5 pr-2.5 backdrop-blur-md transition duration-300 ${
                  on ? "border-lime/35 bg-white/10 shadow-[0_0_24px_-8px_rgb(61_245_122/0.7)]" : "border-white/10 bg-white/5 opacity-45"
                } hover:-translate-y-0.5`}
              >
                <span
                  className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-white/10 bg-cover bg-center"
                  style={p.food.image_url ? { backgroundImage: `url(${p.food.image_url})` } : undefined}
                  aria-hidden
                >
                  <span className="absolute bottom-0.5 left-0.5 text-sm leading-none drop-shadow">{p.food.flag}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{p.food.name_ko}</span>
                  <span className="block truncate text-[11px] text-white/60">{pickReason(p)}</span>
                </span>
                {p.match > 0 && (
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-base font-bold tabular-nums leading-none text-lime">{p.match}%</span>
                    <span className="block text-[10px] text-white/50">매칭</span>
                  </span>
                )}
              </TrackLink>
            </li>
          );
        })}
      </ul>

      {/* 연결선: 가로대 중심 → 카드 왼쪽. 바탕 선 + 빛이 흐르는 점선 두 겹 */}
      {geo && ready && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-visible" width={geo.w} height={geo.h}>
          <defs>
            <linearGradient id="dna-link" x1="0" x2="1">
              <stop offset="0" stopColor="#3df57a" stopOpacity="0.95" />
              <stop offset="1" stopColor="#c8f06a" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {picks.flatMap((p) =>
            p.links.map((tag) => {
              const a = geo.anchors[tag];
              const e = geo.ends[p.food.id];
              if (!a || !e) return null;
              const mid = (a.x + e.x) / 2;
              const d = `M${a.x},${a.y} C${mid},${a.y} ${mid},${e.y} ${e.x - 2},${e.y}`;
              const on = !active || (active.foods.has(p.food.id) && active.tags.has(tag));
              return (
                <g key={`${p.food.id}-${tag}`} style={{ opacity: active ? (on ? 1 : 0.1) : 0.6, transition: "opacity 300ms" }}>
                  <path d={d} fill="none" stroke="url(#dna-link)" strokeWidth={active && on ? 2 : 1.25} />
                  <path d={d} fill="none" stroke="#eaffd0" strokeWidth={active && on ? 2.5 : 1.5} strokeLinecap="round" className="dna-flow" />
                  <circle cx={e.x - 2} cy={e.y} r={2.5} fill="#c8f06a" />
                </g>
              );
            }),
          )}
        </svg>
      )}
    </div>
  );
}

/** 3D 이중 나선. 두 뼈대(앞·뒤로 도는 사인 곡선)를 잘게 나눈 선분으로 그려 깊이마다 굵기·밝기를 달리한다 */
const Helix = memo(function Helix({ svgRef, strands, ready, active, onTag }: { svgRef: React.RefObject<SVGSVGElement | null>; strands: Strand[]; ready: boolean; active: Set<string> | null; onTag: (tag: string | null) => void }) {
  const [theta, setTheta] = useState(0.6);
  const H = rungY(strands.length - 1) + TOP;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (svgRef.current) io.observe(svgRef.current);
    const loop = (t: number) => {
      // 약 30fps 로만 다시 그린다 (작은 SVG 지만 배터리 아끼기)
      if (visible && t - last > 33) {
        setTheta((th) => th + (t - last) * SPEED);
        last = t;
      } else if (!visible) last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => (cancelAnimationFrame(raf), io.disconnect());
  }, [svgRef]);

  // 뼈대 선분: 가로대 사이를 8칸으로 나눠 위치와 깊이 계산
  const segs: { x1: number; y1: number; x2: number; y2: number; z: number; strand: 0 | 1 }[] = [];
  const steps = (strands.length - 1) * 8;
  const at = (u: number, s: 0 | 1) => {
    const ph = theta + u * TWIST + (s ? Math.PI : 0);
    return { x: CX + R * Math.cos(ph), y: TOP + u * ROW, z: Math.sin(ph) };
  };
  for (let k = 0; k < steps; k++) {
    for (const s of [0, 1] as const) {
      const a = at(k / 8, s);
      const b = at((k + 1) / 8, s);
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, z: (a.z + b.z) / 2, strand: s });
    }
  }
  segs.sort((p, q) => p.z - q.z); // 뒤 → 앞

  const rungs = strands.map((st, i) => {
    const a = at(i, 0);
    const b = at(i, 1);
    return { st, i, a, b, z: Math.max(a.z, b.z) };
  });
  const lit = (tag: string) => !active || active.has(tag);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={ready ? `나의 맛 DNA: ${strands.map((s) => s.label).join(", ")}` : "아직 비어 있는 맛 DNA"}>
      <defs>
        <filter id="dna-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="dna-node">
          <stop offset="0" stopColor="#f4ffe0" />
          <stop offset="0.45" stopColor="#74ff9f" />
          <stop offset="1" stopColor="#138a3d" />
        </radialGradient>
      </defs>

      {/* 축 빛기둥 */}
      <line x1={CX} y1={4} x2={CX} y2={H - 4} stroke="#3df57a" strokeOpacity="0.12" strokeWidth="10" strokeLinecap="round" />

      {/* 가로대 (가닥 = 내 맛 하나). 무게가 클수록 굵고 밝다 */}
      {rungs.map(({ st, a, b }) => (
        <line key={st.tag} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c8f06a" strokeWidth={1 + 3 * st.w} strokeLinecap="round" strokeOpacity={(0.2 + 0.7 * st.w) * (lit(st.tag) ? 1 : 0.25)} style={{ transition: "stroke-opacity 300ms" }} />
      ))}

      {/* 두 뼈대 — 앞쪽일수록 굵고 밝게 */}
      {segs.map((s, k) => (
        <line key={k} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.strand ? "#3df57a" : "#b8ff6a"} strokeWidth={1.6 + 1.6 * (s.z + 1)} strokeOpacity={0.25 + 0.6 * ((s.z + 1) / 2)} strokeLinecap="round" />
      ))}

      {/* 마디 구슬 (앞쪽 끝은 크게 + 빛) */}
      <g filter="url(#dna-glow)">
        {rungs.flatMap(({ st, a, b }) =>
          [a, b].map((p, j) => (
            <circle key={`${st.tag}${j}`} cx={p.x} cy={p.y} r={(2 + 2.6 * st.w) * (0.75 + 0.35 * (p.z + 1))} fill="url(#dna-node)" opacity={(0.45 + 0.55 * ((p.z + 1) / 2)) * (lit(st.tag) ? 1 : 0.3)} />
          )),
        )}
        {/* 연결선이 나가는 중심점 */}
        {ready && rungs.map(({ st, i }) => <circle key={`c${st.tag}`} cx={CX} cy={rungY(i)} r={lit(st.tag) && active ? 3.2 : 1.8} fill="#eaffd0" opacity={lit(st.tag) ? 0.95 : 0.3} />)}
      </g>

      {/* 가닥 이름 (왼쪽 고정 — 움직이는 글자는 읽기 어렵다). 마우스를 올리면 그 가닥에 닿는 음식만 밝게 */}
      {ready &&
        rungs.map(({ st, i }) => (
          <g key={`l${st.tag}`} onMouseEnter={() => onTag(st.tag)} onMouseLeave={() => onTag(null)} className="cursor-default">
            <rect x={0} y={rungY(i) - 10} width={CX - R - 8} height={20} fill="transparent" />
            <text x={0} y={rungY(i)} dominantBaseline="middle" fontSize="11" fontWeight={lit(st.tag) && active ? 700 : 500} fill="#ffffff" fillOpacity={lit(st.tag) ? 0.92 : 0.35} style={{ transition: "fill-opacity 300ms" }}>
              {st.label}
            </text>
            <text x={CX - R - 10} y={rungY(i)} dominantBaseline="middle" textAnchor="end" fontSize="9" fill="#c8f06a" fillOpacity={lit(st.tag) ? 0.8 : 0.25}>
              {Math.round(st.w * 100)}
            </text>
          </g>
        ))}
    </svg>
  );
});
