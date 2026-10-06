"use client";
// 데스크톱 랜딩·푸터 공용 부품 (docs/design/17): 묻기 알약 · 도킹 화살표 · 섹션 머리 · 캐러셀 · 인트로 영상 칸 · 음식 사진 타일
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FoodSummary } from "@/lib/content/types";
import { accentBg } from "../FoodCard";
import { useFoodi } from "../FoodiSheet";
import { GuardTag, guardRing, useGuard } from "../DietGuard";
import { ImageCredit } from "../ImageCredit";
import { Icon } from "../icons";
import { TrackLink } from "../TrackLink";
import { Eyebrow } from "../ui";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 노치에 앉는 48px 사각 화살표 버튼 (레퍼런스의 → 버튼). page = 밝은 바탕, panel = 진한 판 위 테두리, dark = 진한 채움 */
export const dockBtn = (tone: "page" | "panel" | "dark") =>
  `grid size-12 place-items-center rounded-[14px] transition ${
    {
      page: "border border-line bg-surface text-ink shadow-soft hover:border-transparent hover:bg-lime hover:text-on-lime",
      panel: "border-2 border-white/70 text-white hover:bg-white/10",
      dark: "bg-forest text-white hover:bg-lime hover:text-on-lime",
    }[tone]
  }`;

/** 푸디에게 묻기 입력. light = 푸터(유리), dark = 히어로 왼쪽 위 노치(진한 알약 + 말로 묻기) */
export function AskForm({ tone, className = "" }: { tone: "light" | "dark"; className?: string }) {
  const { open } = useFoodi();
  const [text, setText] = useState("");
  const dark = tone === "dark";
  return (
    <form
      role="search"
      aria-label="푸디에게 묻기"
      onSubmit={(e) => {
        e.preventDefault();
        const v = text.trim();
        if (v) open({ question: v });
        else open();
        setText("");
      }}
      className={`flex items-center gap-2 rounded-full ${dark ? "slab pl-6 pr-1.5 shadow-lift" : "glass h-12 pl-5 pr-1.5"} ${className}`}
    >
      {dark && <Icon name="search" className="size-5 shrink-0 text-white/60" />}
      <label className="min-w-0 flex-1">
        <span className="sr-only">푸디에게 물어볼 내용</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={dark ? "푸디야, 무엇이든 물어보세요" : "푸디에게 물어보세요"}
          className={`w-full bg-transparent text-[15px] outline-none ${dark ? "text-white placeholder:text-white/60" : "text-ink placeholder:text-muted"}`}
        />
      </label>
      {dark && (
        <button type="button" onClick={() => open({ listen: true })} aria-label="말로 묻기" className="grid size-11 shrink-0 place-items-center rounded-full bg-white/12 text-white transition hover:bg-white/20">
          <Icon name="mic" className="size-5" />
        </button>
      )}
      <button type="submit" aria-label="묻기" className={`grid shrink-0 place-items-center rounded-full transition ${dark ? "size-12 bg-lime text-on-lime hover:bg-lime-strong" : "size-9 bg-brand text-on-brand hover:bg-brand-strong"}`}>
        <Icon name="arrow-right" className={dark ? "size-5" : "size-[18px]"} />
      </button>
    </form>
  );
}

/** 섹션 머리: 눈썹 + 큰 제목 + 설명, 오른쪽에 보조 요소 */
export function LandingHead({ id, eyebrow, title, desc, aside, tone = "light" }: { id: string; eyebrow: string; title: ReactNode; desc?: ReactNode; aside?: ReactNode; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <div className="flex items-end justify-between gap-8">
      <div className="max-w-2xl space-y-3">
        <Eyebrow className={dark ? "text-lime" : "text-leaf"}>{eyebrow}</Eyebrow>
        <h2 id={id} className={`text-section font-bold ${dark ? "text-white" : "text-ink"}`}>
          {title}
        </h2>
        {desc && <p className={`text-subtitle ${dark ? "text-white/75" : "text-ink-soft"}`}>{desc}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
  );
}

/** 가로 캐러셀 (레퍼런스 3의 화살표 띠): 화살표로 한 화면의 80%씩, 끝에 닿으면 화살표를 끈다 */
export function useCarousel<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edge, setEdge] = useState({ atStart: true, atEnd: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ atStart: el.scrollLeft <= 4, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: reduced() ? "auto" : "smooth" });
  return { ref, onScroll: measure, prev: () => by(-1), next: () => by(1), ...edge };
}

const CLIP = "/intro/foodis-intro.mp4";

/** 인트로 영상 칸: 화면에 처음 들어올 때 한 번 재생하고 마지막 장면(워드마크)에 멈춘다.
 *  src 는 그때 붙인다 — 숨은 트리(모바일)에서는 영상·포스터를 내려받지 않게 (poster 속성 대신 CSS 배경).
 *  위치(absolute 등)는 className 으로 — 영상이 absolute 라 위치 지정된 요소여야 한다 */
export function IntroClip({ className = "" }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = box.current;
    const v = video.current;
    if (!el || !v || reduced()) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        v.src = CLIP;
        v.play().catch(() => {});
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className={`overflow-hidden bg-[rgb(2_19_13)] bg-[url(/intro/foodis-intro-poster.jpg)] bg-cover bg-center ${className}`}>
      <video ref={video} muted playsInline preload="none" aria-hidden tabIndex={-1} className="absolute inset-0 size-full object-cover" />
    </div>
  );
}

/** 추천 사진 타일 (레퍼런스의 이미지 타일 + 도킹 화살표). 경고 링은 마스크 없는 바깥 링크에 — 마스크가 링을 자르지 않게 */
export function FoodTile({ food, reason }: { food: FoodSummary; reason: string }) {
  const guardFood = useMemo(() => ({ ...food, ingredients: food.ingredient_names }), [food]);
  const guard = useGuard(guardFood);
  const photo = !!food.image_url;
  return (
    <TrackLink food={food} src="home_rec" href={`/food/${food.slug}`} className={`group relative block rounded-[28px] ${guardRing(guard)}`}>
      <div className="notch notch-br dock-sm relative h-64 overflow-hidden rounded-[28px]" style={accentBg(food.accent, food.image_url)}>
        {photo && <div className="absolute inset-0 bg-gradient-to-t from-shade/80 via-shade/10 to-transparent" />}
        {guard.hits[0] && (
          <span className="absolute left-3 top-3 flex max-w-[70%]">
            <GuardTag r={guard} />
          </span>
        )}
        <ImageCredit credit={food.image_credit} link={false} className="absolute right-3 top-3" />
        {!photo && (
          <span aria-hidden className="absolute left-5 top-5 text-5xl">
            {food.flag}
          </span>
        )}
        <div className={`absolute inset-x-0 bottom-0 p-5 pr-20 ${photo ? "text-white" : "text-ink"}`}>
          <p className="text-caption font-semibold opacity-85">
            {food.flag} {food.country_name}
          </p>
          <h3 className="mt-1 text-h2 font-bold">{food.name_ko}</h3>
          <p className={`mt-1 flex items-center gap-1 text-[12px] font-semibold ${photo ? "text-lime" : "text-leaf"}`}>
            <Icon name="sparkle" className="size-3.5" />
            {reason}
          </p>
        </div>
      </div>
      <span aria-hidden className={`${dockBtn("page")} absolute bottom-0 right-0 group-hover:border-transparent group-hover:bg-lime group-hover:text-on-lime`}>
        <Icon name="arrow-right" className="size-5" />
      </span>
    </TrackLink>
  );
}
