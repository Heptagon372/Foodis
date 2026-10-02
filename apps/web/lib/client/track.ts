"use client";
// 베타 KPI 측정용 익명 이벤트 (07 문서 §1, docs/design/07_KPI_측정_v1.md).
// - anon_id: 브라우저마다 무작위 id (계정과 무관) · session_id: 탭 단위, 30분 무활동이면 새 세션
// - 10초마다 또는 페이지를 떠날 때(pagehide) 한 번에 보낸다 — sendBeacon 은 페이지가 닫혀도 전송된다
// - Do Not Track · Global Privacy Control 이 켜져 있거나 데모 모드면 아무것도 보내지 않는다
// - 개인정보·자유 텍스트 금지: 질문 원문은 절대 넣지 않는다 (id · 짧은 코드 · 숫자만)
import type { EventName, EventProps } from "@/lib/analytics/events";

const ANON_KEY = "foodis:anon";
const SESSION_KEY = "foodis:session";
const IDLE_MS = 30 * 60_000;
const FLUSH_MS = 10_000;
const MAX_BATCH = 50; // /api/events 한 번에 받는 최대 개수

type Queued = { name: EventName; props: EventProps; t: number; session_id: string; path: string };

let queue: Queued[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let memAnon: string | null = null; // 저장소가 막힌 브라우저용
let memSession: { id: string; last: number } | null = null;

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** 추적 거부 신호 + 데모 모드(발표 기기 기록이 베타 수치를 오염시키지 않게) */
export function trackingAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = window as Window & { doNotTrack?: string };
  if (nav.globalPrivacyControl === true) return false;
  if ([nav.doNotTrack, w.doNotTrack, nav.msDoNotTrack].some((v) => v === "1" || v === "yes")) return false;
  try {
    if (localStorage.getItem("foodis:demo-mode") === "1") return false;
  } catch {
    /* 저장소 사용 불가 → 데모 모드 아님 */
  }
  return true;
}

/** 브라우저 무작위 id (계정과 무관) — 커뮤니티 미리보기 모드의 게스트 글쓴이 표시에도 쓴다 */
export function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) localStorage.setItem(ANON_KEY, (id = newId()));
    return id;
  } catch {
    return (memAnon ??= newId());
  }
}

/** 세션을 이어 쓰거나(30분 이내) 새로 만든다. 새로 만들었으면 fresh=true */
function touchSession(now: number): { id: string; fresh: boolean } {
  let s: { id: string; last: number } | null = memSession;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) s = JSON.parse(raw);
  } catch {
    /* 메모리 세션 사용 */
  }
  const fresh = !s?.id || now - s.last > IDLE_MS;
  const next = { id: fresh || !s ? newId() : s.id, last: now };
  memSession = next;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    /* 무시 */
  }
  return { id: next.id, fresh };
}

function send(beacon: boolean) {
  if (!queue.length) return;
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);
  const body = JSON.stringify({ anon_id: anonId(), sent_at: Date.now(), events: batch });
  // text/plain 문자열 → CORS 사전 요청 없이 sendBeacon 가능 (서버는 req.json() 으로 그대로 읽는다)
  const ok = beacon && typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/events", body);
  if (!ok) void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  if (queue.length) send(beacon);
}

function start() {
  if (timer) return;
  timer = setInterval(() => send(false), FLUSH_MS);
  const leave = () => send(true);
  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && leave());
}

function enqueue(name: EventName | null, props: EventProps) {
  if (!trackingAllowed() || location.pathname.startsWith("/admin")) return; // 운영팀 화면은 측정하지 않는다
  try {
    const now = Date.now();
    const path = location.pathname.slice(0, 128);
    const s = touchSession(now);
    if (s.fresh) queue.push({ name: "session_start", props: {}, t: now, session_id: s.id, path });
    if (name && name !== "session_start") queue.push({ name, props, t: now, session_id: s.id, path });
    if (!queue.length) return;
    start();
    if (queue.length >= MAX_BATCH) send(false);
  } catch {
    /* 측정 실패가 앱 동작을 막으면 안 된다 */
  }
}

/** 이벤트 1건 기록 (배치 전송). 서버 렌더·추적 거부 시에는 아무것도 하지 않는다 */
export const track = (name: EventName, props: EventProps = {}) => enqueue(name, props);

/** 화면 이동마다 호출: 세션을 이어 두고, 30분 무활동 뒤 첫 방문이면 session_start 를 남긴다 */
export const keepAlive = () => enqueue(null, {});
