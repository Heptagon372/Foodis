import { describe, expect, it } from "vitest";
import { rms, threshold, VAD, vadStart, vadStep } from "./vad";

/** 100ms 간격으로 level 들을 넣고 처음으로 멈춘 시점·이유를 돌려준다 */
function run(levels: number[]) {
  let s = vadStart();
  for (let i = 0; i < levels.length; i++) {
    const r = vadStep(s, levels[i], 100);
    s = r.s;
    if (r.action !== "continue") return { action: r.action, at: (i + 1) * 100 };
  }
  return { action: "continue" as const, at: levels.length * 100 };
}
const rep = (level: number, ms: number) => Array<number>(ms / 100).fill(level);

describe("VAD (서버 인식 녹음 자동 멈춤)", () => {
  it("rms: 사인파·무음", () => {
    expect(rms(new Float32Array(256))).toBe(0);
    expect(rms(Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 5) * 0.5))).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });

  it("문턱은 소음 바닥의 3배, 0.012~0.06 사이", () => {
    expect(threshold(0)).toBe(0.012);
    expect(threshold(0.01)).toBeCloseTo(0.03);
    expect(threshold(0.5)).toBe(0.06);
  });

  it("말한 뒤 1.2초 조용하면 stop", () => {
    const r = run([...rep(0.003, 500), ...rep(0.2, 1500), ...rep(0.004, 3000)]);
    expect(r.action).toBe("stop");
    expect(r.at).toBe(500 + 1500 + VAD.endSilenceMs);
  });

  it("말 사이 짧은 쉼(0.5초)에서는 멈추지 않는다", () => {
    const r = run([...rep(0.003, 400), ...rep(0.2, 800), ...rep(0.003, 500), ...rep(0.2, 800), ...rep(0.003, 1300)]);
    expect(r).toEqual({ action: "stop", at: 400 + 800 + 500 + 800 + 1200 });
  });

  it("5초 동안 말소리가 없으면 no_speech (업로드 안 함)", () => {
    expect(run(rep(0.004, 8000))).toEqual({ action: "no_speech", at: VAD.noSpeechMs });
  });

  it("탁 소리 한 번(100ms)은 말로 치지 않는다", () => {
    expect(run([...rep(0.003, 500), 0.3, ...rep(0.003, 6000)]).action).toBe("no_speech");
  });

  it("계속 말하면 12초에서 stop", () => {
    expect(run([...rep(0.003, 300), ...rep(0.2, 15000)])).toEqual({ action: "stop", at: VAD.maxMs });
  });

  it("분석이 막혀 계속 0 이면 판정을 끄고 최대 길이까지 녹음한 뒤 올린다 (Safari 잠긴 AudioContext)", () => {
    expect(run(rep(0, 15000))).toEqual({ action: "stop", at: VAD.maxMs });
  });

  it("시끄러운 곳: 소음 바닥이 높아도 말소리는 넘는다", () => {
    const r = run([...rep(0.015, 400), ...rep(0.25, 1000), ...rep(0.015, 2000)]);
    expect(r.action).toBe("stop");
  });
});
