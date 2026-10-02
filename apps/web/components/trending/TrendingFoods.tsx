"use client";
// 지금 뜨는 음식 — 실시간 검색어처럼 1~10위 + NEW · ▲n. 커뮤니티·뉴스 맨 위에 크게 둔다.
// 근거: 최근 48시간 뉴스 제목·커뮤니티 글의 음식 언급 vs 그 전 7일 평균 (lib/trends/rising.ts). 순위 변동은 6시간 전과 비교
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchTrending } from "@/lib/client/community";
import type { RisingItem } from "@/lib/trends/rising";
import { useFoodi } from "../FoodiSheet";
import { Icon } from "../icons";
import { Eyebrow } from "../ui";

/** DB 음식이면 음식 상세로, 아니면 그 키워드 뉴스로 */
const hrefOf = (it: RisingItem) => (it.slug ? `/food/${it.slug}` : `/news?term=${encodeURIComponent(it.term)}`);

export function RankBadge({ it, onDark = false }: { it: RisingItem; onDark?: boolean }) {
  if (it.badge === "new") return <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-black tracking-wide ${onDark ? "bg-lime text-on-lime" : "bg-diet-no text-white"}`}>NEW</span>;
  if (it.badge === "up")
    return (
      <span className={`inline-flex items-center text-[12px] font-bold tabular-nums ${onDark ? "text-lime" : "text-diet-no"}`} aria-label={`${it.delta}계단 상승`}>
        <Icon name="up" className="size-3.5" strokeWidth={2.5} />
        {it.delta}
      </span>
    );
  if (it.badge === "down")
    return (
      <span className={`inline-flex items-center text-[12px] font-bold tabular-nums ${onDark ? "text-white/50" : "text-muted"}`} aria-label={`${-it.delta}계단 하락`}>
        <Icon name="down" className="size-3.5" strokeWidth={2.5} />
        {-it.delta}
      </span>
    );
  return <Icon name="minus" className={`size-3.5 ${onDark ? "text-white/40" : "text-muted"}`} aria-label="변동 없음" />;
}

const growthLabel = (g: number) => (g >= 1.5 ? `×${g >= 9 ? "9+" : g.toFixed(1)}` : null);

export function TrendingFoods({ items, title = "지금 뜨는 음식", caption, loading }: { items: RisingItem[] | null; title?: string; caption?: string; loading?: boolean }) {
  const { open } = useFoodi();
  const [all, setAll] = useState(false);
  if (loading || !items) return <div className="h-56 animate-pulse rounded-[28px] bg-sunken/70" aria-hidden />;
  if (!items.length) {
    return (
      <section className="forest-panel rounded-[28px] p-5">
        <Eyebrow className="flex items-center gap-1.5 text-lime">
          <Icon name="flame" className="size-3.5" />
          {title}
        </Eyebrow>
        <p className="mt-2 text-sm text-white/75">아직 순위를 매길 만큼 모이지 않았어요. 뉴스가 쌓이고 글이 올라오면 실시간으로 채워져요.</p>
      </section>
    );
  }
  const [first, ...rest] = items;
  const shown = all ? rest : rest.slice(0, 4);
  return (
    <section className="forest-panel space-y-4 rounded-[28px] p-5" aria-label={title}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div>
          <Eyebrow className="flex items-center gap-1.5 text-lime">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-lime" />
            </span>
            실시간 급상승
          </Eyebrow>
          <h2 className="mt-1 text-xl font-bold">{title}</h2>
        </div>
        {caption && <p className="text-[11px] text-white/60 sm:text-right">{caption}</p>}
      </div>

      {/* 1위는 크게 */}
      <div className="flex items-center gap-3 rounded-3xl border border-white/12 bg-white/8 p-3.5">
        <span className="font-serif text-5xl font-black leading-none text-lime tabular-nums">1</span>
        <Link href={hrefOf(first)} className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-2xl font-bold">{first.term}</span>
            <RankBadge it={first} onDark />
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-white/65">
            {growthLabel(first.growth) && <span className="font-semibold text-lime">언급 {growthLabel(first.growth)}</span>}
            <span>{[first.news && `뉴스 ${first.news}`, first.community && `커뮤니티 ${first.community}`].filter(Boolean).join(" · ")}</span>
          </span>
        </Link>
        <button type="button" onClick={() => open({ question: `${first.term} 어떤 음식이야?` })} className="glass-dark grid size-11 shrink-0 place-items-center rounded-full" aria-label={`푸디에게 ${first.term} 묻기`}>
          <Icon name="mic" className="size-5" />
        </button>
      </div>

      <ol className="grid gap-1 sm:grid-cols-2 sm:gap-x-4">
        {shown.map((it) => (
          <li key={it.term}>
            <Link href={hrefOf(it)} className="flex h-11 items-center gap-3 rounded-2xl px-2 transition hover:bg-white/8">
              <span className={`w-5 text-center text-lg font-black tabular-nums ${it.rank <= 3 ? "text-lime" : "text-white/70"}`}>{it.rank}</span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{it.term}</span>
              {growthLabel(it.growth) && <span className="text-[11px] font-semibold text-white/55">{growthLabel(it.growth)}</span>}
              <span className="flex w-9 justify-end">
                <RankBadge it={it} onDark />
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {rest.length > 4 && (
        <button type="button" onClick={() => setAll(!all)} className="flex w-full items-center justify-center gap-1 text-[13px] font-semibold text-white/75 hover:text-white" aria-expanded={all}>
          {all ? "접기" : `${items.length}위까지 보기`}
          <Icon name={all ? "up" : "down"} className="size-3.5" />
        </button>
      )}
    </section>
  );
}

/** 직접 불러오는 버전 (커뮤니티 화면용) */
export function TrendingFoodsLive() {
  const [data, setData] = useState<{ items: RisingItem[]; caption: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTrending()
      .then((r) => alive && setData({ items: r.items, caption: `최근 48시간 · 뉴스 ${r.counts.news}건 · 글 ${r.counts.community}개 기준` }))
      .catch(() => alive && setData({ items: [], caption: "" }));
    return () => {
      alive = false;
    };
  }, []);
  return <TrendingFoods items={data?.items ?? null} caption={data?.caption} />;
}
