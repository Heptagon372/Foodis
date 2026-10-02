// /api/foodi/tts 의 목소리 고르기 · 대체 · 캐시를 가짜 제공자로 (route.ts 는 이 둘을 이어 붙이기만 한다)
import { describe, expect, it } from "vitest";
import { ttsResponse, type TTSAttempt } from "@/lib/providers/tts-response";
import { ProviderError, type TTSOptions, type TTSProvider, type Usage } from "@/lib/providers/types";
import { AudioCache } from "./audio-cache";
import type { TTSProviderId } from "./catalog";
import { planTTS, type PlannedVoice, type TTSRequest } from "./plan";
import { SPEECH_STYLE } from "./styles";

const CHAIN: PlannedVoice[] = [
  { provider: "google", voice: "ko-KR-Wavenet-A", id: "google-wavenet-a" },
  { provider: "openai", voice: "coral", model: "gpt-4o-mini-tts", id: "openai-coral" },
  { provider: "gemini", voice: "Sulafat", model: "gemini-3.8-flash-tts", id: "gemini-sulafat" },
];
const ready =
  (...ps: TTSProviderId[]) =>
  (p: TTSProviderId) =>
    ps.includes(p);
const plan = (req: TTSRequest, ...ps: TTSProviderId[]) => planTTS(req, { ready: ready(...ps), chain: CHAIN });
const ids = (xs: PlannedVoice[]) => xs.map((x) => x.id ?? `${x.provider}:${x.voice}`);

describe("planTTS — 시도 순서", () => {
  it("목소리를 안 고르면 기본 체인 (준비된 것만)", () => {
    expect(ids(plan({}, "google", "openai", "gemini"))).toEqual(["google-wavenet-a", "openai-coral", "gemini-sulafat"]);
    expect(ids(plan({}, "openai"))).toEqual(["openai-coral"]);
    expect(plan({})).toEqual([]);
  });

  it("고른 목소리가 1순위, 그다음 기본 체인 (같은 음성은 두 번 넣지 않음)", () => {
    expect(ids(plan({ voice: "eleven-talia-flash" }, "google", "openai", "elevenlabs"))).toEqual(["eleven-talia-flash", "google-wavenet-a", "openai-coral"]);
    const p = plan({ voice: "openai-coral" }, "google", "openai");
    expect(ids(p)).toEqual(["openai-coral", "google-wavenet-a"]);
    expect(p[0]).toMatchObject({ provider: "openai", voice: "coral", model: "gpt-4o-mini-tts" });
  });

  it("고른 목소리의 키가 없으면 기본 체인으로", () => {
    expect(ids(plan({ voice: "clova-vara" }, "google"))).toEqual(["google-wavenet-a"]);
  });

  it("미리듣기(exact)는 그 목소리만 — 키가 없으면 빈 목록(→ 503)", () => {
    expect(ids(plan({ voice: "google-chirp3-charon", exact: true }, "google", "openai"))).toEqual(["google-chirp3-charon"]);
    expect(plan({ voice: "clova-vian", exact: true }, "google", "openai")).toEqual([]);
  });

  it("라디오: host-a/host-b 는 준비된 제공자에서 자동 짝 + 역할 말투", () => {
    const a = plan({ voice: "host-a", role: "story" }, "google", "openai");
    const b = plan({ voice: "host-b", role: "mc" }, "google", "openai");
    expect(a[0]).toMatchObject({ id: "openai-cedar", style: SPEECH_STYLE.story });
    expect(b[0]).toMatchObject({ id: "openai-marin", style: SPEECH_STYLE.mc });
    // 대체 체인에도 같은 말투
    expect(a.slice(1).every((x) => x.style === SPEECH_STYLE.story)).toBe(true);
    // Google 만 있으면 Chirp 3 HD 두 목소리
    expect(plan({ voice: "host-a", role: "story" }, "google")[0].id).toBe("google-chirp3-charon");
    expect(plan({ voice: "host-b", role: "mc" }, "google")[0].id).toBe("google-chirp3-aoede");
  });

  it("라디오에서 고른 진행자의 키가 없으면 그 역할의 자동 진행자로", () => {
    expect(plan({ voice: "clova-vian", role: "story" }, "google")[0].id).toBe("google-chirp3-charon");
  });

  it("현지 발음(lang): 그 언어 목소리만 — 한국어 목소리로 대신하지 않는다", () => {
    const ja = plan({ lang: "ja-JP", voice: "openai-coral" }, "google", "openai", "gemini");
    expect(ja.map((x) => `${x.provider}:${x.voice}:${x.lang}`)).toEqual(["google:ja-JP-Chirp3-HD-Aoede:ja-JP", "openai:marin:ja", "gemini:Sulafat:ja"]);
    expect(ja.every((x) => x.id === null)).toBe(true);
    expect(plan({ lang: "am-ET" }, "google", "openai")).toEqual([]); // 암하라어는 Gemini 만 → 없으면 503 → 브라우저 음성(am-ET)
    // 한국어는 평소 경로
    expect(ids(plan({ lang: "ko-KR", voice: "openai-marin" }, "google", "openai"))).toEqual(["openai-marin", "google-wavenet-a"]);
  });
});

