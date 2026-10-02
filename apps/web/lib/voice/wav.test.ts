import { describe, expect, it } from "vitest";
import { isWav, pcmToWav, rateFromMime, readWavHeader, wavHeader } from "./wav";

const text = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

describe("WAV 헤더 (Gemini PCM → <audio>)", () => {
  it("44바이트 RIFF/WAVE 헤더 — 24kHz 16bit 모노", () => {
    const h = wavHeader(48_000);
    const v = new DataView(h.buffer);
    expect(h.byteLength).toBe(44);
    expect(text(h, 0, 4)).toBe("RIFF");
    expect(v.getUint32(4, true)).toBe(36 + 48_000);
    expect(text(h, 8, 8)).toBe("WAVEfmt ");
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // 모노
    expect(v.getUint32(24, true)).toBe(24_000);
    expect(v.getUint32(28, true)).toBe(48_000); // 초당 바이트 = 24000 × 2
    expect(v.getUint16(32, true)).toBe(2);
    expect(v.getUint16(34, true)).toBe(16);
    expect(text(h, 36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(48_000);
  });

  it("pcmToWav: 헤더 + 데이터, 길이(초)가 맞다", () => {
    const pcm = new Uint8Array(24_000 * 2).fill(7); // 1초
    const wav = pcmToWav(pcm);
    expect(isWav(wav)).toBe(true);
    expect(wav.byteLength).toBe(44 + pcm.byteLength);
    expect(wav[44]).toBe(7);
    expect(readWavHeader(wav)).toMatchObject({ sampleRate: 24_000, channels: 1, bitsPerSample: 16, dataBytes: 48_000, seconds: 1 });
  });

  it("16bit 인데 홀수 바이트면 반쪽 샘플을 버린다", () => {
    const wav = pcmToWav(new Uint8Array(5));
    expect(readWavHeader(wav)!.dataBytes).toBe(4);
    expect(wav.byteLength).toBe(48);
  });

  it("다른 샘플레이트 · mime 에서 rate 읽기", () => {
    expect(rateFromMime("audio/L16;codec=pcm;rate=16000")).toBe(16_000);
    expect(rateFromMime("audio/wav")).toBeNull();
    expect(rateFromMime(null)).toBeNull();
    expect(readWavHeader(pcmToWav(new Uint8Array(32_000), { sampleRate: 16_000, channels: 1, bitsPerSample: 16 }))!.seconds).toBe(1);
  });

  it("WAV 가 아닌 것", () => {
    expect(isWav(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))).toBe(false); // MP3 프레임
    expect(readWavHeader(new Uint8Array(10))).toBeNull();
  });
});
