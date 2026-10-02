// 제공자 어댑터 요청 모양 (실제 API 는 부르지 않는다 — 가짜 fetch). 문서 확인일 2026-10-02, design/11 문서 §2
import { describe, expect, it } from "vitest";
import { SPEECH_STYLE } from "@/lib/voice/styles";
import { isWav, readWavHeader } from "@/lib/voice/wav";
import { clovaRequest, clovaTTS } from "./clova-tts";
import { elevenlabsTTS, elevenRequest, parseVoiceIds } from "./elevenlabs-tts";
import { extractGeminiAudio, geminiRequest, geminiTTS } from "./gemini-tts";
import { googleRequest, localeOfVoice } from "./google-tts";
import { openaiSpeechParams } from "./openai";
import { ProviderError } from "./types";

type Call = { url: string; init?: RequestInit };
function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { f, calls };
}
const read = async (s: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(s).arrayBuffer());

describe("Google Cloud TTS", () => {
  it("음성 이름에서 로케일 → languageCode, MP3", () => {
    expect(localeOfVoice("cmn-CN-Chirp3-HD-Aoede")).toBe("cmn-CN");
    expect(googleRequest("안녕", { voice: "ko-KR-Chirp3-HD-Charon" })).toEqual({
      input: { text: "안녕" },
      voice: { languageCode: "ko-KR", name: "ko-KR-Chirp3-HD-Charon" },
      audioConfig: { audioEncoding: "MP3" },
    });
    expect(googleRequest("안녕").voice.name).toBe("ko-KR-Wavenet-A"); // env 기본
  });
});

describe("OpenAI gpt-4o-mini-tts", () => {
  it("기본 말투 지시 = 따뜻한 한국어 가이드 · mp3", () => {
    expect(openaiSpeechParams("안녕", { voice: "marin" })).toEqual({ model: "gpt-4o-mini-tts", voice: "marin", input: "안녕", instructions: SPEECH_STYLE.foodi, response_format: "mp3" });
  });
  it("역할 말투를 넘기면 그대로 · tts-1 에는 instructions 를 안 보낸다", () => {
    expect(openaiSpeechParams("안녕", { voice: "cedar", style: SPEECH_STYLE.story }).instructions).toBe(SPEECH_STYLE.story);
    expect(openaiSpeechParams("안녕", { model: "tts-1" })).not.toHaveProperty("instructions");
    expect(openaiSpeechParams("안녕").voice).toBe("coral"); // env 기본
  });
});

