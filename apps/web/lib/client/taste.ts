"use client";
// 취향 신호 저장소 (브라우저). 계산은 lib/taste/engine.ts.
// - 이 기기 안에만 저장한다 (서버로 보내지 않음). 추적 거부(DNT·GPC)와 무관하게 개인화에만 쓰이고, Passport 에서 지울 수 있다
// - 신호는 최근 600개만 둔다 (반감기 21일이라 오래된 것은 어차피 영향이 작다)
import { useRef, useSyncExternalStore } from "react";
import type { FeatureUse, Signal, SignalKind } from "@/lib/taste/engine";

const KEY = "foodis:taste:v1";
const MAX_SIGNALS = 600;

export type TasteState = { v: 1; signals: Signal[]; features: FeatureUse; impressions: Record<string, number> };
const INITIAL: TasteState = { v: 1, signals: [], features: {}, impressions: {} };

let state: TasteState = INITIAL;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...INITIAL, ...JSON.parse(raw) };
  } catch {
    /* 저장소 사용 불가 → 메모리 상태로만 */
  }
}

function update(fn: (s: TasteState) => TasteState) {
  load();
  state = fn(state);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 무시 */
  }
  listeners.forEach((l) => l());
}

export const getTaste = () => (load(), state);
const subscribe = (cb: () => void) => (listeners.add(cb), () => void listeners.delete(cb));

export function useTaste<T>(select: (s: TasteState) => T): T {
  const memo = useRef<{ s?: TasteState; v?: T }>({});
  const snap = (s: TasteState) => {
    if (memo.current.s !== s) memo.current = { s, v: select(s) };
    return memo.current.v as T;
  };
  return useSyncExternalStore(subscribe, () => snap(getTaste()), () => snap(INITIAL));
}

export type SignalFood = { slug: string; country_code: string; taste_tags?: string[] };

/** 신호 1건. 음식이 있으면 나라·태그를 같이 남겨 둔다 (음식 목록 없이도 프로필 계산 가능) */
export function signal(k: SignalKind, food?: SignalFood | null, extra: { cc?: string; ms?: number; src?: string } = {}) {
  if (typeof window === "undefined") return;
  const s: Signal = { k, t: Date.now(), ...(food ? { slug: food.slug, cc: food.country_code, tags: food.taste_tags ?? [] } : {}), ...extra };
  // 같은 신호가 1.5초 안에 또 오면 한 번으로 (개발 모드 StrictMode 의 이중 effect · 빠른 연타)
  const dup = k !== "dwell" && getTaste().signals.slice(-3).some((x) => x.k === k && x.slug === s.slug && x.cc === s.cc && s.t - x.t < 1500);
  if (dup) return;
  update((st) => ({ ...st, signals: [...st.signals, s].slice(-MAX_SIGNALS) }));
}

/** 기능 사용 횟수 (라디오 · 지도 · 음성 · 여정 · 퀘스트 · 사진 · 식탁 · 공유 · 재료 …) */
export function noteFeature(name: string) {
  if (typeof window === "undefined") return;
  update((st) => ({ ...st, features: { ...st.features, [name]: { n: (st.features[name]?.n ?? 0) + 1, last: Date.now() } } }));
}

/** 추천 카드 노출. 3번 넘게 보고도 안 누른 음식은 skip 신호 1번 (그 뒤로는 노출 수만 센다) */
export function impress(foods: SignalFood[]) {
  if (typeof window === "undefined" || !foods.length) return;
  update((st) => {
    const impressions = { ...st.impressions };
    const skips: Signal[] = [];
    for (const f of foods) {
      impressions[f.slug] = (impressions[f.slug] ?? 0) + 1;
      if (impressions[f.slug] === 4) skips.push({ k: "skip", t: Date.now(), slug: f.slug, cc: f.country_code, tags: f.taste_tags ?? [] });
    }
    return { ...st, impressions, signals: [...st.signals, ...skips].slice(-MAX_SIGNALS) };
  });
}

/** 클릭하면 노출 수를 0 으로 (지나친 게 아니었으니까) */
export function clearImpression(slug: string) {
  if (!getTaste().impressions[slug]) return;
  update((st) => {
    const impressions = { ...st.impressions };
    delete impressions[slug];
    return { ...st, impressions };
  });
}

export const resetTaste = () => update(() => INITIAL);
