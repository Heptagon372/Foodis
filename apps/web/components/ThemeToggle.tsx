"use client";
// 새싹 테마 토글: 누르면 새싹이 흙 속으로 쏙 들어가며 밤(다크), 다시 누르면 돋아나며 낮(라이트).
// 첫 그림(하이드레이션 직후)에는 움직이지 않고, 사용자가 누를 때만 움직인다.
import { useState, useSyncExternalStore } from "react";
import { readTheme, setTheme, subscribeTheme, type Theme } from "@/lib/client/theme";

/** 지금 테마 — 서버 그림은 light(기본), 하이드레이션 뒤 실제 값 */
export const useTheme = (): Theme => useSyncExternalStore(subscribeTheme, readTheme, () => "light");

export function ThemeToggle({ className = "" }: { className?: string }) {
  const dark = useTheme() === "dark";
  const [moved, setMoved] = useState(false);
  // 들어갈 땐 빠르게(ease-in), 나올 땐 살짝 튀어 오르며(spring)
  const grow = moved ? (dark ? "transform 320ms cubic-bezier(0.5, 0, 0.75, 0)" : "transform 560ms cubic-bezier(0.34, 1.56, 0.64, 1)") : "none";
  const fade = moved ? "opacity 300ms ease" : "none";
  return (
    <button
      type="button"
      onClick={() => {
        setMoved(true);
        setTheme(dark ? "light" : "dark");
      }}
      aria-label="다크 모드"
      aria-pressed={dark}
      title={dark ? "새싹을 깨워 밝게" : "새싹을 재워 어둡게"}
      className={`glass grid size-11 shrink-0 place-items-center rounded-full text-leaf transition active:scale-95 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {/* 밤: 작은 별 */}
        <g fill="var(--color-lime)" stroke="none" style={{ opacity: dark ? 1 : 0, transition: fade }}>
          <circle cx="7" cy="7" r="1.1" />
          <circle cx="16.5" cy="5" r="0.8" />
          <circle cx="19" cy="11" r="0.6" />
        </g>
        {/* 새싹 (lucide Sprout) — 흙 선 위로만 보인다. 안쪽 svg 가 잘라 준다 (clipPath id 는 SSR/하이드레이션 id 가 어긋날 수 있어 쓰지 않는다) */}
        <svg x="0" y="0" width="24" height="20.2" viewBox="0 0 24 20.2" overflow="hidden">
          <g style={{ transform: dark ? "translateY(17px) scale(0.55)" : "none", transformOrigin: "12px 21px", transition: grow }}>
            <path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3" />
            <path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4" />
          </g>
        </svg>
        {/* 흙 */}
        <path d="M4 21h16" className="text-ink-soft" stroke="currentColor" />
      </svg>
    </button>
  );
}
