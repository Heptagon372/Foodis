"use client";
// 퀘스트·배지 완료 축하 토스트: 2.4초, 한 번에 하나. 화면 위쪽이라 탭 바·미니 플레이어와 겹치지 않는다.
// 터지는 점은 CSS 만으로 — 움직임 줄이기 설정이면 점은 숨기고 토스트만 보인다.
import { useEffect } from "react";
import { dismissToast, useQuestToasts } from "@/lib/client/quest";
import { Icon } from "./icons";

const DOTS = 8;
const CSS = `
@keyframes quest-burst { from { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1); } to { opacity: 0; transform: rotate(var(--a)) translateY(-30px) scale(0.4); } }
.quest-dot { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px; border-radius: 9999px; animation: quest-burst 700ms ease-out 80ms both; }
`;

export function QuestToast() {
  const queue = useQuestToasts();
  const head = queue[0];
  useEffect(() => {
    if (!head) return;
    const t = setTimeout(() => dismissToast(head.id), 2400);
    return () => clearTimeout(t);
  }, [head]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] mx-auto flex max-w-md justify-center px-4">
      {head && (
        // 숲 패널 알약: 두 테마 모두 진한 초록 + 흰 글자라 어느 바탕 위에서도 떠 보인다
        <div key={head.id} className="forest-panel relative flex animate-rise items-center gap-2.5 rounded-full py-2 pl-2 pr-4 text-sm shadow-lift">
          <style>{CSS}</style>
          <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-lime text-on-lime shadow-glow" aria-hidden>
            <Icon name={head.icon} className="size-[18px]" />
            <span className="motion-reduce:hidden">
              {Array.from({ length: DOTS }, (_, i) => (
                <span key={i} className="quest-dot" style={{ ["--a" as string]: `${(360 / DOTS) * i}deg`, background: i % 2 ? "var(--color-lime)" : "#fff" }} />
              ))}
            </span>
          </span>
          <span>
            <span className="font-medium text-lime">{head.label ?? (head.kind === "quest" ? "퀘스트 완료!" : "새 배지!")}</span> <b className="font-semibold">{head.title}</b>
          </span>
        </div>
      )}
    </div>
  );
}
