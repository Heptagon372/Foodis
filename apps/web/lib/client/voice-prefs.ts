"use client";
// 음성 설정 (브라우저 저장): 푸디 목소리(TTS) · 음성 인식 방식(STT). 서버 라우트에 요청할 때 함께 보낸다.
// 목소리 값은 lib/voice/catalog 의 id, 인식 방식은 registry/stt 가 아는 값 — 서버가 다시 검증한다.
import { useRef, useSyncExternalStore } from "react";

export type VoicePrefs = {
  v: 1;
  /** 푸디 목소리 id (null = 자동: 서버 기본 체인) */
  ttsVoice: string | null;
  /** 라디오 진행자 목소리 id 두 개 (null = 자동 짝) */
  radioHosts: [string, string] | null;
  /** 음성 인식: auto = 브라우저 먼저(빠름) · server = 서버 STT(사투리·외국어에 강함) */
  sttMode: "auto" | "server";
  /** 서버 STT 언어 힌트: ko = 한국어(사투리 포함) · auto = 언어 자동 감지 */
  sttLang: "ko" | "auto";
  /** 서버 STT 엔진 직접 고르기 (null = 자동: 언어 힌트별 기본 체인). 고른 엔진이 실패하면 기본 체인으로 이어진다 */
  sttEngine: string | null;
};

const KEY = "foodis:voice";
const INITIAL: VoicePrefs = { v: 1, ttsVoice: null, radioHosts: null, sttMode: "auto", sttLang: "ko", sttEngine: null };
let state: VoicePrefs = INITIAL;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...INITIAL, ...JSON.parse(raw) };
  } catch {
    /* 저장소 사용 불가 → 기본값 */
  }
}

export function getVoicePrefs(): VoicePrefs {
  load();
  return state;
}

export function setVoicePrefs(patch: Partial<VoicePrefs>) {
  load();
  state = { ...state, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 무시 */
  }
  listeners.forEach((l) => l());
}

export function useVoicePrefs<T>(select: (p: VoicePrefs) => T): T {
  const memo = useRef<{ s?: VoicePrefs; v?: T }>({});
  const snap = (s: VoicePrefs) => {
    if (memo.current.s !== s) memo.current = { s, v: select(s) };
    return memo.current.v as T;
  };
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => snap(getVoicePrefs()),
    () => snap(INITIAL),
  );
}
