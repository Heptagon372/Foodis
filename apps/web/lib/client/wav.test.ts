import { describe, expect, it } from "vitest";
import { concat, downsample, encodeWav, pcmToWav, WAV_RATE } from "./wav";

describe("WAV 인코딩 (서버 인식 업로드)", () => {
  it("48kHz → 16kHz 는 3개씩 평균", () => {
    const out = downsample(Float32Array.from([0.3, 0.3, 0.3, -0.6, -0.6, -0.6, 0.1]), 48_000);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(-0.6);
    expect(downsample(Float32Array.from([1, 2]), 16_000)).toEqual(Float32Array.from([1, 2]));
  });

  it("44.1kHz 처럼 정수배가 아니어도 길이가 맞다", () => {
    expect(downsample(new Float32Array(44_100), 44_100).length).toBe(16_000);
  });

  it("RIFF 머리 · 16bit 모노 16kHz · 값 자르기", () => {
    const bytes = encodeWav(Float32Array.from([0, 1, -1, 2]));
    const v = new DataView(bytes.buffer);
    const s = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));
    expect([s(0), s(8), s(12), s(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint32(4, true)).toBe(36 + 8);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(WAV_RATE);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767]);
  });

  it("pcmToWav: 조각을 이어 audio/wav, 0.3초 미만이면 null (캡처 실패 → MediaRecorder 녹음)", () => {
    expect(concat([Float32Array.from([1]), Float32Array.from([2, 3])])).toEqual(Float32Array.from([1, 2, 3]));
    const blob = pcmToWav([new Float32Array(48_000), new Float32Array(48_000)], 48_000)!;
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 32_000 * 2);
    expect(pcmToWav([new Float32Array(1_000)], 48_000)).toBeNull();
  });
});
