// 서버 STT (10 문서): 어댑터 요청 모양·응답 해석(가짜 fetch), 체인 fallback, 엔진 고르기, 표준어 옮기기 연결, 업로드 검사.
// 실제 API 는 부르지 않는다 (키 없음).
import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { openaiSTT } from "../openai";
import { parseChain, resolveChain } from "../registry/stt";
import { ProviderError, type LLMProvider, type STTLang, type STTProvider, type STTResult } from "../types";
import { preferFirst, transcribeWithChain } from "./chain";
import { CLOVA_STT_URL, clovaBoostings, clovaSTT } from "./clova";
import { audioExt, normLang, pickKeywords } from "./common";
import { ELEVENLABS_STT_URL, elevenlabsSTT } from "./elevenlabs";
import { GEMINI_BASE, geminiSTT } from "./gemini";
import { checkSttUpload, recognizeSpeech, STT_MAX_BYTES } from "./service";

type Call = { url: string; init: RequestInit };
/** 부른 내용을 기록하고 정해 둔 응답을 돌려주는 가짜 fetch */
function fakeFetch(reply: unknown, status = 200) {
  const calls: Call[] = [];
  const f = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof reply === "string" ? reply : JSON.stringify(reply), { status, headers: { "content-type": "application/json" } });
  };
  return { f, calls };
}
const webm = (n = 8_000) => new Blob([new Uint8Array(n)], { type: "audio/webm;codecs=opus" });
const wav = (n = 64_000) => new Blob([new Uint8Array(n)], { type: "audio/wav" });

describe("common", () => {
  it("형식 → 확장자, 언어 코드 정리, 키워드 자르기", () => {
    expect(audioExt("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExt("audio/mp4")).toBe("mp4");
    expect(audioExt("audio/wav")).toBe("wav");
    expect(normLang("kor")).toBe("ko");
    expect(normLang("ko-KR")).toBe("ko");
    expect(normLang("English")).toBe("en");
    expect(normLang("")).toBeUndefined();
    expect(pickKeywords(["비빔밥", " 비빔밥 ", "", "인제라", "하차푸리"], 2)).toEqual(["비빔밥", "인제라"]);
  });
});

describe("ElevenLabs Scribe 어댑터", () => {
  it("multipart: model_id·file·language_code(ko)·keyterms 반복, xi-api-key 헤더", async () => {
    const { f, calls } = fakeFetch({ text: " 돼지국밥 억수로 맛있네 ", language_code: "kor", language_probability: 0.97, audio_duration_secs: 3.2 });
    const r = await elevenlabsSTT({ apiKey: "el-test", fetch: f }).transcribe(webm(), { lang: "ko", keywords: ["돼지국밥", "밀면"] });
    expect(calls[0].url).toBe(ELEVENLABS_STT_URL);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["xi-api-key"]).toBe("el-test");
    const form = calls[0].init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("language_code")).toBe("ko");
    expect(form.getAll("keyterms")).toEqual(["돼지국밥", "밀면"]);
    expect(form.get("tag_audio_events")).toBe("false");
    expect((form.get("file") as File).name).toBe("speech.webm");
    expect(r.text).toBe("돼지국밥 억수로 맛있네");
    expect(r.language).toBe("ko");
    expect(r.usage).toMatchObject({ provider: "elevenlabs", unitType: "seconds", units: 4 });
    expect(r.usage.costUsd).toBeCloseTo((4 / 3600) * 0.27, 8);
  });

  it("auto 면 language_code 를 보내지 않는다 (자동 감지) — 감지된 언어를 돌려준다", async () => {
    const { f, calls } = fakeFetch({ text: "Is pho spicy?", language_code: "en" });
    const r = await elevenlabsSTT({ apiKey: "k", fetch: f }).transcribe(webm(), { lang: "auto" });
    expect((calls[0].init.body as FormData).has("language_code")).toBe(false);
    expect((calls[0].init.body as FormData).has("keyterms")).toBe(false);
    expect(r.language).toBe("en");
    expect(r.usage.costUsd).toBeCloseTo((2 / 3600) * 0.22, 8); // 8KB ≈ 2초 추정, keyterms 없음
  });

  it("HTTP 오류 → ProviderError (429 는 retryable, 401 은 아님)", async () => {
    await expect(elevenlabsSTT({ apiKey: "k", fetch: fakeFetch({ detail: "rate" }, 429).f }).transcribe(webm(), { lang: "ko" })).rejects.toMatchObject({ provider: "elevenlabs", retryable: true });
    await expect(elevenlabsSTT({ apiKey: "k", fetch: fakeFetch({ detail: "bad key" }, 401).f }).transcribe(webm(), { lang: "ko" })).rejects.toMatchObject({ retryable: false });
  });

  it("fetch 타임아웃도 ProviderError", async () => {
    const f = async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    };
    await expect(elevenlabsSTT({ apiKey: "k", fetch: f }).transcribe(webm(), { lang: "ko" })).rejects.toThrow(/timeout/);
  });
});

