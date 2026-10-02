"use client";
// Voice 모듈 (11 문서 §4·§6).
// 듣기: Web Speech API(무료·저지연) → 미지원/실패 시 녹음 후 /api/foodi/stt (GPT Transcribe + 음식명 힌트)
// 말하기: /api/foodi/tts 스트림을 받는 대로 재생 → 실패 시 브라우저 speechSynthesis. 자막은 항상 화면에 있다.
import { attachResponse } from "./stream-audio";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const Recognition = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
};

export const canWebSpeech = () => Boolean(Recognition());
export const canRecord = () => typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

export type ListenHandle = { stop(): void; cancel(): void };

/** 중간 결과는 onInterim, 확정은 onFinal. 묵음이 이어지면 브라우저가 알아서 종료한다. */
export function listen(h: { onInterim(t: string): void; onFinal(t: string): void; onError(reason: string): void }): ListenHandle {
  const R = Recognition();
  if (R) {
    const rec = new R();
    rec.lang = "ko-KR";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    let done = false;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      h.onInterim((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      done = true;
      h.onError(e.error === "not-allowed" ? "mic_denied" : e.error === "no-speech" ? "no_speech" : "recognition_failed");
    };
    rec.onend = () => {
      if (done) return;
      done = true;
      if (finalText.trim()) h.onFinal(finalText.trim());
      else h.onError("no_speech");
    };
    rec.start();
    return { stop: () => rec.stop(), cancel: () => ((done = true), rec.abort()) };
  }
  return recordAndTranscribe(h);
}

/** Web Speech 미지원 브라우저(Firefox, 일부 인앱 브라우저): 녹음 → 서버 전사 */
function recordAndTranscribe(h: { onInterim(t: string): void; onFinal(t: string): void; onError(reason: string): void }): ListenHandle {
  let recorder: MediaRecorder | null = null;
  let cancelled = false;
  const chunks: Blob[] = [];
  const timer = setTimeout(() => recorder?.state === "recording" && recorder.stop(), 8_000);
  if (!canRecord()) {
    queueMicrotask(() => h.onError("unsupported"));
    return { stop() {}, cancel() {} };
  }
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        clearTimeout(timer);
        stream.getTracks().forEach((t) => t.stop());
        if (cancelled) return;
        h.onInterim("듣고 있어요…");
        const form = new FormData();
        form.append("audio", new Blob(chunks, { type: recorder?.mimeType || "audio/webm" }), "speech.webm");
        const res = await fetch("/api/foodi/stt", { method: "POST", body: form }).catch(() => null);
        const data = res?.ok ? ((await res.json()) as { text: string }) : null;
        if (data?.text) h.onFinal(data.text);
        else h.onError("recognition_failed");
      };
      recorder.start();
    })
    .catch(() => h.onError("mic_denied"));
  return {
    stop: () => recorder?.state === "recording" && recorder.stop(),
    cancel: () => ((cancelled = true), recorder?.state === "recording" && recorder.stop()),
  };
}

let current: HTMLAudioElement | null = null;
let releaseCurrent: (() => void) | null = null;
let pending: AbortController | null = null;
let seq = 0; // stopSpeaking·새 speak 마다 증가 — 받는 사이 끊긴 이전 speak 가 뒤늦게 소리 내지 않게
let ownUtterance: SpeechSynthesisUtterance | null = null;

/** 푸디가 말하기 시작할 때 다른 소리(라디오)를 멈추게 하는 훅 — lib/client/radio.ts 가 등록한다 */
export const beforeSpeak = new Set<() => void>();

/** 푸디 자신이 낸 소리만 멈춘다. 브라우저 음성은 전역이라, 내가 시작한 게 아니면(라디오) 건드리지 않는다 */
export function stopSpeaking() {
  seq++;
  pending?.abort();
  pending = null;
  current?.pause();
  current = null;
  releaseCurrent?.();
  releaseCurrent = null;
  if (ownUtterance && typeof window !== "undefined") window.speechSynthesis?.cancel();
  ownUtterance = null;
}

/**
 * 서버 TTS 를 먼저 시도하고, 실패하면 브라우저 음성으로. onEnd 는 어느 경로든 한 번 호출된다 (stopSpeaking 으로 멈춘 경우 제외).
 * 서버 음성은 받는 대로 재생하고(stream-audio.ts), 돌아오는 시점 = 첫 소리가 난 때 → 호출 측이 first_audio_ms 로 잰다.
 */
export async function speak(text: string, onEnd: () => void, prefetched?: Blob | null): Promise<"cached" | "server" | "browser" | "none"> {
  stopSpeaking();
  beforeSpeak.forEach((f) => f());
  const my = seq;
  const audio = new Audio();
  let release = () => {};
  let started = false;
  try {
    let first: Promise<unknown> = Promise.resolve();
    if (prefetched) {
      // 데모 팩에 미리 만들어 둔 음성이 있으면 네트워크 없이 바로
      const url = URL.createObjectURL(prefetched);
      audio.src = url;
      release = () => URL.revokeObjectURL(url);
    } else {
      const ctrl = (pending = new AbortController());
      const res = await fetch("/api/foodi/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      const att = await attachResponse(res, audio);
      release = att.release;
      first = att.firstAudio;
    }
    if (my !== seq) {
      release();
      return "none";
    }
    pending = null;
    current = audio;
    releaseCurrent = release;
    const finish = () => {
      audio.onended = audio.onerror = null;
      release();
      if (current === audio) {
        current = null;
        releaseCurrent = null;
      }
      onEnd();
    };
    audio.onended = finish;
    // 첫 소리 전 오류는 아래 catch 가 브라우저 음성으로 받는다 — 여기서도 onEnd 하면 두 번 불린다
    audio.onerror = () => started && finish();
    await Promise.all([audio.play(), first]);
    started = true;
    return prefetched ? "cached" : "server";
  } catch {
    audio.onended = audio.onerror = null;
    audio.pause();
    release();
    if (current === audio) {
      current = null;
      releaseCurrent = null;
    }
    // 멈춤·다음 질문으로 끊긴 거면 대신 말하지 않는다
    if (my !== seq) return "none";
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) {
      onEnd();
      return "none";
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 1.05;
    u.onend = u.onerror = () => {
      if (ownUtterance === u) ownUtterance = null;
      onEnd();
    };
    ownUtterance = u;
    synth.speak(u);
    return "browser";
  }
}
