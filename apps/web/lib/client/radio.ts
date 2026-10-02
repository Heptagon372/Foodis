"use client";
// Food Culture Radio 재생기 (F-VOI-05). 화면을 옮겨 다녀도 계속 재생되도록 모듈 단위 상태 + 미니 플레이어.
// 음성: 세그먼트마다 /api/foodi/tts — 미리 받지 않은 구간은 받는 대로 재생(stream-audio.ts), 다음 세그먼트는 blob 으로 미리 받아 둠
//       → 실패하면 이후 브라우저 음성(문장 단위).
// 자막: 서버 음성은 재생 위치를 글자 수 비율로 문장에 대응, 브라우저 음성은 문장 단위라 정확하다.
import { useSyncExternalStore } from "react";
import type { Episode } from "@/lib/radio/script";
import { sentences } from "@/lib/radio/script";
import { hostForSegment, isVoiceId } from "@/lib/voice/catalog";
import { exploredCountries, getState, record } from "./passport";
import { attachResponse, canStreamAudio, type AttachedAudio } from "./stream-audio";
import { beforeSpeak, stopSpeaking } from "./voice";
import { getVoicePrefs } from "./voice-prefs";
import { questEvent } from "./quest";
import { track } from "./track";
import { noteFeature } from "./taste";

export type RadioState = {
  status: "idle" | "loading" | "playing" | "paused" | "ended" | "error";
  channel: string | null;
  title: string;
  episodes: Episode[];
  ep: number;
  seg: number;
  sent: number;
  engine: "server" | "browser";
  error: string | null;
};

const INITIAL: RadioState = { status: "idle", channel: null, title: "", episodes: [], ep: 0, seg: 0, sent: 0, engine: "server", error: null };
let st: RadioState = INITIAL;
const listeners = new Set<() => void>();
const set = (p: Partial<RadioState>) => {
  st = { ...st, ...p };
  listeners.forEach((l) => l());
};
export const useRadio = () =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => st,
    () => INITIAL,
  );
export const radioState = () => st;

// ── 오디오: 한 개의 <audio> 를 계속 재사용 (iOS 는 사용자 탭으로 한 번 열어 둔 요소만 이후 자동 재생을 허락한다)
let audio: HTMLAudioElement | null = null;
let gen = 0; // 이전 재생의 늦게 도착한 콜백 무시용
const blobs = new Map<string, Promise<string | null>>();
const CHARS_PER_SEC = 7; // 한국어 TTS 말 속도 어림 (공백·문장부호 포함). 크게 잡으면 자막이 앞서 가므로 보수적으로

function silentWav(): string {
  const n = 800;
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  // 8kHz · 8bit · 모노 PCM 헤더 + 무음(128)
  w(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  w(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, "data");
  v.setUint32(40, n, true);
  b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

/** 반드시 사용자 탭 핸들러 안에서 동기적으로 부른다 */
function unlock() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }
  if (!audio.src) {
    audio.src = silentWav();
    void audio.play().catch(() => {});
  }
  try {
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
  } catch {
    /* 무시 */
  }
}

const key = (ep: number, seg: number) => `${st.channel}:${st.episodes[ep]?.food.slug}:${seg}`;
/** 2인 진행 (design/11 문서 §4): 이야기 구간은 진행자 A(이야기꾼), 오프닝·연결·클로징은 B. 고른 짝이 없으면 서버가 준비된 목소리로 자동 짝 */
function hostVoice(kind: string): { voice: string; role: "story" | "mc" } {
  const role = hostForSegment(kind);
  const picked = getVoicePrefs().radioHosts?.[role === "host-a" ? 0 : 1];
  return { voice: isVoiceId(picked) ? picked : role, role: role === "host-a" ? "story" : "mc" };
}
const ttsInit = (text: string, signal: AbortSignal, kind = "summary"): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, ...hostVoice(kind) }), signal });

/** 미리 받기(다음 구간)·다시 듣기용: blob 을 다 받아 둔다 — 재생 중에 받으니 첫 소리 지연과 무관 */
function fetchSeg(ep: number, seg: number): Promise<string | null> {
  const k = key(ep, seg);
  const s = st.episodes[ep]?.segments[seg];
  if (!s?.text) return Promise.resolve(null);
  if (!blobs.has(k)) {
    blobs.set(
      k,
      // 8초 안에 음성이 안 오면 브라우저 음성으로 — 라디오가 멈춰 있는 것처럼 보이지 않게
      fetch("/api/foodi/tts", ttsInit(s.text, AbortSignal.timeout(8000), s.kind))
        .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
        .catch(() => null),
    );
  }
  return blobs.get(k)!;
}

let live: AttachedAudio | null = null; // 지금 <audio> 에 붙어 받는 중인 스트림 (자막 길이 추정용)
let cacheEpoch = 0; // releaseAudio 마다 증가 — 늦게 다 받은 스트림이 비운 캐시에 다시 들어가지 않게

/**
 * 미리 받아 두지 않은 구간(첫 구간·넘기기 직후): 받는 대로 재생해 첫 소리를 당긴다.
 * 8초 제한은 '첫 소리까지'만 — 긴 구간을 받는 도중에 잘라 버리지 않게.
 */
