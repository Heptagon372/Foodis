import { describe, expect, it } from "vitest";
import { BENCH_SENTENCES } from "./sentences";
import { charErrorRate, fmtMs, levenshtein, markdownTable, mp3DurationSec, normalizeForCer, percentile, summarize } from "./stats";

describe("percentile", () => {
  it("선형 보간 (numpy 기본값과 같음)", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 50)).toBe(5.5);
    expect(percentile(xs, 95)).toBeCloseTo(9.55);
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 100)).toBe(10);
  });
  it("정렬 안 된 입력·NaN 무시, 빈 배열은 NaN", () => {
    expect(percentile([30, 10, NaN, 20], 50)).toBe(20);
    expect(percentile([], 50)).toBeNaN();
    expect(percentile([7], 95)).toBe(7);
  });
  it("summarize", () => {
    expect(summarize([100, 200, 300])).toEqual({ n: 3, p50: 200, p95: 290, mean: 200, max: 300 });
    expect(summarize([]).n).toBe(0);
  });
});

describe("문자 오류율", () => {
  it("편집 거리", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("힌칼리", "힝칼리")).toBe(1);
  });
  it("공백·문장부호 차이는 오류가 아니다", () => {
    expect(normalizeForCer("폴란드 피에로기, 조지아 힌칼리.")).toBe("폴란드피에로기조지아힌칼리");
    expect(charErrorRate("세비체는 신선한 생선이에요.", "세비체는 신선한 생선이에요")).toBe(0);
  });
  it("음식명 오인식은 글자 수 비율로", () => {
    // 10글자 중 1글자 틀림
    expect(charErrorRate("인제라는발효빵이에요", "인재라는발효빵이에요")).toBeCloseTo(0.1);
    expect(charErrorRate("", "")).toBe(0);
    expect(charErrorRate("", "아")).toBe(1);
  });
});

describe("표시", () => {
  it("fmtMs", () => {
    expect(fmtMs(1234.4)).toBe("1,234ms");
    expect(fmtMs(NaN)).toBe("—");
  });
  it("markdownTable 은 | 를 이스케이프", () => {
    expect(markdownTable(["a", "b"], [["x|y", 1]])).toBe("| a | b |\n|---|---|\n| x\\|y | 1 |");
  });
});

describe("mp3DurationSec", () => {
  it("MPEG1 Layer III 128kbps 44.1kHz 프레임을 센다", () => {
    const frameLen = Math.floor((144 * 128_000) / 44_100); // 417, 패딩 없음
    const frames = 100;
    const buf = new Uint8Array(frameLen * frames);
    for (let f = 0; f < frames; f++) buf.set([0xff, 0xfb, 0x90, 0x00], f * frameLen);
    expect(mp3DurationSec(buf)).toBeCloseTo((frames * 1152) / 44_100, 5);
  });
  it("ID3 태그를 건너뛰고, MP3 가 아니면 NaN", () => {
    const tag = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 0, 0];
    const frame = new Uint8Array(Math.floor((72 * 64_000) / 24_000)); // MPEG2 64kbps 24kHz
    frame.set([0xff, 0xf3, 0x84, 0x00]);
    expect(mp3DurationSec(new Uint8Array([...tag, ...frame]))).toBeCloseTo(576 / 24_000, 5);
    expect(mp3DurationSec(new Uint8Array([1, 2, 3, 4, 5]))).toBeNaN();
  });
});

describe("데모 문장", () => {
  it("10개, 실제 답 길이(60~200자)", () => {
    expect(BENCH_SENTENCES).toHaveLength(10);
    for (const s of BENCH_SENTENCES) {
      expect(s.answer.length, s.id).toBeGreaterThanOrEqual(60);
      expect(s.answer.length, s.id).toBeLessThanOrEqual(200);
    }
  });
});
