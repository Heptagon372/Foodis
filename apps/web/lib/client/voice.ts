"use client";
// Voice 모듈 (11 문서 §4·§6).
// 듣기: Web Speech API(무료·저지연) → 미지원이거나 음성 설정이 "정확하게(서버)"면 녹음 후 /api/foodi/stt (사투리·외국어 STT 체인, 10 문서)
// 말하기: /api/foodi/tts 스트림을 받는 대로 재생 → 실패 시 브라우저 speechSynthesis. 자막은 항상 화면에 있다.
import { attachResponse } from "./stream-audio";
import { rms, vadStart, vadStep } from "./vad";
import { pcmToWav } from "./wav";
import { getVoicePrefs, type VoicePrefs } from "./voice-prefs";

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
/** 서버 인식이 덧붙이는 정보: 사투리·외국어였다면 표준 한국어 문장 (질문은 이걸로, 화면엔 들은 말도) */
export type Heard = { standardKo?: string; language?: string; provider?: string };
type ListenHooks = { onInterim(t: string): void; onFinal(t: string, heard?: Heard): void; onError(reason: string): void };

/** 중간 결과는 onInterim, 확정은 onFinal. 묵음이 이어지면 브라우저(또는 녹음 VAD)가 알아서 종료한다. */
export function listen(h: ListenHooks): ListenHandle {
  // 음성 설정(Passport)이 "정확하게(서버)"면 Web Speech 를 건너뛴다 — 녹음을 못 하는 브라우저면 그래도 Web Speech 로
  const prefs = getVoicePrefs();
  const R = prefs.sttMode === "server" && canRecord() ? null : Recognition();
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
  return recordAndTranscribe(h, prefs);
}

type SttResponse = { text: string; standard_ko?: string; language?: string; provider?: string };

/**
 * 녹음 → 서버 STT 체인. Web Speech 미지원 브라우저(Firefox, 일부 인앱) + 음성 설정 "정확하게(서버)".
 * 말이 끝나면 VAD(lib/client/vad.ts)가 알아서 멈춘다 (최대 12초). 말소리가 없었으면 올리지 않는다.
 */
function recordAndTranscribe(h: ListenHooks, prefs: Pick<VoicePrefs, "sttLang" | "sttEngine">): ListenHandle {
  if (!canRecord()) {
    queueMicrotask(() => h.onError("unsupported"));
    return { stop() {}, cancel() {} };
  }
  let recorder: MediaRecorder | null = null;
  let cancelled = false;
  let silent = false;
  let watch: ReturnType<typeof setInterval> | undefined;
  const chunks: Blob[] = [];
  const pcm: Float32Array[] = [];
  // 탭(사용자 동작) 안에서 만들어야 iOS 가 소리 분석을 잠그지 않는다 — getUserMedia 응답 뒤에 만들면 멈춘 채 시작
  const ctx = audioContext();
  const stopRec = () => void (recorder?.state === "recording" && recorder.stop());
  const release = () => {
    clearInterval(watch);
    void ctx?.close().catch(() => {});
  };
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      if (cancelled) return (stream.getTracks().forEach((t) => t.stop()), release());
      const rec = (recorder = new MediaRecorder(stream));
      rec.ondataavailable = (e) => void (e.data.size && chunks.push(e.data));
      rec.onstop = async () => {
        release();
        stream.getTracks().forEach((t) => t.stop());
        if (cancelled) return;
        if (silent) return h.onError("no_speech");
        h.onInterim("알아듣고 있어요…");
        const type = rec.mimeType || "audio/webm";
        const wav = ctx ? pcmToWav(pcm, ctx.sampleRate) : null;
        const form = new FormData();
        if (wav) form.append("audio", wav, "speech.wav");
        else form.append("audio", new Blob(chunks, { type }), `speech.${type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm"}`);
        form.append("mode", prefs.sttLang);
        if (prefs.sttEngine) form.append("engine", prefs.sttEngine);
        const res = await fetch("/api/foodi/stt", { method: "POST", body: form }).catch(() => null);
        const data = res?.ok ? ((await res.json().catch(() => null)) as SttResponse | null) : null;
        if (cancelled) return;
        if (!data) h.onError("recognition_failed");
        else if (!data.text?.trim()) h.onError("no_speech");
        else h.onFinal(data.text.trim(), { standardKo: data.standard_ko, language: data.language, provider: data.provider });
      };
      rec.start();
      h.onInterim("듣고 있어요…");
      watch = watchSilence(ctx, stream, pcm, (action) => {
        silent = action === "no_speech";
        stopRec();
      });
    })
    .catch(() => (release(), h.onError("mic_denied")));
  return { stop: stopRec, cancel: () => ((cancelled = true), stopRec()) };
}

