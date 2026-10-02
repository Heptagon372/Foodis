"use client";
// Food Quest 저장소 (브라우저). 규칙은 lib/quest/quests.ts, 여기는 저장·구독·축하 큐만.
// Passport 와 키를 나눈 이유: 계정 동기화(/api/me/sync)는 foodis:v1 만 맞추고, 퀘스트 카운터는 기기마다 가볍게 둔다.
import { useSyncExternalStore } from "react";
import { badgeShelf, bump, EMPTY_QUEST_DATA, settle, streak, weeklyBoard, type BadgeProgress, type Celebration, type QuestData, type QuestEvent, type QuestProgress } from "@/lib/quest/quests";
import { getState, subscribe as subscribePassport } from "./passport";

const KEY = "foodis:quest";

export type QuestView = { ready: boolean; quests: QuestProgress[]; doneCount: number; streak: number; badges: BadgeProgress[] };
// 서버·하이드레이션 때는 빈 보드 — 주(週)가 서버와 브라우저에서 다를 수 있어 퀘스트 제목을 미리 그리지 않는다
const SERVER_VIEW: QuestView = { ready: false, quests: [], doneCount: 0, streak: 0, badges: [] };

let data: QuestData = EMPTY_QUEST_DATA;
let saved: QuestData = data;
let view = SERVER_VIEW;
let started = false;
let triedIds = new Set<string>();
const listeners = new Set<() => void>();

export type Toast = Celebration & { id: number; label?: string };
let toasts: Toast[] = [];
let toastSeq = 0;
const toastListeners = new Set<() => void>();

const entries = () => Object.values(getState().entries);
const triedOf = () => new Set(Object.entries(getState().entries).flatMap(([id, e]) => (e.statuses.includes("tried") ? [id] : [])));

function refresh(celebrate: boolean) {
  const now = Date.now();
  const r = settle(data, entries(), now);
  data = r.data;
  if (data !== saved) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* 저장소 사용 불가 → 이번 세션 메모리로만 */
    }
    saved = data;
  }
  if (celebrate && r.fresh.length) pushToasts(r.fresh);
  const board = weeklyBoard(entries(), data, now);
  view = { ready: true, quests: board.quests, doneCount: board.doneCount, streak: streak(data.cleared, now), badges: badgeShelf(entries(), data, now) };
  listeners.forEach((l) => l());
}

function pushToasts(fresh: Celebration[]) {
  // 로그인 직후 동기화처럼 한꺼번에 여럿이 열리면 토스트를 줄 세우지 않고 하나로 묶는다
  const list: Omit<Toast, "id">[] = fresh.length > 2 ? [{ kind: "badge", emoji: "🎉", label: "축하해요!", title: `퀘스트·배지 ${fresh.length}개를 모았어요` }] : fresh;
  toasts = [...toasts, ...list.map((c) => ({ ...c, id: ++toastSeq }))];
  toastListeners.forEach((l) => l());
}

function onPassport() {
  // '먹어봤어요'는 기록 시각이 따로 없어서, 새로 켜진 순간을 이번 주 카운터로 센다
  const now = triedOf();
  const added = [...now].filter((id) => !triedIds.has(id)).length;
  triedIds = now;
  // 계정 병합으로 한꺼번에 들어온 기록은 '이번 주에 한 일'이 아니다
  if (added > 0 && added <= 2) data = bump(data, "tried", Date.now(), added);
  refresh(true);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) data = saved = { ...EMPTY_QUEST_DATA, ...JSON.parse(raw) };
  } catch {
    /* 깨진 값·막힌 저장소 → 빈 상태로 시작 */
  }
  triedIds = triedOf();
  subscribePassport(onPassport);
  // 탭을 켜 둔 채 월요일을 넘길 수 있다
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh(true));
  refresh(false); // 이미 이룬 것은 조용히 기록 (기능이 처음 열린 기존 사용자에게 토스트 폭탄 방지)
}

/** 라디오·푸디 시트가 부르는 한 줄짜리 훅 지점 */
export function questEvent(ev: Exclude<QuestEvent, "tried">) {
  start();
  data = bump(data, ev, Date.now());
  refresh(true);
}

const subscribe = (cb: () => void) => {
  start();
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export const useQuest = () =>
  useSyncExternalStore(
    subscribe,
    () => view,
    () => SERVER_VIEW,
  );

const NO_TOASTS: Toast[] = [];
export const useQuestToasts = () =>
  useSyncExternalStore(
    (cb) => (start(), toastListeners.add(cb), () => void toastListeners.delete(cb)),
    () => toasts,
    () => NO_TOASTS,
  );

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  toastListeners.forEach((l) => l());
}
