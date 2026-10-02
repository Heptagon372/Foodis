// STT 어댑터 공통 도우미 (10 문서 §4). SDK 없이 fetch 로 부르는 제공자들이 같은 규칙을 쓰게 한다.
import { ProviderError } from "../types";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** 브라우저 녹음 형식 → 확장자. 여러 API 가 파일 이름 확장자로 형식을 본다 (Safari = mp4, Chrome·Firefox = webm/ogg) */
export function audioExt(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return "mp4";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("wav") || t.includes("wave")) return "wav";
  if (t.includes("flac")) return "flac";
  return "webm";
}

/** MIME 에서 codecs 같은 매개변수를 뗀다 ("audio/webm;codecs=opus" → "audio/webm"). 비어 있으면 webm 으로 본다 */
export const baseMime = (type: string) => type.split(";")[0].trim().toLowerCase() || "audio/webm";

/**
 * 응답에 길이가 없을 때 바이트로 추정한 초 (비용 추적용 근사치).
 * webm/opus·mp4/aac 녹음 ≈ 4KB/초, 16kHz 16bit WAV ≈ 32KB/초.
 */
export function estimateSeconds(audio: Blob): number {
  const perSec = audio.type.includes("wav") ? 32_000 : 4_000;
  return Math.max(1, Math.round(audio.size / perSec));
}

/** HTTP 실패 → ProviderError. 429·5xx·네트워크는 retryable (다음 제공자로) — 본문은 짧게만 남긴다 (키·음성 내용이 로그에 길게 남지 않게) */
export async function ensureOk(provider: string, res: Response): Promise<Response> {
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  throw new ProviderError(provider, `HTTP ${res.status} ${body.replace(/\s+/g, " ").slice(0, 160)}`, res.status === 429 || res.status >= 500);
}

/** fetch 자체 실패(타임아웃·연결 끊김)도 ProviderError 로 감싼다 */
export async function call(provider: string, f: FetchLike, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await f(url, init);
  } catch (e) {
    const name = (e as Error)?.name;
    throw new ProviderError(provider, name === "TimeoutError" || name === "AbortError" ? "timeout" : `network: ${(e as Error)?.message ?? e}`, true);
  }
  return ensureOk(provider, res);
}

// 제공자마다 언어 코드가 다르다 (ko · ko-KR · kor · korean). 앱 안에서는 ISO 639-1 두 글자로 맞춘다
const ISO3: Record<string, string> = {
  kor: "ko", eng: "en", jpn: "ja", zho: "zh", cmn: "zh", yue: "zh", spa: "es", fra: "fr", deu: "de", ita: "it", por: "pt", rus: "ru",
  vie: "vi", tha: "th", ind: "id", msa: "ms", fil: "tl", tgl: "tl", hin: "hi", ara: "ar", tur: "tr", mon: "mn", uzb: "uz", nld: "nl", pol: "pl",
};
const NAMES: Record<string, string> = { korean: "ko", english: "en", japanese: "ja", chinese: "zh", spanish: "es", french: "fr", german: "de", vietnamese: "vi", thai: "th" };

export function normLang(code?: string | null): string | undefined {
  if (!code) return undefined;
  const c = code.trim().toLowerCase().replace("_", "-");
  if (!c) return undefined;
  if (NAMES[c]) return NAMES[c];
  const head = c.split("-")[0];
  if (head.length === 2) return head;
  return ISO3[head] ?? head;
}

/** 키워드 힌트는 제공자마다 개수·길이 제한이 다르다 → 중복 없이 앞에서부터 자른다 */
export function pickKeywords(keywords: string[] | undefined, max: number, maxLen = 50): string[] {
  const out: string[] = [];
  for (const k of keywords ?? []) {
    const w = k.trim();
    if (!w || w.length > maxLen || out.includes(w)) continue;
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}