describe("ElevenLabs", () => {
  it("스트리밍 URL · 헤더 · 본문", () => {
    const { url, init } = elevenRequest("abcdefghij0123456789", "안녕", { model: "eleven_multilingual_v2" }, "KEY");
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/abcdefghij0123456789/stream?output_format=mp3_44100_128");
    expect(init.headers).toMatchObject({ "xi-api-key": "KEY", "content-type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ text: "안녕", model_id: "eleven_multilingual_v2" });
    expect(elevenRequest("id", "x", undefined, "K", false).url).not.toContain("/stream");
  });

  it("language_code 는 Flash v2.5 + 한국어 외 언어일 때만", () => {
    expect(JSON.parse(elevenRequest("id", "Sushi", { model: "eleven_flash_v2_5", lang: "ja" }, "K").init.body).language_code).toBe("ja");
    expect(JSON.parse(elevenRequest("id", "안녕", { model: "eleven_flash_v2_5", lang: "ko" }, "K").init.body)).not.toHaveProperty("language_code");
    expect(JSON.parse(elevenRequest("id", "Pasta", { model: "eleven_multilingual_v2", lang: "it" }, "K").init.body)).not.toHaveProperty("language_code");
  });

  it("음성 이름 → 이 계정의 voice_id 를 한 번만 찾고 기억한다", async () => {
    const { f, calls } = fakeFetch((url) => {
      if (url.includes("/v2/voices")) return Response.json({ voices: [{ voice_id: "x".repeat(20), name: "Talia Classic" }, { voice_id: "TALIAidTALIAidTALIA1", name: "Talia - Warm Soft Guide" }] });
      return new Response(new Uint8Array([0xff, 0xfb, 1]), { headers: { "content-type": "audio/mpeg" } });
    });
    const tts = elevenlabsTTS({ apiKey: "K", voiceIds: "", fetch: f });
    const s = await tts.stream!("안녕", { voice: "Talia", model: "eleven_flash_v2_5" });
    expect(s.contentType).toBe("audio/mpeg");
    expect([...(await read(s.stream))]).toEqual([0xff, 0xfb, 1]);
    expect(s.usage).toMatchObject({ provider: "elevenlabs", units: 2, unitType: "chars" });
    await tts.synthesize("안녕", { voice: "Talia" });
    expect(calls.map((c) => c.url.replace("https://api.elevenlabs.io", ""))).toEqual([
      "/v2/voices?search=Talia&page_size=20",
      "/v1/text-to-speech/TALIAidTALIAidTALIA1/stream?output_format=mp3_44100_128",
      "/v1/text-to-speech/TALIAidTALIAidTALIA1?output_format=mp3_44100_128",
    ]);
    expect((calls[0].init?.headers as Record<string, string>)["xi-api-key"]).toBe("K");
  });

  it("ELEVENLABS_VOICE_IDS 로 지정하면 찾지 않는다 · 없는 음성은 다시 해도 같은 오류", async () => {
    expect(parseVoiceIds("Talia=aaa, Darian = bbb ,bad")).toEqual(new Map([["talia", "aaa"], ["darian", "bbb"]]));
    const { f, calls } = fakeFetch((url) => (url.includes("/v2/voices") ? Response.json({ voices: [] }) : new Response(new Uint8Array([1]))));
    const tts = elevenlabsTTS({ apiKey: "K", voiceIds: "Darian=DARIANidDARIANidDAR", fetch: f });
    await tts.synthesize("안녕", { voice: "Darian" });
    expect(calls[0].url).toContain("/v1/text-to-speech/DARIANidDARIANidDAR?");
    const err = await tts.synthesize("안녕", { voice: "Nobody" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
  });

  it("HTTP 오류: 401 은 재시도 안 함, 429 는 재시도 가능", async () => {
    for (const [status, retryable] of [[401, false], [429, true], [503, true]] as const) {
      const { f } = fakeFetch(() => new Response("no", { status }));
      const err = await elevenlabsTTS({ apiKey: "K", voiceIds: "", fetch: f })
        .stream!("x", { voice: "abcdefghij0123456789" })
        .catch((e) => e);
      expect((err as ProviderError).retryable, String(status)).toBe(retryable);
    }
  });
});

describe("Gemini TTS (Interactions API)", () => {
  it("요청: 모델 · 화자 · 말투 annotation · store:false", () => {
    expect(geminiRequest("안녕", { voice: "Achird", style: "밝게" }, "gemini-3.8-flash-tts")).toEqual({
      model: "gemini-3.8-flash-tts",
      input: [{ type: "user_input", content: [{ type: "text", text: "안녕", annotations: [{ type: "speech_metadata", style: "밝게" }] }] }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Achird" }] },
      store: false,
    });
  });

  it("응답에서 마지막 오디오를 꺼낸다", () => {
    expect(extractGeminiAudio({ steps: [{ type: "thought", content: [{ type: "audio", data: "no" }] }, { type: "model_output", content: [{ type: "text" }, { type: "audio", data: "QQ==", mime_type: "audio/wav" }] }] })).toEqual({ data: "QQ==", mime: "audio/wav" });
    expect(extractGeminiAudio({})).toBeNull();
    expect(extractGeminiAudio(null)).toBeNull();
  });

  it("헤더 없는 PCM 이 오면 WAV 로 감싸 audio/wav · 이미 WAV 면 그대로", async () => {
    const pcm = Buffer.from(new Uint8Array(48_000)).toString("base64"); // 24kHz 16bit 1초
    const { f, calls } = fakeFetch(() => Response.json({ steps: [{ type: "model_output", content: [{ type: "audio", data: pcm, mime_type: "audio/l16;rate=24000" }] }] }));
    const r = await geminiTTS({ apiKey: "G", model: "gemini-3.8-flash-lite-tts", fetch: f }).synthesize("안녕", { voice: "Sulafat" });
    expect(r.contentType).toBe("audio/wav");
    const wav = await read(r.audio);
    expect(isWav(wav)).toBe(true);
    expect(readWavHeader(wav)).toMatchObject({ sampleRate: 24_000, seconds: 1 });
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect((calls[0].init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("G");
    expect(JSON.parse(calls[0].init!.body as string).model).toBe("gemini-3.8-flash-lite-tts");

    const wavB64 = Buffer.from(wav).toString("base64");
    const { f: f2 } = fakeFetch(() => Response.json({ steps: [{ type: "model_output", content: [{ type: "audio", data: wavB64 }] }] }));
    const r2 = await geminiTTS({ apiKey: "G", fetch: f2 }).synthesize("안녕");
    expect((await read(r2.audio)).byteLength).toBe(wav.byteLength);
  });

  it("stream() 이 없다 — WAV 는 받는 대로 재생할 수 없어서", () => {
    expect(geminiTTS({ apiKey: "G" }).stream).toBeUndefined();
  });

  it("오디오가 없거나 HTTP 오류면 ProviderError", async () => {
    const { f } = fakeFetch(() => Response.json({ steps: [] }));
    await expect(geminiTTS({ apiKey: "G", fetch: f }).synthesize("x")).rejects.toBeInstanceOf(ProviderError);
    const { f: f400 } = fakeFetch(() => new Response("bad", { status: 400 }));
    const err = (await geminiTTS({ apiKey: "G", fetch: f400 }).synthesize("x").catch((e) => e)) as ProviderError;
    expect(err.retryable).toBe(false);
  });
});

describe("NAVER CLOVA Voice Premium", () => {
  it("폼 본문 · NCP 헤더 · mp3", async () => {
    const { url, init } = clovaRequest("안녕하세요", { voice: "vian" }, "ID", "SECRET");
    expect(url).toBe("https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts");
    expect(init.headers).toMatchObject({ "X-NCP-APIGW-API-KEY-ID": "ID", "X-NCP-APIGW-API-KEY": "SECRET", "content-type": "application/x-www-form-urlencoded" });
    const form = new URLSearchParams(init.body);
    expect(Object.fromEntries(form)).toEqual({ speaker: "vian", text: "안녕하세요", volume: "0", speed: "0", pitch: "0", format: "mp3" });

    const { f } = fakeFetch(() => new Response(new Uint8Array([0xff, 0xf3])));
    const r = await clovaTTS({ keyId: "ID", key: "SECRET", fetch: f }).synthesize("안녕");
    expect(r.contentType).toBe("audio/mpeg");
    expect(r.usage.provider).toBe("clova");
    expect(clovaTTS({ keyId: "ID", key: "S" }).stream).toBeUndefined();
  });
});
