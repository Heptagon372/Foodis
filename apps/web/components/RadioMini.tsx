"use client";
// 미니 플레이어: 라디오를 켠 채 다른 화면으로 가도 탭 바 위에서 이어진다 (F-VOI-05)
import Link from "next/link";
import { usePathname } from "next/navigation";
import { closeRadio, toggle, useRadio } from "@/lib/client/radio";
import { sentences } from "@/lib/radio/script";
import { Icon } from "./icons";
import { IconButton } from "./ui";

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
  const ended = r.status === "ended";
  const line = ended ? "오늘 라디오는 여기까지예요" : (sentences(e.segments[r.seg]?.text ?? "")[r.sent] ?? "");
  const playing = r.status === "playing";
  return (
    // 떠 있는 탭 바(68px + 아래 max(12px, 안전 영역)) 위. 가운데 푸디 구슬이 바 위로 ~18px 솟아 있어 그만큼 더 띄운다
    <div className="fixed inset-x-0 bottom-[calc(92px+max(0.75rem,env(safe-area-inset-bottom)))] z-40 mx-auto max-w-md px-3">
      <div className="forest-panel flex animate-rise items-center gap-2 rounded-[22px] p-2 shadow-lift">
        <Link href="/radio" className="flex min-w-0 flex-1 items-center gap-3" aria-label={`라디오 열기 — ${e.food.name_ko}`}>
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] border border-white/15 text-2xl" style={{ background: `${e.food.accent}66` }} aria-hidden>
            {e.food.flag}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Icon name="headphones" className="size-4 shrink-0 text-lime" />
              <span className="truncate">{e.food.name_ko}</span>
              <span className="shrink-0 font-normal text-white/60 tabular-nums">
                {r.ep + 1}/{r.episodes.length}
              </span>
            </span>
            <span className="block truncate text-caption text-white/75">{line}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-on-lime shadow-glow transition active:scale-95"
          aria-label={playing ? "일시정지" : ended ? "처음부터 다시" : "재생"}
        >
          <Icon name={playing ? "pause" : ended ? "replay" : "play"} className={`size-5 ${playing || ended ? "" : "translate-x-px fill-current"}`} />
        </button>
        <IconButton icon="close" label="라디오 끄기" onClick={closeRadio} variant="on-dark" />
      </div>
    </div>
  );
}