describe("CLOVA Speech 단문 어댑터", () => {
  it("raw 오디오 + X-CLOVASPEECH-API-KEY, lang=Kor, boostings 는 탭으로", async () => {
    const { f, calls } = fakeFetch({ text: "홍어 겁나게 맛있당께", quota: 1 });
    const r = await clovaSTT({ secret: "clova-test", fetch: f }).transcribe(wav(), { lang: "ko", keywords: ["홍어삼합", "Pho", "떡", "돼지국밥"] });
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(CLOVA_STT_URL);
    expect(url.searchParams.get("lang")).toBe("Kor");
    expect(url.searchParams.get("boostings")).toBe("홍어삼합\t돼지국밥"); // 영문·2자 이하는 빠진다
    const h = calls[0].init.headers as Record<string, string>;
    expect(h["X-CLOVASPEECH-API-KEY"]).toBe("clova-test");
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(calls[0].init.body).toBeInstanceOf(Blob);
    expect(r).toMatchObject({ text: "홍어 겁나게 맛있당께", language: "ko", usage: { provider: "clova", units: 15 } });
    expect(r.usage.costUsd).toBeCloseTo(4 / 1400, 8);
  });

  it("boostings 는 512자 이하로 자른다", () => {
    const many = Array.from({ length: 200 }, (_, i) => `가나다라${String.fromCharCode(0xac00 + i)}`);
    const b = clovaBoostings(many);
    expect(b.length).toBeLessThanOrEqual(512);
    expect(b.split("\t").length).toBeGreaterThan(50);
  });

  it("webm 이나 자동 감지는 부르지 않고 바로 실패 → 다음 엔진", async () => {
    const { f, calls } = fakeFetch({ text: "x" });
    await expect(clovaSTT({ secret: "s", fetch: f }).transcribe(webm(), { lang: "ko" })).rejects.toBeInstanceOf(ProviderError);
    await expect(clovaSTT({ secret: "s", fetch: f }).transcribe(wav(), { lang: "auto" })).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toHaveLength(0);
  });
});