// ── 이어 붙이기: plan → 가짜 제공자 → ttsResponse (+ 캐시)

const usage = (provider: string, chars: number): Usage => ({ provider, operation: "tts", units: chars, unitType: "chars", costUsd: chars * 1e-5 });
const streamOf = (...parts: number[][]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(new Uint8Array(p));
      c.close();
    },
  });

type Log = string[];
function fakeProvider(name: TTSProviderId, log: Log, mode: "ok" | "down" | "badkey" = "ok"): TTSProvider {
  const tag = (o?: TTSOptions) => `${name}(${o?.voice ?? ""}${o?.lang ? `,${o.lang}` : ""})`;
  return {
    async synthesize(text, o) {
      log.push(`${tag(o)}.synthesize`);
      if (mode !== "ok") throw new ProviderError(name, "down", mode === "down");
      return { audio: streamOf([1, 2]), usage: usage(name, text.length), contentType: name === "gemini" ? "audio/wav" : undefined };
    },
    ...(name === "openai"
      ? {
          async stream(text: string, o?: TTSOptions) {
            log.push(`${tag(o)}.stream`);
            if (mode !== "ok") throw new ProviderError(name, "down", mode === "down");
            return { stream: streamOf([7], [8, 9]), contentType: "audio/mpeg", usage: usage(name, text.length) };
          },
        }
      : {}),
  };
}

function attempts(req: TTSRequest, providers: Partial<Record<TTSProviderId, TTSProvider>>): TTSAttempt[] {
  const ps = Object.keys(providers) as TTSProviderId[];
  return plan(req, ...ps).map((v) => ({ tts: providers[v.provider]!, provider: v.provider, voiceId: v.id, opts: { voice: v.voice, model: v.model, lang: v.lang, style: v.style } }));
}
const bytes = async (r: Response) => [...new Uint8Array(await r.arrayBuffer())];

