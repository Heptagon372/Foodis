import { describe, expect, it } from "vitest";
import { audioKey, AudioCache, type CachedAudio } from "./audio-cache";

const item = (n: number, fill = 1): CachedAudio => ({ bytes: new Uint8Array(n).fill(fill), contentType: "audio/mpeg", provider: "openai", voice: "openai-marin" });

describe("AudioCache (LRU)", () => {
  it("개수 한도: 가장 오래 안 쓴 것부터 뺀다 · get 하면 최근으로", () => {
    const c = new AudioCache(2, 1000);
    c.set("a", item(10));
    c.set("b", item(10));
    expect(c.get("a")).toBeDefined(); // a 가 최근
    c.set("c", item(10)); // b 가 빠진다
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBeDefined();
    expect(c.get("c")).toBeDefined();
    expect(c.size).toBe(2);
  });

  it("바이트 한도 · 너무 큰 하나는 넣지 않는다", () => {
    const c = new AudioCache(40, 100, 60);
    c.set("a", item(50));
    c.set("b", item(40));
    c.set("c", item(30)); // 120 > 100 → a 가 빠진다
    expect(c.get("a")).toBeUndefined();
    expect(c.bytes).toBe(70);
    c.set("huge", item(61));
    expect(c.get("huge")).toBeUndefined();
    c.set("empty", item(0));
    expect(c.get("empty")).toBeUndefined();
  });

  it("같은 키를 다시 넣으면 바이트를 다시 센다", () => {
    const c = new AudioCache();
    c.set("a", item(10));
    c.set("a", item(30));
    expect(c.bytes).toBe(30);
    expect(c.size).toBe(1);
  });

  it("키: 제공자·음성·모델·언어·말투·글자 중 하나라도 다르면 다른 키", () => {
    const base = audioKey("openai", { voice: "marin", model: "gpt-4o-mini-tts" }, "안녕");
    expect(audioKey("openai", { voice: "marin", model: "gpt-4o-mini-tts" }, "안녕")).toBe(base);
    for (const k of [
      audioKey("google", { voice: "marin", model: "gpt-4o-mini-tts" }, "안녕"),
      audioKey("openai", { voice: "cedar", model: "gpt-4o-mini-tts" }, "안녕"),
      audioKey("openai", { voice: "marin", model: "tts-1" }, "안녕"),
      audioKey("openai", { voice: "marin", model: "gpt-4o-mini-tts", lang: "ja" }, "안녕"),
      audioKey("openai", { voice: "marin", model: "gpt-4o-mini-tts", style: "밝게" }, "안녕"),
      audioKey("openai", { voice: "marin", model: "gpt-4o-mini-tts" }, "안녕!"),
    ])
      expect(k).not.toBe(base);
  });
});
