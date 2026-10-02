"use client";
import { Earth, Mic } from "lucide-react";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

const LABEL: Record<VoiceState, string> = {
  idle: "푸디에게 말하기",
  listening: "듣는 중 — 탭하면 끝내기",
  thinking: "푸디가 지도를 보고 있어요",
  speaking: "말하는 중 — 탭하면 멈추기",
};

/**
 * 음성 버튼 — 초록 구슬 + 연두 맥박 (상시 모션은 이 버튼만, 05 문서 §7)
 * idle: 마이크 + 연두 맥박 링 / listening: 연두로 반전 + 파형 (지금 듣고 있다는 게 한눈에)
 * thinking: 천천히 도는 지구 / speaking: 파형
 */
export function VoiceButton({ state, onPress, size = "lg" }: { state: VoiceState; onPress: () => void; size?: "lg" | "md" }) {
  const lg = size === "lg";
  const listening = state === "listening";
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={LABEL[state]}
      className={`${lg ? "size-28 ring-[6px]" : "size-16 ring-4"} relative grid place-items-center rounded-full ring-white/70 shadow-[inset_0_2px_0_rgb(255_255_255/0.28),0_18px_40px_-14px_rgb(43_134_69/0.65)] transition active:scale-95 dark:ring-white/8 ${
        listening ? "bg-lime text-on-lime" : "bg-brand text-on-brand"
      } ${state === "idle" ? "animate-pulse-ring" : ""}`}
    >
      {state === "idle" && <Mic className={lg ? "size-10" : "size-7"} strokeWidth={1.75} aria-hidden />}
      {(state === "listening" || state === "speaking") && <Wave bars={lg ? 5 : 4} tall={lg} />}
      {state === "thinking" && <Earth className={`${lg ? "size-10" : "size-7"} animate-spin-slow`} strokeWidth={1.5} aria-hidden />}
    </button>
  );
}

function Wave({ bars, tall }: { bars: number; tall: boolean }) {
  return (
    <span className={`flex items-center gap-1 ${tall ? "h-10" : "h-6"}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="block h-full w-1.5 origin-center animate-wave rounded-full bg-current" style={{ animationDelay: `${(i % 3) * 120 + i * 40}ms` }} />
      ))}
    </span>
  );
}

/** 마이크 라인 아이콘 (lucide Mic) — 기존 import 경로 유지용 */
export function MicIcon({ className = "size-6" }: { className?: string }) {
  return <Mic className={className} strokeWidth={1.75} aria-hidden />;
}
