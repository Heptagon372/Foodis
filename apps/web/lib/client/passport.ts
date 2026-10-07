"use client";
// 게스트 Passport · 온보딩 상태 (브라우저 저장). 로그인하면 lib/client/account.ts 가 /api/me/sync 로 계정과 맞춘다.
// localStorage 는 사파리 비공개 모드 등에서 막힐 수 있어 모든 접근을 try/catch 로 감싼다.
import { useRef, useSyncExternalStore } from "react";
import type { Allergen, DietKey } from "@/lib/foodi/schema";
import { signal } from "./taste";
import { track } from "./track";

export type PassportStatus = "explored" | "tried" | "liked" | "saved";
export type PassportEntry = { slug: string; name_ko: string; flag: string; cc: string; tags: string[]; statuses: PassportStatus[]; at: number };
export type LocalState = {
  v: 1;
  onboarded: boolean;
  diet: DietKey[];
  /** 식단 카테고리 중 추천 필터(diet)에 없는 것 — 종교·채식 단계·다이어트·건강 (lib/diet/guard). 이 기기에만 저장 */
  guards?: string[];
  allergens: Allergen[];
  tastes: string[];
  entries: Record<string, PassportEntry>;
};

const KEY = "foodis:v1";
const INITIAL: LocalState = { v: 1, onboarded: false, diet: [], guards: [], allergens: [], tastes: [], entries: {} };

let state: LocalState = INITIAL;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...INITIAL, ...JSON.parse(raw) };
  } catch {
    /* 저장소 사용 불가 → 메모리 상태로만 동작 */
  }
}

export function update(fn: (s: LocalState) => LocalState) {
  load();
  state = fn(state);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 무시 */
  }
  listeners.forEach((l) => l());
}

export function getState(): LocalState {
  load();
  return state;
}

export const subscribe = (cb: () => void) => (listeners.add(cb), () => void listeners.delete(cb));

/** 서버 렌더에서는 INITIAL, 하이드레이션 후 실제 값 → SSR 안전.
 *  selector 가 새 배열을 만들어도 무한 렌더가 나지 않도록 상태 객체 단위로 결과를 캐시한다. */
export function useLocal<T>(select: (s: LocalState) => T): T {
  const memo = useRef<{ s?: LocalState; v?: T }>({});
  const snap = (s: LocalState) => {
    if (memo.current.s !== s) memo.current = { s, v: select(s) };
    return memo.current.v as T;
  };
  return useSyncExternalStore(subscribe, () => snap(getState()), () => snap(INITIAL));
}

/** 하이드레이션 이후에만 true — 저장된 상태를 보고 화면을 바꿔야 할 때(인트로 노출 등) 깜빡임 방지 */
export const useHydrated = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

export type FoodRef ={ id: string; slug: string; name_ko: string; flag: string; country_code: string; taste_tags: string[] };

export function record(food: FoodRef, status: PassportStatus) {
  const newCountry = !Object.values(getState().entries).some((e) => e.cc === food.country_code); // KPI North Star
  if (newCountry) track("explore_country", { country: food.country_code });
  update((s) => {
    const prev = s.entries[food.id];
    const statuses = prev?.statuses.includes(status) ? prev.statuses : [...(prev?.statuses ?? []), status];
    return {
      ...s,
      entries: {
        ...s.entries,
        [food.id]: { slug: food.slug, name_ko: food.name_ko, flag: food.flag, cc: food.country_code, tags: food.taste_tags, statuses, at: prev?.at ?? Date.now() },
      },
    };
  });
}

export function toggle(food: FoodRef, status: Exclude<PassportStatus, "explored">) {
  const has = getState().entries[food.id]?.statuses.includes(status);
  if (!has && status === "liked") track("rec_accept", { food_id: food.id, via: "like" }); // 추천 카드였는지는 KPI 계산에서 가린다
  if (!has) signal(status === "liked" ? "like" : status, food); // 취향 엔진: 좋아요 4 · 먹어봤어요 3 · 저장 2.5
  if (!has) return record(food, status);
  update((s) => {
    const e = s.entries[food.id];
    return { ...s, entries: { ...s.entries, [food.id]: { ...e, statuses: e.statuses.filter((x) => x !== status) } } };
  });
}

/** /api/foodi/ask 로 보내는 게스트 프로필 */
export const guestProfile = (s: LocalState) => ({ diet: s.diet, allergens: s.allergens, explored_countries: exploredCountries(s), explored_foods: Object.keys(s.entries).slice(-300), tag_weights: foodDna(s) });

export const exploredCountries = (s: LocalState) => [...new Set(Object.values(s.entries).map((e) => e.cc))];

/** Food DNA: 탐험한 음식의 맛 태그 가중합 (좋아요 ×2, 먹어봤어요 ×1.5). 온보딩 취향은 시작값 */
export function foodDna(s: LocalState): Record<string, number> {
  const w: Record<string, number> = {};
  for (const t of s.tastes) w[t] = (w[t] ?? 0) + 1;
  for (const e of Object.values(s.entries)) {
    const k = e.statuses.includes("liked") ? 2 : e.statuses.includes("tried") ? 1.5 : 1;
    for (const t of e.tags) w[t] = (w[t] ?? 0) + k;
  }
  return w;
}
