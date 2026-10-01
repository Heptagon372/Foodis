"use client";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

const LABEL: Record<VoiceState, string> = {
  idle: "푸디에게 말하기",
  listening: "듣는 중 — 탭하면 끝내기",
  thinking: "푸디가 지도를 보고 있어요",
  speaking: "말하는 중 — 탭하면 멈추기",
};

const FLAGS = ["🇰🇷", "🇪🇹", "🇵🇪", "🇹🇷", "🇮🇳", "🇬🇪"];

/** idle(pulse) / listening(파형) / thinking(국기 회전) / speaking(파형) — 05 문서 §7. 상시 모션은 이 버튼만. */
export function VoiceButton({ state, onPress, size = "lg" }: { state: VoiceState; onPress: () => void; size?: "lg" | "md" }) {
  const dim = size === "lg" ? "size-28" : "size-16";
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={LABEL[state]}
      className={`${dim} relative grid place-items-center rounded-full bg-mint-500 text-green-800 shadow-[0_10px_30px_-10px_#1f5f4680] transition active:scale-95 ${state === "idle" ? "animate-pulse-ring" : ""} ${state === "listening" ? "bg-mint-600" : ""}`}
    >
      {state === "idle" && <MicIcon className={size === "lg" ? "size-10" : "size-7"} />}
      {(state === "listening" || state === "speaking") && <Wave bars={size === "lg" ? 5 : 4} tall={size === "lg"} />}
      {state === "thinking" && (
        <span className="relative block size-3/5 animate-spin-slow" aria-hidden>
          {FLAGS.map((f, i) => (
            <span key={f} className="absolute left-1/2 top-1/2 text-lg leading-none" style={{ transform: `translate(-50%, -50%) rotate(${i * 60}deg) translateY(-130%) rotate(-${i * 60}deg)` }}>
              {f}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function Wave({ bars, tall }: { bars: number; tall: boolean }) {
  return (
    <span className={`flex items-center gap-1 ${tall ? "h-10" : "h-6"}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="block h-full w-1.5 origin-center animate-wave rounded-full bg-green-800" style={{ animationDelay: `${(i % 3) * 120 + i * 40}ms` }} />
      ))}
    </span>
  );
}

export function MicIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
