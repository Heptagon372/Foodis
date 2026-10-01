"use client";
// S0 인트로 (05 문서 §2): 국기들이 바람에 흔들리며 들어와 → "FOOD" 글자 위 점들로 수렴 → 워드마크로 녹아듦 → 태그라인 + CTA.
// 총 3.2초, 건너뛰기 가능. 목표 좌표는 캔버스에 워드마크를 그려 채워진 픽셀에서 샘플링한다.
import { useEffect, useRef, useState } from "react";

const FLAGS = ["🇰🇷", "🇯🇵", "🇨🇳", "🇹🇭", "🇻🇳", "🇮🇳", "🇳🇵", "🇺🇿", "🇹🇷", "🇱🇧", "🇮🇷", "🇪🇬", "🇲🇦", "🇪🇹", "🇿🇦", "🇮🇹", "🇫🇷", "🇪🇸", "🇬🇷", "🇦🇹", "🇵🇱", "🇬🇪", "🇲🇽", "🇺🇸", "🇵🇪", "🇧🇷", "🇦🇷", "🇧🇴"];
const T = { gather: 1200, converge: 2200, reveal: 2800, end: 3200 };
// 재방문 1초 단축판 (05 문서 §2): 가장자리 등장 생략, 바로 모여 FOOD → 사라짐
const T_SHORT = { gather: 150, converge: 550, reveal: 750, end: 1000 };

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function sampleTargets(w: number, h: number, n: number, font: string): { x: number; y: number }[] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return [];
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("FOOD", w / 2, h / 2);
  const data = g.getImageData(0, 0, w, h).data;
  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) if (data[(y * w + x) * 4 + 3] > 128) pts.push({ x, y });
  // 왼쪽→오른쪽으로 고르게 뽑아 네 글자 모두에 국기가 앉도록
  pts.sort((a, b) => a.x - b.x);
  return Array.from({ length: n }, (_, i) => pts[Math.floor(((i + 0.5) / n) * pts.length)] ?? { x: w / 2, y: h / 2 });
}

export function Intro({ onDone, short = false }: { onDone: () => void; short?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const [leaving, setLeaving] = useState(false);
  const flagEls = useRef<(HTMLSpanElement | null)[]>([]);
  const [phase, setPhase] = useState<"flags" | "mark" | "cta">("flags");

  useEffect(() => {
    const box = stage.current;
    if (!box) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    const markW = Math.min(W * 0.8, 340);
    const markH = markW * 0.38;
    const fontPx = Math.round(markW * 0.3);
    const ox = (W - markW) / 2;
    const oy = H * 0.42 - markH / 2;
    // next/font 는 글꼴 이름을 바꿔 등록한다 → CSS 변수에서 실제 family 를 읽어야 캔버스 글자 모양이 워드마크와 같다
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-fraunces").trim() || "Georgia, serif";
    const targets = sampleTargets(Math.round(markW), Math.round(markH), FLAGS.length, `700 ${fontPx}px ${family}`);

    // 시작점: 화면 가장자리 (위·아래·좌·우 고르게)
    const starts = FLAGS.map((_, i) => {
      const side = i % 4;
      const r = ((i * 37) % 100) / 100;
      return side === 0 ? { x: r * W, y: -30 } : side === 1 ? { x: W + 30, y: r * H } : side === 2 ? { x: r * W, y: H + 30 } : { x: -30, y: r * H };
    });
    // 바람에 흔들리는 대기 위치: 가장자리에서 조금 들어온 곳
    const hover = starts.map((s, i) => ({ x: s.x * 0.82 + W * 0.09 + Math.sin(i) * 12, y: s.y * 0.82 + H * 0.09 + Math.cos(i * 1.3) * 12 }));

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const TT = short ? T_SHORT : T;
    const t0 = performance.now() - (reduce ? TT.reveal : 0);
    let raf = 0;
    const tick = (now: number) => {
      const t = now - t0;
      flagEls.current.forEach((el, i) => {
        if (!el) return;
        const a = short ? 1 : clamp01(t / TT.gather);
        const sway = Math.sin(t / 260 + i) * 6 * (1 - clamp01((t - TT.gather) / 600));
        let x = starts[i].x + (hover[i].x - starts[i].x) * ease(a);
        let y = starts[i].y + (hover[i].y - starts[i].y) * ease(a) + sway;
        const b = ease(clamp01((t - TT.gather) / (TT.converge - TT.gather)));
        const tg = targets[i] ?? { x: markW / 2, y: markH / 2 };
        x += (ox + tg.x - x) * b;
        y += (oy + tg.y - y) * b;
        const fade = 1 - clamp01((t - TT.converge) / (TT.reveal - TT.converge));
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 - 0.55 * b}) rotate(${sway * 2}deg)`;
        el.style.filter = `blur(${b * 1.6}px)`;
        el.style.opacity = String(Math.min(a * 2, 1) * fade);
      });
      if (t >= TT.converge) setPhase((p) => (p === "flags" ? "mark" : p));
      if (t >= TT.reveal && !short) setPhase("cta");
      if (t < TT.end) raf = requestAnimationFrame(tick);
      else if (short) {
        setLeaving(true);
        setTimeout(() => done.current(), 220);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [short]);

  return (
    <div ref={stage} className={`fixed inset-0 z-[60] overflow-hidden bg-ivory transition-opacity duration-200 ${leaving ? "opacity-0" : "opacity-100"}`}>
      {!short && (
      <button type="button" onClick={onDone} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-line/60">
        건너뛰기
      </button>
      )}
      {FLAGS.map((f, i) => (
        <span key={f} ref={(el) => void (flagEls.current[i] = el)} className="absolute left-0 top-0 text-3xl opacity-0 will-change-transform" aria-hidden>
          {f}
        </span>
      ))}
      <div className="absolute inset-x-0 top-[42%] -translate-y-1/2 text-center">
        <p
          className="font-display font-bold tracking-tight text-green-800 transition-opacity duration-500"
          style={{ fontSize: "min(24vw, 102px)", lineHeight: 1, opacity: phase === "flags" ? 0 : 1 }}
          aria-label="FOOD"
        >
          FOOD
        </p>
      </div>
      <div hidden={short} className={`absolute inset-x-0 top-[58%] space-y-8 px-8 text-center transition-all duration-300 ${phase === "cta" ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
        <p className="font-display text-xl italic text-charcoal/80">Different Cultures, One Table.</p>
        <button type="button" onClick={onDone} className="w-full max-w-xs rounded-full bg-green-800 px-6 py-4 text-[17px] font-semibold text-ivory shadow-lg transition active:scale-[0.98]">
          세계 음식 탐험하기
        </button>
      </div>
    </div>
  );
}
