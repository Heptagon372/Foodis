// /api/foodi/stt 의 본체 (route 는 속도 제한·의존성 조립만): 업로드 검사 → STT 체인 → 필요하면 표준어로 옮기기.
// 녹음은 메모리에서만 쓰고 저장·로그하지 않는다 (10 문서 §7). 순수 로직이라 가짜 제공자로 테스트한다 (stt.test.ts).
import type { LLMProvider, STTLang, Usage } from "../types";
import { transcribeWithChain, type ChainLink } from "./chain";
import { needsNormalization, normalizeToStandardKo, sameSentence } from "./normalize";

/** 질문 하나 ≈ 수십 KB (opus). 12초 WAV(16kHz) 도 400KB 남짓 → 2MB 넘으면 거절 */
export const STT_MAX_BYTES = 2 * 1024 * 1024;

// 브라우저 MediaRecorder(webm/ogg/mp4) + 측정 스크립트(mp3/wav). type 이 비어 오면 webm 으로 본다 (예전 클라이언트)
const ALLOWED = ["audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/flac", "video/webm", "video/mp4"];

export type SttUpload = { audio: Blob; mode: STTLang; engine: string | null };
export type UploadCheck = { ok: true; value: SttUpload } | { ok: false; status: number; code: string; message: string };

export function checkSttUpload(form: FormData | null): UploadCheck {
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return { ok: false, status: 400, code: "no_audio", message: "multipart 필드 'audio' 가 필요합니다." };
  if (audio.size > STT_MAX_BYTES) return { ok: false, status: 413, code: "audio_too_large", message: "녹음이 너무 길어요. 짧게 다시 말해 주세요." };
  const type = audio.type.split(";")[0].trim().toLowerCase();
  if (type && !ALLOWED.includes(type)) return { ok: false, status: 415, code: "unsupported_audio", message: "지원하지 않는 녹음 형식이에요." };
  const mode = String(form?.get("mode") ?? "ko");
  if (mode !== "ko" && mode !== "auto") return { ok: false, status: 400, code: "invalid_mode", message: "mode 는 ko 또는 auto 여야 해요." };
  // 엔진 id 는 형식만 본다 — 실제 허용 목록·준비 여부는 registry 가 확인한다
  const raw = form?.get("engine");
  const engine = typeof raw === "string" && /^[a-z0-9_-]{1,24}$/.test(raw) ? raw : null;
  // 형식이 비어 있으면 webm 으로 붙여 준다: 일부 API 가 형식 없는 파일을 거절한다
  return { ok: true, value: { audio: type ? audio : new Blob([audio], { type: "audio/webm" }), mode, engine } };
}

export type SttReply = { text: string; standard_ko?: string; language: string; provider: string };

/**
 * 체인으로 받아 적고, 사투리 표지·외국어면 LLM(빠른 등급)으로 표준어 문장을 만든다.
 * 제공자가 직접 표준어를 준 경우(Gemini)는 LLM 을 다시 부르지 않는다. 표준어 만들기는 실패해도 인식 결과는 돌려준다.
 */
export async function recognizeSpeech(
  deps: { chain: ChainLink[]; llm: LLMProvider | null; keywords?: string[]; onFail?(id: string, e: unknown): void },
  input: { audio: Blob; mode: STTLang },
): Promise<{ reply: SttReply; usages: Usage[] }> {
  const { result, provider } = await transcribeWithChain(deps.chain, input.audio, { lang: input.mode, keywords: deps.keywords, onFail: deps.onFail });
  const usages: Usage[] = [result.usage];
  const text = result.text;
  let standard = result.standardKo?.trim() || undefined;
  let language = result.language ?? (input.mode === "ko" ? "ko" : undefined);
  if (deps.llm && needsNormalization({ text, language, standardKo: standard })) {
    const n = await normalizeToStandardKo(deps.llm, text, { language });
    if (n.usage) usages.push(n.usage);
    standard = n.standardKo;
    language = language ?? n.language;
  }
  const reply: SttReply = { text, language: language ?? "und", provider };
  if (standard && !sameSentence(standard, text)) reply.standard_ko = standard;
  return { reply, usages };
}
