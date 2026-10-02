"use client";
// 퀘스트·배지 완료 축하 토스트: 2.4초, 한 번에 하나. 화면 위쪽이라 탭 바·미니 플레이어와 겹치지 않는다.
// 터지는 점은 CSS 만으로 — 움직임 줄이기 설정이면 점은 숨기고 토스트만 보인다.
import { useEffect } from "react";
import { dismissToast, useQuestToasts } from "@/lib/client/quest";

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
        <div key={head.id} className="relative flex animate-rise items-center gap-2.5 rounded-full bg-green-800 py-2 pl-2 pr-4 text-sm text-ivory shadow-[0_12px_30px_-12px_#00000080]">
          <style>{CSS}</style>
          <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-mint-500 text-base" aria-hidden>
            {head.emoji}
            <span className="motion-reduce:hidden">
              {Array.from({ length: DOTS }, (_, i) => (
                <span key={i} className="quest-dot" style={{ ["--a" as string]: `${(360 / DOTS) * i}deg`, background: i % 2 ? "var(--color-mint-500)" : "var(--color-diet-warn)" }} />
              ))}
            </span>
          </span>
          <span>
            <span className="text-mint-500">{head.label ?? (head.kind === "quest" ? "퀘스트 완료!" : "새 배지!")}</span> <b className="font-semibold">{head.title}</b>
          </span>
        </div>
      )}
    </div>
  );
}