describe("목소리 라우팅 + 대체 + 캐시 (route 흐름)", () => {
  it("고른 목소리의 제공자가 먼저 · 헤더에 목소리 id", async () => {
    const log: Log = [];
    const used: Usage[] = [];
    const res = await ttsResponse(attempts({ voice: "openai-marin" }, { google: fakeProvider("google", log), openai: fakeProvider("openai", log) }), "안녕하세요", (u) => used.push(u));
    expect(res!.headers.get("X-TTS-Provider")).toBe("openai");
    expect(res!.headers.get("X-TTS-Voice")).toBe("openai-marin");
    expect(res!.headers.get("X-TTS-Mode")).toBe("stream");
    expect(await bytes(res!)).toEqual([7, 8, 9]);
    expect(log).toEqual(["openai(marin).stream"]);
    expect(used.map((u) => u.provider)).toEqual(["openai"]);
  });

  it("고른 제공자가 죽으면 기본 체인으로 (키 오류면 synthesize 도 건너뜀)", async () => {
    const log: Log = [];
    const res = await ttsResponse(attempts({ voice: "openai-marin" }, { google: fakeProvider("google", log), openai: fakeProvider("openai", log, "badkey") }), "안녕", () => {});
    expect(res!.headers.get("X-TTS-Provider")).toBe("google");
    expect(res!.headers.get("X-TTS-Voice")).toBe("google-wavenet-a");
    expect(log).toEqual(["openai(marin).stream", "google(ko-KR-Wavenet-A).synthesize"]);
  });

  it("Gemini 는 audio/wav 로 나간다 (클라이언트는 다 받은 뒤 재생)", async () => {
    const res = await ttsResponse(attempts({ voice: "gemini-sulafat" }, { gemini: fakeProvider("gemini", []) }), "안녕", () => {});
    expect(res!.headers.get("Content-Type")).toBe("audio/wav");
    expect(res!.headers.get("X-TTS-Mode")).toBe("buffered");
  });

  it("캐시: 끝까지 받은 음성은 다음 요청에서 제공자 호출·사용량 기록 없이", async () => {
    const cache = new AudioCache();
    const log: Log = [];
    const used: Usage[] = [];
    const providers = { google: fakeProvider("google", log), openai: fakeProvider("openai", log) };
    const first = await ttsResponse(attempts({ voice: "host-b", role: "mc" }, providers), "다음은 일본이에요.", (u) => used.push(u), undefined, { cache });
    expect(await bytes(first!)).toEqual([7, 8, 9]); // 끝까지 읽어야 캐시에 들어간다
    const again = await ttsResponse(attempts({ voice: "host-b", role: "mc" }, providers), "다음은 일본이에요.", (u) => used.push(u), undefined, { cache });
    expect(again!.headers.get("X-TTS-Mode")).toBe("cache");
    expect(again!.headers.get("X-TTS-Voice")).toBe("openai-marin");
    expect(await bytes(again!)).toEqual([7, 8, 9]);
    expect(log).toEqual(["openai(marin).stream"]);
    expect(used).toHaveLength(1);
    // 다른 목소리(진행자 A)는 다른 키
    await ttsResponse(attempts({ voice: "host-a", role: "story" }, providers), "다음은 일본이에요.", () => {}, undefined, { cache });
    expect(log).toEqual(["openai(marin).stream", "openai(cedar).stream"]);
  });

  it("중간에 끊긴(취소된) 스트림은 캐시에 넣지 않는다", async () => {
    const cache = new AudioCache();
    const res = await ttsResponse(attempts({ voice: "openai-marin" }, { openai: fakeProvider("openai", []) }), "안녕", () => {}, undefined, { cache });
    await res!.body!.cancel("skip");
    expect(cache.size).toBe(0);
  });

  it("예산 초과(cacheOnly): 캐시에 있으면 주고, 없으면 합성하지 않는다", async () => {
    const cache = new AudioCache();
    const log: Log = [];
    const providers = { google: fakeProvider("google", log) };
    expect(await ttsResponse(attempts({}, providers), "안녕", () => {}, undefined, { cache, cacheOnly: true })).toBeNull();
    expect(log).toEqual([]);
    await bytes((await ttsResponse(attempts({}, providers), "안녕", () => {}, undefined, { cache }))!);
    const hit = await ttsResponse(attempts({}, providers), "안녕", () => {}, undefined, { cache, cacheOnly: true });
    expect(hit!.headers.get("X-TTS-Mode")).toBe("cache");
    expect(log).toEqual(["google(ko-KR-Wavenet-A).synthesize"]);
  });

  it("현지 발음: 로케일 음성 → 언어 코드가 제공자에게 간다", async () => {
    const log: Log = [];
    const res = await ttsResponse(attempts({ lang: "it-IT" }, { google: fakeProvider("google", log, "down"), openai: fakeProvider("openai", log) }), "Carbonara", () => {});
    expect(res!.headers.get("X-TTS-Provider")).toBe("openai");
    expect(log).toEqual(["google(it-IT-Chirp3-HD-Aoede,it-IT).synthesize", "openai(marin,it).stream"]);
  });
});