describe("Gemini 어댑터", () => {
  const reply = (obj: unknown, usage = { promptTokenCount: 400, candidatesTokenCount: 60 }) => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }],
    usageMetadata: usage,
  });

  it("inline_data(base64) + JSON 스키마 + thinkingBudget 0, x-goog-api-key 헤더", async () => {
    const { f, calls } = fakeFetch(reply({ text: "이기 뭐꼬?", language: "ko", standard_ko: "이게 뭐야?" }));
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mp4" });
    const r = await geminiSTT({ apiKey: "g-test", fetch: f }).transcribe(audio, { lang: "ko", keywords: ["돼지국밥"] });
    expect(calls[0].url).toBe(`${GEMINI_BASE}/gemini-2.5-flash:generateContent`);
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-test");
    const body = JSON.parse(String(calls[0].init.body));
    const [media, prompt] = body.contents[0].parts;
    expect(media.inline_data).toEqual({ mime_type: "audio/m4a", data: Buffer.from([1, 2, 3]).toString("base64") }); // Safari mp4 → m4a
    expect(prompt.text).toContain("사투리");
    expect(prompt.text).toContain("돼지국밥");
    expect(body.generationConfig).toMatchObject({ temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } });
    expect(body.generationConfig.responseSchema.required).toEqual(["text", "language", "standard_ko"]);
    expect(r).toMatchObject({ text: "이기 뭐꼬?", language: "ko", standardKo: "이게 뭐야?", usage: { provider: "gemini", unitType: "tokens", units: 460 } });
    expect(r.usage.costUsd).toBeCloseTo((400 * 1 + 60 * 2.5) / 1e6, 10);
  });

  it("3.x 모델에는 thinkingBudget 을 보내지 않는다", async () => {
    const { f, calls } = fakeFetch(reply({ text: "a", language: "en", standard_ko: "가" }));
    await geminiSTT({ apiKey: "k", model: "gemini-3.5-flash-lite", fetch: f }).transcribe(webm(), { lang: "auto" });
    expect(JSON.parse(String(calls[0].init.body)).generationConfig.thinkingConfig).toBeUndefined();
  });

  it("JSON 이 아니면 ProviderError, 지나치게 긴 standard_ko 는 버린다", async () => {
    await expect(geminiSTT({ apiKey: "k", fetch: fakeFetch({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }).f }).transcribe(webm(), { lang: "ko" })).rejects.toBeInstanceOf(ProviderError);
    const r = await geminiSTT({ apiKey: "k", fetch: fakeFetch(reply({ text: "뭐꼬", language: "ko", standard_ko: "가".repeat(100) })).f }).transcribe(webm(), { lang: "ko" });
    expect(r.standardKo).toBeUndefined();
  });
});

describe("OpenAI 어댑터 (가짜 클라이언트)", () => {
  const fake = (res: unknown) => {
    const calls: { params: Record<string, unknown>; opts: unknown }[] = [];
    const c = () => ({ audio: { transcriptions: { create: async (params: Record<string, unknown>, opts: unknown) => (calls.push({ params, opts }), res) } } }) as unknown as OpenAI;
    return { c, calls };
  };

  it("gpt-transcribe: languages[] + keywords, 감지 언어는 languages[0].code", async () => {
    const { c, calls } = fake({ text: " 하차푸리 뭐예요 ", languages: [{ code: "ko" }], usage: { type: "duration", seconds: 2.4 } });
    const signal = AbortSignal.timeout(5_000);
    const r = await openaiSTT(c, "gpt-transcribe").transcribe(wav(), { lang: "ko", keywords: ["하차푸리"], signal });
    expect(calls[0].params).toMatchObject({ model: "gpt-transcribe", languages: ["ko"], keywords: ["하차푸리"] });
    expect(calls[0].params.language).toBeUndefined(); // 둘 다 보내지 말 것
    expect((calls[0].params.file as File).name).toBe("speech.wav");
    expect(calls[0].opts).toEqual({ signal });
    expect(r).toMatchObject({ text: "하차푸리 뭐예요", language: "ko", usage: { units: 3 } });
  });

  it("auto 면 언어를 보내지 않고, 예전 모델은 language 한 개 + keywords 없음", async () => {
    const a = fake({ text: "hello" });
    await openaiSTT(a.c, "gpt-transcribe").transcribe(webm(), { lang: "auto" });
    expect(a.calls[0].params.languages).toBeUndefined();
    const b = fake({ text: "안녕" });
    await openaiSTT(b.c, "gpt-4o-mini-transcribe").transcribe(webm(), { lang: "ko", keywords: ["비빔밥"] });
    expect(b.calls[0].params).toMatchObject({ language: "ko" });
    expect(b.calls[0].params.keywords).toBeUndefined();
  });
});