async function streamSeg(my: number, ep: number, seg: number): Promise<"playing" | "paused" | "failed"> {
  const text = st.episodes[ep]?.segments[seg]?.text;
  const el = audio;
  if (!text || !el) return "failed";
  const k = key(ep, seg);
  const epoch = cacheEpoch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let att: AttachedAudio | null = null;
  try {
    const res = await fetch("/api/foodi/tts", ttsInit(text, ctrl.signal, st.episodes[ep].segments[seg].kind));
    if (my !== gen) return (ctrl.abort(), "failed");
    if (!res.ok) return "failed";
    att = await attachResponse(res, el);
    live = att;
    // 다 받으면 캐시에 — 같은 구간을 다시 들을 때(이전 에피소드·자동 재생 거부 뒤 재생 버튼)는 받지 않고 바로
    void att.done.then((b) => b && epoch === cacheEpoch && !blobs.has(k) && blobs.set(k, Promise.resolve(URL.createObjectURL(b))));
    bindAudio(my, ep, seg);
    await Promise.all([el.play(), att.firstAudio]);
    // 다음 구간은 첫 소리가 난 뒤에 미리 받는다 — 같이 받으면 지금 구간의 첫 조각과 대역폭을 다툰다
    const n = nextPos(ep, seg);
    if (n && my === gen) void fetchSeg(...n);
    return "playing";
  } catch (e) {
    if (my !== gen) return "failed";
    if ((e as Error)?.name === "NotAllowedError") return "paused"; // 자동 재생 차단 — 재생 버튼을 다시 누르면 이어진다
    // 받은 조각이 늦게라도 재생되지 않게 (브라우저 음성과 겹침 방지)
    el.pause();
    att?.release();
    if (live === att) live = null;
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

function nextPos(ep: number, seg: number): [number, number] | null {
  const e = st.episodes[ep];
  if (!e) return null;
  if (seg + 1 < e.segments.length) return [ep, seg + 1];
  if (ep + 1 < st.episodes.length) return [ep + 1, 0];
  return null;
}

function markExplored(ep: number) {
  const f = st.episodes[ep]?.food;
  if (f) record({ id: f.id, slug: f.slug, name_ko: f.name_ko, flag: f.flag, country_code: f.country_code, taste_tags: f.taste_tags }, "explored");
  if (f) track("radio_play", { food_id: f.id }); // 새 에피소드 시작 (KPI 참고 지표)
  if (f) questEvent("radio"); // Food Quest: 라디오 이야기 1편
}

function mediaSession() {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  const f = st.episodes[st.ep]?.food;
  if (!ms || !f) return;
  try {
    ms.metadata = new MediaMetadata({ title: f.name_ko, artist: `${f.country_name} · FOODIS 라디오`, album: st.title, artwork: f.image_url ? [{ src: f.image_url, sizes: "512x512" }] : [] });
    ms.setActionHandler("play", () => resume());
    ms.setActionHandler("pause", () => pause());
    ms.setActionHandler("nexttrack", () => skip(1));
    ms.setActionHandler("previoustrack", () => skip(-1));
    ms.playbackState = st.status === "playing" ? "playing" : "paused";
  } catch {
    /* 일부 브라우저는 일부 액션만 지원 */
  }
}

/** 재생 위치 → 자막 문장 (글자 수 비율) · 끝나면 다음 구간 */
function bindAudio(my: number, ep: number, seg: number) {
  if (!audio) return;
  const lines = sentences(st.episodes[ep].segments[seg].text);
  const total = lines.reduce((a, l) => a + l.length, 0) || 1;
  const stream = live;
  // 받는 중인 스트림의 duration 은 '지금까지 받은 길이'라 자막이 앞서 나간다 → 다 받기 전엔 글자 수로 어림한 길이를 하한으로
  const duration = (el: HTMLAudioElement) => (stream && stream === live && !stream.complete ? Math.max(el.duration || 0, total / CHARS_PER_SEC) : el.duration);
  audio.ontimeupdate = () => {
    if (my !== gen || !audio) return;
    const d = duration(audio);
    if (!d || !Number.isFinite(d)) return;
    const at = (audio.currentTime / d) * total;
    let acc = 0;
    const i = lines.findIndex((l) => (acc += l.length) > at);
    if (i >= 0 && i !== st.sent) set({ sent: i });
  };
  audio.onended = () => my === gen && advance(ep, seg);
}

async function playAt(ep: number, seg: number, fromSentence = 0) {
  const my = ++gen;
  stopSpeaking(); // 푸디 답변 음성과 겹치지 않게
  window.speechSynthesis?.cancel();
  if (ep !== st.ep || st.status === "loading" || st.status === "ended") markExplored(ep);
  set({ ep, seg, sent: fromSentence, status: "playing" });
  mediaSession();
  const lines = sentences(st.episodes[ep].segments[seg].text);

  if (st.engine === "server") {
    // 미리 받아 둔(또는 이미 들은) 구간이 아니면 받는 대로 재생 — 첫 소리까지의 시간이 KPI (08 문서 §6)
    if (audio && !blobs.has(key(ep, seg)) && canStreamAudio()) {
      const r = await streamSeg(my, ep, seg);
      if (my !== gen) return;
      if (r === "playing") return;
      if (r === "paused") return set({ status: "paused" });
      set({ engine: "browser" }); // 서버 음성이 없으면 이번 세션은 브라우저 음성으로
      return speakFrom(my, ep, seg, lines, fromSentence);
    }
    const url = await fetchSeg(ep, seg);
    if (my !== gen) return;
    if (url && audio) {
      const n = nextPos(ep, seg);
      if (n) void fetchSeg(...n); // 다음 구간 미리 받기
      live = null;
      audio.src = url;
      bindAudio(my, ep, seg);
      try {
        await audio.play();
        return;
      } catch {
        if (my !== gen) return;
        // 자동 재생 차단 — 사용자가 재생 버튼을 다시 누르면 이어진다
        return set({ status: "paused" });
      }
    }
    set({ engine: "browser" }); // 서버 음성이 없으면 이번 세션은 브라우저 음성으로
  }
  speakFrom(my, ep, seg, lines, fromSentence);
}

function speakFrom(my: number, ep: number, seg: number, lines: string[], i: number) {
  const synth = window.speechSynthesis;
  if (!synth) return set({ status: "error", error: "이 브라우저는 음성을 지원하지 않아요. 자막으로 읽어 주세요." });
  if (i >= lines.length) return advance(ep, seg);
  set({ sent: i });
  const u = new SpeechSynthesisUtterance(lines[i]);
  u.lang = "ko-KR";
  u.rate = 1.0;
  u.onend = () => my === gen && speakFrom(my, ep, seg, lines, i + 1);
  // 다른 음성이 끼어들어 취소되면 넘기지 말고 멈춤으로
  u.onerror = () => my === gen && st.status === "playing" && set({ status: "paused" });
  synth.speak(u);
}

function advance(ep: number, seg: number) {
  const n = nextPos(ep, seg);
  if (!n) {
    gen++;
    set({ status: "ended" });
    return mediaSession();
  }
  void playAt(...n);
}

// ── 화면에서 부르는 동작

export async function startRadio(opts: { channel: string; start?: string }) {
  noteFeature("radio"); // 취향 엔진: 기능 사용
  const my = ++gen;
  stopSpeaking();
  audio?.pause();
  window.speechSynthesis?.cancel();
  releaseAudio();
  if (audio) audio.removeAttribute("src");
  unlock();
  set({ ...INITIAL, engine: st.engine, status: "loading", channel: opts.channel });
  const q = new URLSearchParams({ channel: opts.channel, explored: exploredCountries(getState()).join(",") });
  if (opts.start) q.set("start", opts.start);
  const res = await fetch(`/api/radio?${q}`).catch(() => null);
  if (my !== gen) return;
  if (!res?.ok) return set({ status: "error", error: res?.status === 404 ? "들려줄 이야기가 아직 없어요." : "라디오를 불러오지 못했어요. 연결을 확인해 주세요." });
  const data = (await res.json()) as { channel: string; title: string; episodes: Episode[] };
  set({ title: data.title, episodes: data.episodes, channel: `${data.channel}${opts.start ? `:${opts.start}` : ""}` });
  void playAt(0, 0);
}

export function pause() {
  if (st.status !== "playing") return;
  gen++;
  audio?.pause();
  window.speechSynthesis?.cancel();
  set({ status: "paused" });
  mediaSession();
}

export function resume() {
  if (st.status === "ended") return void (unlock(), playAt(0, 0));
  if (st.status !== "paused") return;
  unlock();
  // 서버 음성은 멈춘 자리에서, 브라우저 음성은 그 문장 처음부터
  if (st.engine === "server" && audio?.src && audio.currentTime > 0 && !audio.ended && audio.src.startsWith("blob:")) {
    bindAudio(++gen, st.ep, st.seg);
    stopSpeaking();
    set({ status: "playing" });
    mediaSession();
    void audio.play().catch(() => set({ status: "paused" }));
    return;
  }
  void playAt(st.ep, st.seg, st.sent);
}

export const toggle = () => (st.status === "playing" ? pause() : resume());

/** 에피소드 단위 이동 */
export function skip(d: 1 | -1) {
  const ep = st.ep + d;
  if (ep < 0 || ep >= st.episodes.length) return;
  unlock();
  void playAt(ep, 0);
}

export function playEpisode(ep: number) {
  if (ep < 0 || ep >= st.episodes.length) return;
  unlock();
  void playAt(ep, 0);
}

function releaseAudio() {
  for (const p of blobs.values()) void p.then((u) => u && URL.revokeObjectURL(u));
  blobs.clear();
  cacheEpoch++;
  live?.release();
  live = null;
}

export function closeRadio() {
  gen++;
  audio?.pause();
  window.speechSynthesis?.cancel();
  releaseAudio();
  set({ ...INITIAL, engine: st.engine });
}

/** 푸디가 듣거나 말하기 시작하면 라디오는 잠시 멈춘다 */
export const pauseRadio = () => pause();
beforeSpeak.add(pauseRadio);
