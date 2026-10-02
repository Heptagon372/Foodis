import { describe, expect, it } from "vitest";
import { peekFirst, ttsResponse } from "./tts-response";
import { ProviderError, type TTSProvider, type Usage } from "./types";

const usage = (provider: string): Usage => ({ provider, operation: "tts", units: 3, unitType: "chars", costUsd: 0 });
const bytes = (...xs: number[]) => new Uint8Array(xs);

/** 조각을 하나씩 내보내는 스트림. failAt 번째 read 에서 오류 */
function chunks(parts: Uint8Array[], failAt?: number) {
  let i = 0;
  let cancelled: unknown = null;
  const stream = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (i === failAt) return ctrl.error(new Error("upstream reset"));
      if (i >= parts.length) return ctrl.close();
      ctrl.enqueue(parts[i++]);
    },
    cancel(reason) {
      cancelled = reason ?? "cancelled";
    },
  });
  return { stream, cancelled: () => cancelled };
}

type Calls = string[];
function fake(name: string, calls: Calls, o: { stream?: "ok" | "throw" | "fatal" | "empty" | "fail-before-first"; synth?: "ok" | "throw" }): TTSProvider {
  const p: TTSProvider = {
    async synthesize() {
      calls.push(`${name}.synthesize`);
      if (o.synth === "throw") throw new ProviderError(name, "synth down", true);
      return { audio: chunks([bytes(9, 9)]).stream, usage: usage(name) };
    },
  };
  if (o.stream)
    p.stream = async () => {
      calls.push(`${name}.stream`);
      if (o.stream === "throw") throw new ProviderError(name, "stream down", true);
      if (o.stream === "fatal") throw new ProviderError(name, "bad key", false);
      const s = o.stream === "empty" ? chunks([]) : o.stream === "fail-before-first" ? chunks([bytes(1)], 0) : chunks([bytes(1, 2), bytes(3)]);
      return { stream: s.stream, contentType: "audio/mpeg", usage: usage(name) };
    };
  return p;
}

const body = async (r: Response) => [...new Uint8Array(await r.arrayBuffer())];

describe("ttsResponse (/api/foodi/tts)", () => {
  it("stream 이 되면 본문을 흘려보낸다 (synthesize 안 부름)", async () => {
    const calls: Calls = [];
    const used: Usage[] = [];
    const res = await ttsResponse([fake("openai", calls, { stream: "ok" })], "안녕", (u) => used.push(u));
    expect(res).not.toBeNull();
    expect(res!.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res!.headers.get("Cache-Control")).toBe("no-store");
    expect(res!.headers.get("X-TTS-Provider")).toBe("openai");
    expect(res!.headers.get("X-TTS-Mode")).toBe("stream");
    expect(used.map((u) => u.provider)).toEqual(["openai"]); // 첫 조각을 받은 시점에 기록
    expect(await body(res!)).toEqual([1, 2, 3]);
    expect(calls).toEqual(["openai.stream"]);
  });

  it("stream 이 throw 하면 같은 제공자의 synthesize 로", async () => {
    const calls: Calls = [];
    const res = await ttsResponse([fake("openai", calls, { stream: "throw" })], "안녕", () => {});
    expect(res!.headers.get("X-TTS-Mode")).toBe("buffered");
    expect(await body(res!)).toEqual([9, 9]);
    expect(calls).toEqual(["openai.stream", "openai.synthesize"]);
  });

  it("첫 조각 전에 끊기거나 빈 스트림이면 synthesize 로 (아직 200 을 안 보냈으니)", async () => {
    for (const mode of ["fail-before-first", "empty"] as const) {
      const calls: Calls = [];
      const res = await ttsResponse([fake("openai", calls, { stream: mode })], "안녕", () => {});
      expect(res!.headers.get("X-TTS-Mode")).toBe("buffered");
      expect(calls).toEqual(["openai.stream", "openai.synthesize"]);
    }
  });

  it("재시도해도 같은 오류(키 오류 등)면 synthesize 를 건너뛰고 다음 제공자로", async () => {
    const calls: Calls = [];
    const res = await ttsResponse([fake("openai", calls, { stream: "fatal" }), fake("google_tts", calls, {})], "안녕", () => {});
    expect(res!.headers.get("X-TTS-Provider")).toBe("google_tts");
    expect(res!.headers.get("X-TTS-Mode")).toBe("buffered");
    expect(calls).toEqual(["openai.stream", "google_tts.synthesize"]);
  });

  it("stream 이 없는 제공자(Google)는 synthesize, 1순위가 전부 실패하면 2순위", async () => {
    const calls: Calls = [];
    const used: Usage[] = [];
    const warns: string[] = [];
    const res = await ttsResponse(
      [fake("google_tts", calls, { synth: "throw" }), fake("openai", calls, { stream: "ok" })],
      "안녕",
      (u) => used.push(u),
      (m) => warns.push(m),
    );
    expect(res!.headers.get("X-TTS-Provider")).toBe("openai");
    expect(calls).toEqual(["google_tts.synthesize", "openai.stream"]);
    expect(used.map((u) => u.provider)).toEqual(["openai"]); // 실패한 제공자는 기록하지 않는다
    expect(warns).toHaveLength(1);
  });

  it("모두 실패하면 null (route 가 503)", async () => {
    const calls: Calls = [];
    const used: Usage[] = [];
    const res = await ttsResponse([fake("a", calls, { stream: "throw", synth: "throw" }), fake("b", calls, { synth: "throw" })], "안녕", (u) => used.push(u));
    expect(res).toBeNull();
    expect(used).toEqual([]);
    expect(await ttsResponse([], "안녕", () => {})).toBeNull();
  });
});

describe("peekFirst", () => {
  it("첫 조각 뒤 오류는 본문 스트림 오류로 전달된다 (이미 200 — 클라이언트가 받은 데까지 재생)", async () => {
    const { body: b } = await peekFirst(chunks([bytes(1), bytes(2)], 1).stream);
    const reader = b.getReader();
    expect((await reader.read()).value).toEqual(bytes(1));
    await expect(reader.read()).rejects.toThrow("upstream reset");
  });

  it("클라이언트가 끊으면 제공자 스트림도 취소한다", async () => {
    const src = chunks([bytes(1), bytes(2), bytes(3)]);
    const { body: b } = await peekFirst(src.stream);
    await b.cancel("client gone");
    expect(src.cancelled()).toBe("client gone");
  });
});