function audioContext(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return AC ? new AC() : null;
  } catch {
    return null;
  }
}

/**
 * 100ms 마다 소리 크기(RMS)를 VAD 에 넣는다. 분석을 못 하면(AudioContext 없음·잠김) 최대 길이 타이머로만 멈춘다.
 * 같은 연결에서 PCM 도 모은다 → WAV 로 올린다 (lib/client/wav.ts: 모든 서버 엔진이 받는 형식)
 */
function watchSilence(ctx: AudioContext | null, stream: MediaStream, pcm: Float32Array[], done: (a: "stop" | "no_speech") => void) {
  let analyser: AnalyserNode | null = null;
  try {
    if (ctx) {
      void ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      try {
        // ScriptProcessor 는 낡았지만 모듈 파일 없이 모든 브라우저(Safari 포함)에서 돈다. 출력은 0 이라 소리가 되울리지 않는다
        const proc = ctx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (e) => void pcm.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        src.connect(proc);
        proc.connect(ctx.destination);
      } catch {
        /* PCM 못 모으면 MediaRecorder 녹음을 올린다 */
      }
    }
  } catch {
    analyser = null;
  }
  const buf = new Float32Array(analyser?.fftSize ?? 0);
  let s = vadStart();
  let last = performance.now();
  const id = setInterval(() => {
    const t = performance.now();
    if (analyser) analyser.getFloatTimeDomainData(buf);
    // 실제 지난 시간으로 센다: 백그라운드 탭에선 타이머가 1초로 늘어난다
    const r = vadStep(s, analyser ? rms(buf) : 0, t - last);
    last = t;
    s = r.s;
    if (r.action !== "continue") {
      clearInterval(id);
      done(r.action);
    }
  }, 100);
  return id;
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
const FIRST_AUDIO_TIMEOUT_MS = 8_000;

export async function speak(text: string, onEnd: () => void, prefetched?: Blob | null): Promise<"cached" | "server" | "browser" | "none"> {
  stopSpeaking();
  beforeSpeak.forEach((f) => f());
  const my = seq;
  const audio = new Audio();
  let release = () => {};
  let started = false;
  // 첫 소리까지 8초 제한 (라디오와 같은 기준): 스트림이 안 열리는 브라우저(일부 iOS)에서 무한 대기 대신 브라우저 음성으로
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      pending?.abort();
      reject(new Error("first_audio_timeout"));
    }, FIRST_AUDIO_TIMEOUT_MS);
  });
  deadline.catch(() => {}); // 경주에 쓰이지 않은 채 끝나도 처리되지 않은 거부로 남지 않게
  try {
    let first: Promise<unknown> = Promise.resolve();
    if (prefetched) {
      // 데모 팩에 미리 만들어 둔 음성이 있으면 네트워크 없이 바로
      const url = URL.createObjectURL(prefetched);
      audio.src = url;
      release = () => URL.revokeObjectURL(url);
    } else {
      const ctrl = (pending = new AbortController());
      const res = await Promise.race([fetch("/api/foodi/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: ctrl.signal }), deadline]);
      if (!res.ok) throw new Error(String(res.status));
      const att = await Promise.race([attachResponse(res, audio), deadline]);
      release = att.release;
      first = att.firstAudio;
    }
    if (my !== seq) {
      clearTimeout(timer);
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
    await Promise.race([Promise.all([audio.play(), first]), deadline]);
    clearTimeout(timer);
    started = true;
    return prefetched ? "cached" : "server";
  } catch {
    clearTimeout(timer);
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
