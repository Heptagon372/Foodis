"use client";
// '푸디의 두뇌' 선택 (브라우저 저장): 답변 모델 id. 서버(/api/foodi/ask · vision)에 요청할 때 함께 보낸다.
// 값은 lib/ai/models 목록의 id — 서버가 목록·키·예산으로 다시 검증하고, 모르는 값이면 무시한다.
import { useRef, useSyncExternalStore } from "react";

export type AiPrefs = {
  v: 1;
  /** 답변 모델 id (null = 자동: 서버 기본 체인) */
  model: string | null;
};

const KEY = "foodis:ai";
const INITIAL: AiPrefs = { v: 1, model: null };
let state: AiPrefs = INITIAL;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AiPrefs>;
      state = { ...INITIAL, model: typeof p.model === "string" && p.model ? p.model : null };
    }
  } catch {
    /* 저장소 사용 불가 → 기본값 */
  }
}

export function getAiPrefs(): AiPrefs {
  load();
  return state;
}

export function setAiPrefs(patch: Partial<Omit<AiPrefs, "v">>) {
  load();
  state = { ...state, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 무시 */
  }
  listeners.forEach((l) => l());
}

export function useAiPrefs<T>(select: (p: AiPrefs) => T): T {
  const memo = useRef<{ s?: AiPrefs; v?: T }>({});
  const snap = (s: AiPrefs) => {
    if (memo.current.s !== s) memo.current = { s, v: select(s) };
    return memo.current.v as T;
  };
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => snap(getAiPrefs()),
    () => snap(INITIAL),
  );
}
