// TTS 후보 C: ElevenLabs. HTTP 스트리밍 MP3 (POST /v1/text-to-speech/{voice_id}/stream) → 받는 대로 재생된다.
// 문서: elevenlabs.io/docs/api-reference/text-to-speech/stream · /docs/models (확인 2026-10-02)
//  - 모델: eleven_flash_v2_5 (32개 언어, ~75ms, 글자당 절반 가격) / eleven_multilingual_v2 (29개 언어, 고품질). 둘 다 한국어 지원
//  - 예전 기본 음성(Rachel 등)은 2026-03 이후 가입 계정에 없고 2026-12-31 에 사라진다 → voice_id 를 코드에 박지 않는다.
//    카탈로그엔 새 기본 음성 '이름'(Talia, Darian)만 두고, GET /v2/voices?search= 로 이 계정의 voice_id 를 찾아 기억한다.
//    ELEVENLABS_VOICE_IDS="Talia=…,Darian=…" 로 미리 적어 두면 찾는 요청도 없다.
import { env } from "@/lib/env";
import { ttsCostUsd } from "@/lib/voice/pricing";
import { ProviderError, type TTSOptions, type TTSProvider, type Usage } from "./types";

const BASE = "https://api.elevenlabs.io";
const DEFAULT_MODEL = "eleven_flash_v2_5";
const DEFAULT_VOICE = "Talia";
/** 44.1kHz 128kbps MP3 — 문서의 기본값. MediaSource(audio/mpeg)로 받는 대로 재생된다 */
const OUTPUT_FORMAT = "mp3_44100_128";

const looksLikeId = (v: string) => /^[A-Za-z0-9]{20}$/.test(v);

/** "Talia=abc…,Darian=def…" → Map(소문자 이름 → id) */
export function parseVoiceIds(raw: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const pair of (raw ?? "").split(",")) {
    const [k, v] = pair.split("=").map((s) => s?.trim());
    if (k && v) m.set(k.toLowerCase(), v);
  }
  return m;
}

/** 스트리밍 요청 (테스트에서 모양 확인). language_code 는 Flash v2.5 처럼 지원하는 모델일 때만 — 현지 발음을 그 언어로 강제 */
export function elevenRequest(voiceId: string, text: string, opts: TTSOptions | undefined, apiKey: string, stream = true) {
  const model = opts?.model ?? DEFAULT_MODEL;
  const lang = opts?.lang?.split("-")[0];
  const body: Record<string, unknown> = { text, model_id: model };
  if (lang && lang !== "ko" && /flash_v2_5|turbo_v2_5/.test(model)) body.language_code = lang;
  return {
    url: `${BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}${stream ? "/stream" : ""}?output_format=${OUTPUT_FORMAT}`,
    init: {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify(body),
    } satisfies RequestInit,
  };
}

type FetchLike = typeof fetch;

export function elevenlabsTTS(deps: { apiKey?: string; voiceIds?: string; fetch?: FetchLike } = {}): TTSProvider {
  const apiKey = deps.apiKey ?? env.elevenlabsApiKey ?? "";
  const doFetch: FetchLike = deps.fetch ?? fetch;
  const known = parseVoiceIds(deps.voiceIds ?? env.elevenlabsVoiceIds);
  const lookups = new Map<string, Promise<string>>();

  const fail = (status: number, what: string) =>
    // 401 키 · 404 없는 음성 · 422 잘못된 요청 → 다시 해도 같다. 429·5xx 는 다음 기회에
    new ProviderError("elevenlabs", `${what} HTTP ${status}`, status === 429 || status >= 500);

  /** 이름 → 이 계정의 voice_id. 한 번 찾으면 인스턴스가 살아 있는 동안 기억한다 */
  const resolve = (voice: string): Promise<string> => {
    if (looksLikeId(voice)) return Promise.resolve(voice);
    const key = voice.toLowerCase();
    const pinned = known.get(key);
    if (pinned) return Promise.resolve(pinned);
    let p = lookups.get(key);
    if (!p) {
      p = (async () => {
        const res = await doFetch(`${BASE}/v2/voices?search=${encodeURIComponent(voice)}&page_size=20`, { headers: { "xi-api-key": apiKey }, signal: AbortSignal.timeout(5_000) });
        if (!res.ok) throw fail(res.status, "voices");
        const data = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
        // 새 기본 음성 이름은 "Talia - Warm Soft Guide" 꼴 → 정확히 같은 이름 > "이름 - 설명" > "이름 …" 순으로
        const name = (v: { name: string }) => v.name.trim().toLowerCase();
        const list = data.voices ?? [];
        const hit =
          list.find((v) => name(v) === key) ??
          list.find((v) => name(v).startsWith(key) && /^\s*[-–—]/.test(name(v).slice(key.length))) ??
          list.find((v) => name(v).startsWith(`${key} `));
        if (!hit) throw new ProviderError("elevenlabs", `음성 '${voice}' 없음 — ELEVENLABS_VOICE_IDS 로 지정하세요`, false);
        return hit.voice_id;
      })();
      lookups.set(key, p);
      p.catch(() => lookups.delete(key)); // 실패는 기억하지 않는다 (일시 오류일 수 있음)
    }
    return p;
  };

  const usage = (text: string, opts?: TTSOptions): Usage => ({
    provider: "elevenlabs",
    operation: "tts",
    units: text.length,
    unitType: "chars",
    costUsd: ttsCostUsd("elevenlabs", opts?.model ?? DEFAULT_MODEL, text.length),
  });

  const open = async (text: string, opts: TTSOptions | undefined, stream: boolean) => {
    const voiceId = await resolve(opts?.voice ?? DEFAULT_VOICE);
    const { url, init } = elevenRequest(voiceId, text, opts, apiKey, stream);
    // 제한 시간은 '응답 헤더까지'만 — 긴 라디오 구간을 받는 도중에 끊지 않게
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let res: Response;
    try {
      res = await doFetch(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      throw new ProviderError("elevenlabs", (e as Error).message, true);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok || !res.body) throw fail(res.status, "tts");
    return res;
  };

  return {
    async synthesize(text, opts) {
      const res = await open(text, opts, false);
      const bytes = await res.arrayBuffer().catch((e: Error) => {
        throw new ProviderError("elevenlabs", `본문 수신 실패: ${e.message}`, true);
      });
      return { audio: new Blob([bytes]).stream(), contentType: "audio/mpeg", usage: usage(text, opts) };
    },
    async stream(text, opts) {
      const res = await open(text, opts, true);
      return { stream: res.body as ReadableStream<Uint8Array>, contentType: "audio/mpeg", usage: usage(text, opts) };
    },
  };
}