// ── 체인

const ok = (id: string, text: string, extra: Partial<STTResult> = {}): STTProvider => ({
  transcribe: async () => ({ text, usage: { provider: id, operation: "stt", units: 1, unitType: "seconds", costUsd: 0.0001 }, ...extra }),
});
const fail = (id: string, retryable = true): STTProvider => ({
  transcribe: async () => {
    throw new ProviderError(id, "down", retryable);
  },
});

describe("transcribeWithChain", () => {
  it("1순위가 실패하면 다음 엔진, 실패 목록을 알려 준다", async () => {
    const failed: string[] = [];
    const r = await transcribeWithChain(
      [
        { id: "elevenlabs", provider: fail("elevenlabs") },
        { id: "clova", provider: fail("clova", false) },
        { id: "openai", provider: ok("openai", " 비빔밥 ") },
      ],
      webm(),
      { lang: "ko", onFail: (id) => failed.push(id) },
    );
    expect(r).toMatchObject({ provider: "openai", tried: ["elevenlabs", "clova", "openai"], result: { text: "비빔밥" } });
    expect(failed).toEqual(["elevenlabs", "clova"]);
  });

  it("빈 텍스트(묵음)는 결과로 본다 — 다음 엔진을 부르지 않는다", async () => {
    let called = false;
    const r = await transcribeWithChain(
      [
        { id: "a", provider: ok("a", "") },
        { id: "b", provider: { transcribe: async () => ((called = true), { text: "x", usage: { provider: "b", operation: "stt", units: 1, unitType: "seconds", costUsd: 0 } }) } },
      ],
      webm(),
      { lang: "ko" },
    );
    expect(r.result.text).toBe("");
    expect(called).toBe(false);
  });

  it("모두 실패하면 마지막 오류, 빈 체인이면 '준비된 엔진 없음'", async () => {
    await expect(transcribeWithChain([{ id: "a", provider: fail("a") }, { id: "b", provider: fail("b") }], webm(), { lang: "ko" })).rejects.toMatchObject({ provider: "b" });
    await expect(transcribeWithChain([], webm(), { lang: "ko" })).rejects.toThrow(/준비된/);
  });

  it("엔진마다 시간 상한 signal 을 넘기고, 전체 예산이 바닥나면 다음 엔진을 시작하지 않는다", async () => {
    let t = 0;
    const seen: (AbortSignal | undefined)[] = [];
    const slowFail: STTProvider = {
      transcribe: async (_a, o) => {
        seen.push(o.signal);
        t += 14_000; // 14초 걸리고 실패
        throw new ProviderError("slow", "timeout", true);
      },
    };
    await expect(
      transcribeWithChain(
        [
          { id: "slow", provider: slowFail },
          { id: "never", provider: ok("never", "x") },
        ],
        webm(),
        { lang: "ko", now: () => t },
      ),
    ).rejects.toMatchObject({ provider: "slow" });
    expect(seen[0]).toBeInstanceOf(AbortSignal);
  });

  it("preferFirst: 고른 엔진을 맨 앞으로, 없으면 그대로", () => {
    const c = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(preferFirst(c, "c").map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(preferFirst(c, "zz").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(preferFirst(c, null).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("registry: 체인 조립 · 사용자가 고른 엔진", () => {
  const engine = (ready: boolean, langs: STTLang[], text: string) => ({ label_ko: text, desc_ko: "", langs, ready: () => ready, make: () => ok(text, text) });
  const engines = {
    elevenlabs: engine(true, ["ko", "auto"], "el"),
    clova: engine(true, ["ko"], "clova"),
    gemini: engine(false, ["ko", "auto"], "gemini"),
    openai: engine(true, ["ko", "auto"], "openai"),
  };

  it("parseChain: 모르는 id·중복은 빼고, 비면 기본값", () => {
    expect(parseChain("clova, ElevenLabs ,rtzr,clova", ["openai"])).toEqual(["clova", "elevenlabs"]);
    expect(parseChain("", ["openai"])).toEqual(["openai"]);
    expect(parseChain(undefined, ["openai"])).toEqual(["openai"]);
  });

  it("키 없는 엔진·언어 미지원 엔진은 빠진다", () => {
    expect(resolveChain("ko", null, engines, ["elevenlabs", "clova", "gemini", "openai"]).map((c) => c.id)).toEqual(["elevenlabs", "clova", "openai"]);
    expect(resolveChain("auto", null, engines, ["elevenlabs", "clova", "gemini", "openai"]).map((c) => c.id)).toEqual(["elevenlabs", "openai"]);
  });

  it("고른 엔진이 맨 앞 — 체인에 없던 엔진이어도 (준비됨 + 언어 지원이면)", () => {
    expect(resolveChain("ko", "openai", engines, ["elevenlabs", "clova"]).map((c) => c.id)).toEqual(["openai", "elevenlabs", "clova"]);
    expect(resolveChain("ko", "clova", engines, ["elevenlabs", "clova", "openai"]).map((c) => c.id)).toEqual(["clova", "elevenlabs", "openai"]);
  });

  it("고른 엔진이 키 없음·언어 미지원·모르는 id 면 무시하고 기본 순서", () => {
    const order = ["elevenlabs", "clova", "gemini", "openai"];
    expect(resolveChain("ko", "gemini", engines, order).map((c) => c.id)).toEqual(["elevenlabs", "clova", "openai"]);
    expect(resolveChain("auto", "clova", engines, order).map((c) => c.id)).toEqual(["elevenlabs", "openai"]);
    expect(resolveChain("ko", "../etc", engines, order).map((c) => c.id)).toEqual(["elevenlabs", "clova", "openai"]);
  });

  it("고른 엔진이 실패하면 기본 체인으로 이어진다", async () => {
    const withBroken = { ...engines, clova: { ...engines.clova, make: () => fail("clova") } };
    const chain = resolveChain("ko", "clova", withBroken, ["elevenlabs", "clova", "openai"]);
    const r = await transcribeWithChain(chain, wav(), { lang: "ko" });
    expect(r.tried).toEqual(["clova", "elevenlabs"]);
    expect(r.provider).toBe("elevenlabs");
  });
});

// ── 서비스 (체인 + 표준어)

describe("recognizeSpeech", () => {
  const llm = (standard: string, calls: string[] = []): LLMProvider => ({
    structured: async (req) => {
      calls.push(req.user);
      return { data: { standard_ko: standard, language: "ko", is_dialect: true } as never, usage: { provider: "anthropic", operation: req.operation, units: 80, unitType: "tokens", costUsd: 0.0002 } };
    },
  });

  it("표준어 문장은 LLM 을 부르지 않고 그대로", async () => {
    const calls: string[] = [];
    const { reply, usages } = await recognizeSpeech({ chain: [{ id: "el", provider: ok("el", "비빔밥 추천해줘", { language: "ko" }) }], llm: llm("x", calls) }, { audio: webm(), mode: "ko" });
    expect(reply).toEqual({ text: "비빔밥 추천해줘", language: "ko", provider: "el" });
    expect(calls).toEqual([]);
    expect(usages).toHaveLength(1);
  });

  it("사투리 표지가 있으면 LLM 으로 standard_ko 를 만들고 비용도 남긴다", async () => {
    const { reply, usages } = await recognizeSpeech({ chain: [{ id: "clova", provider: ok("clova", "이기 뭐꼬", { language: "ko" }) }], llm: llm("이게 뭐야?") }, { audio: wav(), mode: "ko" });
    expect(reply).toEqual({ text: "이기 뭐꼬", standard_ko: "이게 뭐야?", language: "ko", provider: "clova" });
    expect(usages.map((u) => u.operation)).toEqual(["stt", "stt_normalize"]);
  });

  it("외국어(감지 언어 en) → 표준어로 옮기고 language 는 en 그대로", async () => {
    const { reply } = await recognizeSpeech({ chain: [{ id: "el", provider: ok("el", "Is pho spicy?", { language: "en" }) }], llm: llm("포는 매워?") }, { audio: webm(), mode: "auto" });
    expect(reply).toMatchObject({ text: "Is pho spicy?", standard_ko: "포는 매워?", language: "en" });
  });

  it("제공자가 준 표준어가 있으면 LLM 을 다시 부르지 않는다 (Gemini)", async () => {
    const calls: string[] = [];
    const { reply } = await recognizeSpeech({ chain: [{ id: "gemini", provider: ok("gemini", "혼저 옵서예", { language: "ko", standardKo: "어서 오세요" }) }], llm: llm("x", calls) }, { audio: webm(), mode: "ko" });
    expect(reply.standard_ko).toBe("어서 오세요");
    expect(calls).toEqual([]);
  });

  it("LLM 이 없으면(미리보기·STT_NORMALIZE=false) 들은 말 그대로", async () => {
    const { reply } = await recognizeSpeech({ chain: [{ id: "el", provider: ok("el", "이기 뭐꼬") }], llm: null }, { audio: webm(), mode: "ko" });
    expect(reply).toEqual({ text: "이기 뭐꼬", language: "ko", provider: "el" });
  });

  it("auto 인데 언어를 모르면 und", async () => {
    const { reply } = await recognizeSpeech({ chain: [{ id: "x", provider: ok("x", "") }], llm: null }, { audio: webm(), mode: "auto" });
    expect(reply).toEqual({ text: "", language: "und", provider: "x" });
  });
});

describe("checkSttUpload (route 입력 검사)", () => {
  const form = (entries: [string, string | Blob][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };

  it("audio 없음·빈 파일 → 400, 너무 크면 413, 형식 이상 → 415", () => {
    expect(checkSttUpload(null)).toMatchObject({ ok: false, status: 400, code: "no_audio" });
    expect(checkSttUpload(form([["audio", "text"]]))).toMatchObject({ ok: false, status: 400 });
    expect(checkSttUpload(form([["audio", new Blob([])]]))).toMatchObject({ ok: false, status: 400 });
    expect(checkSttUpload(form([["audio", new Blob([new Uint8Array(STT_MAX_BYTES + 1)], { type: "audio/webm" })]]))).toMatchObject({ ok: false, status: 413 });
    expect(checkSttUpload(form([["audio", new Blob([new Uint8Array(10)], { type: "image/png" })]]))).toMatchObject({ ok: false, status: 415 });
  });

  it("mode 는 ko|auto (기본 ko), 이상하면 400", () => {
    expect(checkSttUpload(form([["audio", webm()]]))).toMatchObject({ ok: true, value: { mode: "ko", engine: null } });
    expect(checkSttUpload(form([["audio", webm()], ["mode", "auto"]]))).toMatchObject({ ok: true, value: { mode: "auto" } });
    expect(checkSttUpload(form([["audio", webm()], ["mode", "jp"]]))).toMatchObject({ ok: false, status: 400, code: "invalid_mode" });
  });

  it("engine 은 형식만 보고 받는다 (허용 목록은 registry), 이상한 값은 null", () => {
    expect(checkSttUpload(form([["audio", wav()], ["engine", "clova"]]))).toMatchObject({ ok: true, value: { engine: "clova" } });
    expect(checkSttUpload(form([["audio", wav()], ["engine", "../../x"]]))).toMatchObject({ ok: true, value: { engine: null } });
  });

  it("codecs 붙은 형식 OK, 형식이 비어 오면 webm 으로 붙여 준다", () => {
    const r = checkSttUpload(form([["audio", new Blob([new Uint8Array(10)])]]));
    expect(r.ok && r.value.audio.type).toBe("audio/webm");
    expect(checkSttUpload(form([["audio", new Blob([new Uint8Array(10)], { type: "audio/mp4" })]])).ok).toBe(true);
  });
});
