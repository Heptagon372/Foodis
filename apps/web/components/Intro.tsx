"use client";
// S0 인트로 (05 문서 §2): 인트로 영상 (세계 국기 → 소용돌이 → FOODIS 워드마크, 4.5초) → 태그라인 + CTA.
// 첫 방문은 영상 + CTA, 재방문(세션당 1회)은 영상만 보고 저절로 닫힌다. 언제든 건너뛸 수 있다.
// 자동 재생은 브라우저 정책상 음소거로만 가능 → 소리 켜기 버튼을 따로 둔다.
// 영상을 못 틀면(자동 재생 차단·로드 실패·동작 줄이기 설정) 바로 다음 단계로 넘어간다.
import { useEffect, useRef, useState } from "react";
import { btn } from "./ui";

const SRC = "/intro/foodis-intro.mp4";
const POSTER = "/intro/foodis-intro-poster.jpg";
// 영상 마지막 장면(워드마크) 바탕색 — 세로 화면의 남는 공간과 CTA 배경이 영상과 이어지게
const BG = "rgb(2 19 13)";
// 이 시간 안에 재생이 시작되지 않으면 영상을 포기한다
const START_TIMEOUT = 3500;

export function Intro({ onDone, short = false }: { onDone: () => void; short?: boolean }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const front = useRef<HTMLVideoElement>(null);
  const back = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"video" | "cta">("video");
  const [leaving, setLeaving] = useState(false);
  const [muted, setMuted] = useState(true);

  const close = () => {
    setLeaving(true);
    setTimeout(() => done.current(), 220);
  };
  // 영상이 끝났거나 못 틀 때: 첫 방문은 CTA, 재방문은 닫기
  const finish = () => {
    if (short) close();
    else setPhase("cta");
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    const v = front.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishRef.current();
      return;
    }
    let started = false;
    const timer = setTimeout(() => !started && finishRef.current(), START_TIMEOUT);
    const onPlaying = () => {
      started = true;
      back.current?.play().catch(() => {});
    };
    v.addEventListener("playing", onPlaying);
    v.play().catch(() => finishRef.current());
    return () => {
      clearTimeout(timer);
      v.removeEventListener("playing", onPlaying);
    };
  }, []);

  const toggleSound = () => {
    const v = front.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="FOODIS 인트로"
      className={`fixed inset-0 z-[60] overflow-hidden transition-opacity duration-200 ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ background: BG }}
      onClick={short ? close : undefined}
    >
      {/* 뒤: 같은 영상을 흐리게 꽉 채워 세로 화면의 위아래 빈 곳을 메운다 / 앞: 잘리지 않게 전체를 보여준다 */}
      <video ref={back} src={SRC} muted playsInline preload="auto" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
      <video
        ref={front}
        src={SRC}
        poster={POSTER}
        muted
        playsInline
        preload="auto"
        onEnded={() => finishRef.current()}
        onError={() => finishRef.current()}
        aria-label="FOODIS 인트로 영상"
        className="absolute inset-0 h-full w-full object-contain"
      />

      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex gap-2">
        {phase === "video" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSound();
            }}
            aria-label={muted ? "소리 켜기" : "소리 끄기"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-95"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        )}
        {(!short || phase === "video") && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (short) close();
              else done.current();
            }}
            className="inline-flex h-10 items-center rounded-full bg-white/15 px-4 text-sm font-medium text-white backdrop-blur transition active:scale-95"
          >
            건너뛰기
          </button>
        )}
      </div>

      {!short && (
        <div
          className={`absolute inset-x-0 bottom-0 space-y-6 px-8 pb-[max(3rem,calc(env(safe-area-inset-bottom)+2rem))] pt-24 text-center transition-all duration-500 ${phase === "cta" ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
          style={{ background: `linear-gradient(to top, ${BG} 55%, transparent)` }}
        >
          {/* 세리프 이탤릭은 영문 한 단어 강조에만 (디자인 v2 글꼴 원칙) — 영상 위라 다크 고정색 */}
          <p className="text-xl font-medium tracking-tight text-white/85">
            Different Cultures, One <span className="font-serif font-semibold italic text-lime-300">Table.</span>
          </p>
          <button type="button" onClick={() => done.current()} className={`${btn("primary", "lg")} w-full max-w-xs`}>
            세계 음식 탐험하기
          </button>
        </div>
      )}
    </div>
  );
}
