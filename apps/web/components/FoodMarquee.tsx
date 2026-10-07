"use client";
// 홈 첫 화면의 '랜덤 음식 슬라이드' — 들어올 때마다 서버가 사진 있는 음식을 나라가 겹치지 않게 골라(lib/content/slides.ts) 옆으로 천천히 흘려 보낸다.
// 흐르는 건 진짜 가로 스크롤 줄이라 손가락으로 밀거나 ◀ ▶ 로 넘길 수 있다. 같은 목록을 두 번 이어 붙여 끝이 없이 돈다(두 번째 줄은 스크린리더·탭 순서에서 뺌).
// 멈춤: 마우스를 올리거나 키보드 포커스가 들어오면 · 손가락으로 만지면 3초 · ⏸ 버튼 · '동작 줄이기' 설정이면 처음부터 멈춤. 화면 밖이면 돌리지 않는다.
// 사진은 CSS 배경 — 숨은 트리(모바일·데스크톱 중 안 보이는 쪽)에서는 내려받지 않게 (docs/design/18)
import { useEffect, useRef, useState } from "react";
import type { SlideFood } from "@/lib/content/slides";
import { accentBg } from "./FoodCard";
import { TrackLink } from "./TrackLink";
import { IconButton } from "./ui";

/** 초당 몇 px 흐르는지 */
const SPEED = { sm: 26, lg: 34 };
const HOLD_MS = 3000;

export function FoodMarquee({ foods, size = "sm", className = "" }: { foods: SlideFood[]; size?: "sm" | "lg"; className?: string }) {
  const row = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const hold = useRef({ hover: false, until: 0 });

  // '동작 줄이기' 면 처음부터 멈춘 채로 (버튼으로 켤 수는 있다)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el || !playing || foods.length < 2) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    let raf = 0;
    let last = 0;
    let pos = -1; // 흐르는 위치(소수) — scrollLeft 는 정수로 반올림되므로 따로 쌓는다. -1 = 지금 위치에서 다시 시작
    const step = (t: number) => {
      const dt = last ? Math.min(64, t - last) : 0;
      last = t;
      const h = hold.current;
      if (visible && !h.hover && Date.now() > h.until) {
        const loop = copy.current?.offsetWidth ?? 0;
        if (pos < 0) pos = el.scrollLeft; // 사람이 밀어 둔 자리부터 이어서
        pos += (SPEED[size] * dt) / 1000;
        if (loop > 0 && pos >= loop) pos -= loop; // 첫 줄을 다 지나면 같은 모양인 처음으로 — 이음새가 안 보인다
        el.scrollLeft = pos;
      } else pos = -1;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [playing, size, foods.length]);

  const pauseFor = (ms = HOLD_MS) => (hold.current.until = Date.now() + ms);
  const nudge = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    pauseFor(4000);
    const card = (copy.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 200;
    const loop = copy.current?.offsetWidth ?? 0;
    // 끝없이 돌게: 처음에서 뒤로 가면 두 번째 줄의 같은 자리로, 두 번째 줄에서 앞으로 가면 첫 줄의 같은 자리로 옮겨 놓고 간다 (모양이 같아 티가 안 난다)
    if (loop && dir < 0 && el.scrollLeft < card * 2) el.scrollLeft += loop;
    if (loop && dir > 0 && el.scrollLeft >= loop) el.scrollLeft -= loop;
    el.scrollBy({ left: dir * card * 2, behavior: "smooth" });
  };

  if (!foods.length) return null;
  const lg = size === "lg";
  const items = (dup: boolean) =>
    foods.map((f) => (
      <TrackLink
        key={`${dup ? "b" : "a"}-${f.slug}`}
        food={f}
        src="home_marquee"
        href={`/food/${f.slug}`}
        tabIndex={dup ? -1 : undefined}
        className={`group relative mr-3 block shrink-0 overflow-hidden rounded-[24px] border border-line shadow-soft lg:mr-5 lg:rounded-[28px] ${lg ? "h-64 w-52" : "h-48 w-36"}`}
      >
        <span aria-hidden className="absolute inset-0 transition duration-500 group-hover:scale-105" style={accentBg(f.accent, f.image_url)} />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-shade/85 via-shade/15 to-transparent" />
        <span aria-hidden className={`glass-dark absolute left-2.5 top-2.5 grid place-items-center rounded-full leading-none ${lg ? "size-10 text-xl" : "size-8 text-base"}`}>
          {f.flag}
        </span>
        <span className={`absolute inset-x-0 bottom-0 text-white ${lg ? "p-4" : "p-3"}`}>
          <span className="block text-[12px] font-semibold text-white/80">{f.country_name}</span>
          <span className={`block font-bold leading-tight ${lg ? "text-title" : "text-[15px]"}`}>{f.name_ko}</span>
        </span>
      </TrackLink>
    ));

  return (
    // min-w-0: 격자·flex 안에 들어가도 흐르는 줄(수천 px)이 부모 폭을 늘리지 않게
    <section aria-labelledby={`marquee-${size}`} className={`min-w-0 space-y-3 ${className}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-leaf">Random picks</p>
          <h2 id={`marquee-${size}`} className={`font-bold text-ink ${lg ? "text-h2" : "text-title"}`}>
            오늘의 세계 음식
          </h2>
          {lg && <p className="text-caption text-muted">들어올 때마다 다른 나라 음식이 흘러가요</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton icon="arrow-left" label="이전 음식" variant="outline" onClick={() => nudge(-1)} className="hidden pointer-fine:grid" />
          <IconButton icon={playing ? "pause" : "play"} label={playing ? "슬라이드 멈추기" : "슬라이드 다시 흐르기"} variant="outline" pressed={!playing} onClick={() => setPlaying((p) => !p)} />
          <IconButton icon="arrow-right" label="다음 음식" variant="outline" onClick={() => nudge(1)} className="hidden pointer-fine:grid" />
        </div>
      </div>
      <div
        ref={row}
        role="region"
        aria-label="랜덤 음식 슬라이드"
        onPointerEnter={(e) => e.pointerType === "mouse" && (hold.current.hover = true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && (hold.current.hover = false)}
        onPointerDown={() => pauseFor()}
        onTouchStart={() => pauseFor()}
        onWheel={() => pauseFor()}
        onFocus={() => (hold.current.hover = true)}
        onBlur={() => (hold.current.hover = false)}
        className={`flex overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${lg ? "[mask-image:linear-gradient(90deg,transparent,#000_3%,#000_97%,transparent)]" : "-mx-5 px-5"}`}
      >
        <div ref={copy} className="flex shrink-0">
          {items(false)}
        </div>
        <div aria-hidden className="flex shrink-0">
          {items(true)}
        </div>
      </div>
    </section>
  );
}

