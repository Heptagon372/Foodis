"use client";
// 가로로 넘기는 카드 줄 + 마우스용 좌우 화살표. 손가락(터치)은 그대로 밀어서 넘기고,
// 마우스·트랙패드(pointer: fine)에서만 줄 양끝에 화살표가 뜬다 — PC 에서 Shift+휠을 몰라도 끝까지 볼 수 있게
import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 가로 캐러셀 상태: 화살표로 한 화면의 80%씩, 끝에 닿으면 그쪽 화살표를 끈다 (넘칠 게 없으면 둘 다 꺼짐) */
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
    const el = ref.current;
    // 창 크기뿐 아니라 내용이 늦게 채워져도(데이터 로딩·사진) 다시 잰다
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(measure) : null;
    if (ro && el) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: reduced() ? "auto" : "smooth" });
  return { ref, onScroll: measure, prev: () => by(-1), next: () => by(1), ...edge };
}

/** className 은 스크롤되는 줄 자체(snap-row 등)에 붙는다. label 은 화살표 이름 ("이전 음식" / "다음 음식") */
export function ScrollRow({ className, children, label = "항목", as = "div", ...rest }: { className: string; children: ReactNode; label?: string; as?: "div" | "ul"; role?: string; "aria-label"?: string }) {
  const c = useCarousel<HTMLElement>();
  // 화살표는 마우스 보조라 탭 순서에서 뺀다 — 키보드는 줄 안의 링크로 이동하면 브라우저가 알아서 보이게 스크롤한다
  const arrow = (dir: "prev" | "next") => (
    <button
      type="button"
      onClick={dir === "prev" ? c.prev : c.next}
      aria-label={`${dir === "prev" ? "이전" : "다음"} ${label}`}
      tabIndex={-1}
      className={`glass absolute top-1/2 z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full text-ink shadow-lift transition pointer-fine:grid hover:text-leaf active:scale-95 ${dir === "prev" ? "-left-3" : "-right-3"} ${(dir === "prev" ? c.atStart : c.atEnd) ? "pointer-events-none opacity-0" : ""}`}
    >
      <Icon name={dir === "prev" ? "arrow-left" : "arrow-right"} className="size-5" />
    </button>
  );
  return (
    <div className="relative">
      {createElement(as, { ref: c.ref, onScroll: c.onScroll, className, ...rest }, children)}
      {arrow("prev")}
      {arrow("next")}
    </div>
  );
}
