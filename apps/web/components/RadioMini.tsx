"use client";
// 미니 플레이어: 라디오를 켠 채 다른 화면으로 가도 탭 바 위에서 이어진다 (F-VOI-05)
import Link from "next/link";
import { usePathname } from "next/navigation";
import { closeRadio, toggle, useRadio } from "@/lib/client/radio";
import { sentences } from "@/lib/radio/script";

const HIDDEN = ["/radio", "/admin", "/login", "/onboarding", "/intro"];

export function useRadioMiniVisible() {
  const r = useRadio();
  const path = usePathname();
  return r.episodes.length > 0 && r.status !== "idle" && !HIDDEN.some((p) => path.startsWith(p));
}

export function RadioMini() {
  const r = useRadio();
  const visible = useRadioMiniVisible();
  if (!visible) return null;
  const e = r.episodes[r.ep];
  const line = r.status === "ended" ? "오늘 라디오는 여기까지예요" : (sentences(e.segments[r.seg]?.text ?? "")[r.sent] ?? "");
  const playing = r.status === "playing";
  return (
    <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md px-3">
      <div className="flex animate-rise items-center gap-3 rounded-2xl bg-green-800 p-2 pr-3 text-ivory shadow-[0_12px_30px_-12px_#00000080]">
        <Link href="/radio" className="flex min-w-0 flex-1 items-center gap-3" aria-label={`라디오 열기 — ${e.food.name_ko}`}>
          <span className="grid size-11 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: e.food.accent }} aria-hidden>
            {e.food.flag}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              🎧 {e.food.name_ko} <span className="font-normal text-ivory/60">· {r.ep + 1}/{r.episodes.length}</span>
            </span>
            <span className="block truncate text-caption text-ivory/70">{line}</span>
          </span>
        </Link>
        <button type="button" onClick={toggle} className="grid size-10 shrink-0 place-items-center rounded-full bg-mint-500 text-lg text-green-800" aria-label={playing ? "일시정지" : "재생"}>
          {playing ? "⏸" : r.status === "ended" ? "↻" : "▶"}
        </button>
        <button type="button" onClick={closeRadio} className="grid size-8 shrink-0 place-items-center rounded-full text-ivory/60 hover:text-ivory" aria-label="라디오 끄기">
          ✕
        </button>
      </div>
    </div>
  );
}
