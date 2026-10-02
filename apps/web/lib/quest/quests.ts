// Food Quest (기능 #9 · 리텐션) — 주간 퀘스트 3개 + 영구 배지. 순수 함수만 둔다(저장·화면은 lib/client/quest.ts).
// 진행도는 게스트 Passport(entries 의 첫 기록 시각 at)와 작은 카운터(라디오·음성 질문·먹어봤어요)로 계산한다.
// 주 경계는 Asia/Seoul 월요일 0시 — 한국은 서머타임이 없어 +9시간 고정으로 충분하다.
import type { PassportEntry } from "@/lib/client/passport";
import { CONTINENT_KEYS, CONTINENT_OF, COUNTRY_TOTAL } from "./continents";

export type QuestEntry = Pick<PassportEntry, "cc" | "tags" | "statuses" | "at">;
export type QuestEvent = "radio" | "voice_ask" | "tried";
export type QuestCounts = Partial<Record<QuestEvent, number>>;

/** localStorage `foodis:quest` 에 그대로 저장되는 모양. counts·done 은 week 의 것만 유지 */
export type QuestData = {
  v: 1;
  week: string;
  counts: QuestCounts;
  /** 이번 주 완료한 퀘스트 id → 완료 시각 (진행도가 나중에 줄어도 완료는 유지) */
  done: Record<string, number>;
  /** 3개를 모두 끝낸 주 (연속 기록 배지용, 최근 12주) */
  cleared: string[];
  /** 받은 배지 id → 받은 시각 (영구) */
  badges: Record<string, number>;
};
export const EMPTY_QUEST_DATA: QuestData = { v: 1, week: "", counts: {}, done: {}, cleared: [], badges: {} };

// ── 주 계산 (KST)
const KST = 9 * 3_600_000;
const DAY = 86_400_000;

export type Week = { key: string; start: number; end: number };

/** ts 가 속한 ISO 주 (한국 시간 기준). key 예: "2026-W40" */
export function kstWeek(ts: number): Week {
  const k = ts + KST; // UTC getter 로 읽으면 한국 벽시계가 되도록 민 시각
  const dow = (new Date(k).getUTCDay() + 6) % 7; // 월=0 … 일=6
  const monday = Math.floor(k / DAY) * DAY - dow * DAY;
  const thu = new Date(monday + 3 * DAY); // ISO 주의 연도는 그 주 목요일이 정한다
  const y = thu.getUTCFullYear();
  const n = Math.floor((thu.getTime() - Date.UTC(y, 0, 1)) / DAY / 7) + 1;
  const start = monday - KST;
  return { key: `${y}-W${String(n).padStart(2, "0")}`, start, end: start + 7 * DAY };
}

// ── 퀘스트 카탈로그
type Ctx = { entries: QuestEntry[]; week: Week; counts: QuestCounts };

const inWeek = (c: Ctx) => c.entries.filter((e) => e.at >= c.week.start && e.at < c.week.end);
const tagged = (tag: string) => (c: Ctx) => inWeek(c).filter((e) => e.tags.includes(tag)).length;

/** 키(나라·대륙)별 첫 기록 시각 */
function firstSeen(entries: QuestEntry[], keyOf: (e: QuestEntry) => string | undefined) {
  const m = new Map<string, number>();
  for (const e of entries) {
    const k = keyOf(e);
    const prev = k ? m.get(k) : undefined;
    if (k && (prev === undefined || e.at < prev)) m.set(k, e.at);
  }
  return m;
}
const firstInWeek = (c: Ctx, keyOf: (e: QuestEntry) => string | undefined) => [...firstSeen(c.entries, keyOf).values()].filter((t) => t >= c.week.start && t < c.week.end).length;

export type QuestTemplate = {
  id: string;
  emoji: string;
  title: string;
  /** 완료하면 받는 스탬프 (보드의 보상 칩) */
  reward: string;
  target: number;
  progress: (c: Ctx) => number;
  /** 이번 주가 시작될 때의 기록으로 판단 — 주 중간에 퀘스트가 바뀌지 않게 */
  feasible?: (before: QuestEntry[]) => boolean;
  /** 남은 양 → "다음: …" 문구 */
  next: (left: number) => string;
};

export const QUESTS: QuestTemplate[] = [
  {
    id: "new_countries",
    emoji: "🧭",
    title: "이번 주 새로운 나라 3곳 탐험",
    reward: "🧭 나침반 스탬프",
    target: 3,
    progress: (c) => firstInWeek(c, (e) => e.cc),
    feasible: (before) => COUNTRY_TOTAL - new Set(before.map((e) => e.cc)).size >= 3,
    next: (n) => `새로운 나라 ${n}곳 더`,
  },
  {
    id: "new_continent",
    emoji: "🌐",
    title: "아직 0인 대륙 하나 열기",
    reward: "🌐 지구본 스탬프",
    target: 1,
    progress: (c) => firstInWeek(c, (e) => CONTINENT_OF[e.cc]),
    feasible: (before) => new Set(before.map((e) => CONTINENT_OF[e.cc]).filter(Boolean)).size < CONTINENT_KEYS.length,
    next: () => "아직 안 가 본 대륙 열기",
  },
  { id: "fermented", emoji: "🫙", title: "발효 음식 2가지 탐험", reward: "🫙 항아리 스탬프", target: 2, progress: tagged("fermented"), next: (n) => `발효 음식 ${n}개 더` },
  { id: "soupy", emoji: "🍲", title: "국물 요리 2가지 탐험", reward: "🍲 냄비 스탬프", target: 2, progress: tagged("soupy"), next: (n) => `국물 요리 ${n}개 더` },
  { id: "foods", emoji: "🍽", title: "이번 주 음식 5가지 탐험", reward: "🍽 접시 스탬프", target: 5, progress: (c) => inWeek(c).length, next: (n) => `음식 ${n}개 더 탐험` },
  { id: "tried", emoji: "📕", title: "먹어봤어요 1개 기록", reward: "📕 도장 스탬프", target: 1, progress: (c) => c.counts.tried ?? 0, next: (n) => `먹어봤어요 ${n}개 더` },
  { id: "radio", emoji: "🎧", title: "라디오로 이야기 1편 듣기", reward: "🎧 헤드폰 스탬프", target: 1, progress: (c) => c.counts.radio ?? 0, next: (n) => `라디오 이야기 ${n}편 더` },
  { id: "voice_ask", emoji: "🎙", title: "푸디에게 음성으로 3번 묻기", reward: "🎙 마이크 스탬프", target: 3, progress: (c) => c.counts.voice_ask ?? 0, next: (n) => `음성으로 ${n}번 더 묻기` },
];

// 같은 주엔 모두 같은 순서 — FNV-1a 해시 → mulberry32
function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 주 시드로 카탈로그를 섞은 뒤, 이미 불가능한 것(예: 다섯 대륙을 다 연 사람의 '대륙 열기')만 건너뛰고 n개 */
export function pickWeekly(weekKey: string, before: QuestEntry[], n = 3): QuestTemplate[] {
  const rnd = seeded(weekKey);
  const order = [...QUESTS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.filter((q) => q.feasible?.(before) ?? true).slice(0, n);
}

export type QuestProgress = { id: string; emoji: string; title: string; reward: string; target: number; value: number; done: boolean; doneAt: number | null; next: string };

export function weeklyBoard(entries: QuestEntry[], data: QuestData, now: number) {
  const week = kstWeek(now);
  const same = data.week === week.key;
  const ctx: Ctx = { entries, week, counts: same ? data.counts : {} };
  const done = same ? data.done : {};
  const quests: QuestProgress[] = pickWeekly(
    week.key,
    entries.filter((e) => e.at < week.start),
  ).map((q) => {
    const doneAt = done[q.id] ?? null;
    const value = doneAt != null ? q.target : Math.min(q.target, q.progress(ctx));
    return { id: q.id, emoji: q.emoji, title: q.title, reward: q.reward, target: q.target, value, done: value >= q.target, doneAt, next: q.next(q.target - value) };
  });
  return { week, quests, doneCount: quests.filter((q) => q.done).length };
}

/** 3개를 모두 끝낸 주가 몇 주 연속인지. 이번 주가 아직이면 지난주부터 센다 (월요일에 바로 끊기지 않게) */
export function streak(cleared: string[], now: number): number {
  const set = new Set(cleared);
  let w = kstWeek(now);
  if (!set.has(w.key)) w = kstWeek(w.start - 1);
  let n = 0;
  while (set.has(w.key)) {
    n++;
    w = kstWeek(w.start - 1);
  }
  return n;
}

// ── 배지 (영구)
type BadgeCtx = { entries: QuestEntry[]; streak: number };
export type BadgeRule = { id: string; emoji: string; name: string; hint: string; target: number; value: (c: BadgeCtx) => number };

const countries = (c: BadgeCtx) => new Set(c.entries.map((e) => e.cc)).size;

export const BADGES: BadgeRule[] = [
  { id: "first", emoji: "🎒", name: "첫 탐험", hint: "음식 하나를 탐험하면 열려요", target: 1, value: (c) => c.entries.length },
  { id: "countries_5", emoji: "🗺", name: "5개국", hint: "5개국을 탐험하면 열려요", target: 5, value: countries },
  { id: "countries_10", emoji: "✈️", name: "10개국", hint: "10개국을 탐험하면 열려요", target: 10, value: countries },
  { id: "countries_25", emoji: "🌏", name: "25개국", hint: "25개국을 탐험하면 열려요", target: 25, value: countries },
  { id: "continents", emoji: "🌐", name: "다섯 대륙", hint: "다섯 대륙에 모두 발자국을 남기면 열려요", target: CONTINENT_KEYS.length, value: (c) => new Set(c.entries.map((e) => CONTINENT_OF[e.cc]).filter(Boolean)).size },
  {
    id: "dumpling_road",
    emoji: "🥟",
    name: "만두 로드",
    hint: "만두 계열 음식 3가지를 '먹어봤어요'로 기록하면 열려요",
    target: 3,
    value: (c) => c.entries.filter((e) => e.tags.includes("dumpling") && e.statuses.includes("tried")).length,
  },
  { id: "fermented", emoji: "🫙", name: "발효 탐험가", hint: "발효 음식 3가지를 탐험하면 열려요", target: 3, value: (c) => c.entries.filter((e) => e.tags.includes("fermented")).length },
  { id: "streak_2", emoji: "🔥", name: "2주 연속", hint: "주간 퀘스트를 2주 연속 모두 끝내면 열려요", target: 2, value: (c) => c.streak },
  { id: "streak_4", emoji: "🏆", name: "4주 연속", hint: "주간 퀘스트를 4주 연속 모두 끝내면 열려요", target: 4, value: (c) => c.streak },
];

export type BadgeProgress = { id: string; emoji: string; name: string; hint: string; target: number; value: number; earnedAt: number | null };

export function badgeShelf(entries: QuestEntry[], data: QuestData, now: number): BadgeProgress[] {
  const ctx = { entries, streak: streak(data.cleared, now) };
  return BADGES.map((b) => {
    const earnedAt = data.badges[b.id] ?? null;
    return { id: b.id, emoji: b.emoji, name: b.name, hint: b.hint, target: b.target, value: earnedAt != null ? b.target : Math.min(b.target, b.value(ctx)), earnedAt };
  });
}

// ── 상태 전이 (저장소가 부른다)
export type Celebration = { kind: "quest" | "badge"; emoji: string; title: string };

/** 주가 바뀌었으면 이번 주 카운터·완료를 비운다 */
function roll(data: QuestData, week: string): QuestData {
  return data.week === week ? data : { ...data, week, counts: {}, done: {} };
}

export function bump(data: QuestData, ev: QuestEvent, now: number, by = 1): QuestData {
  const d = roll(data, kstWeek(now).key);
  return { ...d, counts: { ...d.counts, [ev]: (d.counts[ev] ?? 0) + by } };
}

/** 새로 끝난 퀘스트·새 배지를 기록하고 축하할 목록을 돌려준다. 바뀐 게 없으면 같은 객체 */
export function settle(data: QuestData, entries: QuestEntry[], now: number): { data: QuestData; fresh: Celebration[] } {
  const board = weeklyBoard(entries, data, now);
  let d = roll(data, board.week.key);
  const fresh: Celebration[] = [];

  const newly = board.quests.filter((q) => q.done && !(q.id in d.done));
  if (newly.length) {
    d = { ...d, done: { ...d.done, ...Object.fromEntries(newly.map((q) => [q.id, now])) } };
    for (const q of newly) fresh.push({ kind: "quest", emoji: q.emoji, title: q.title });
  }
  if (board.quests.length && board.quests.every((q) => q.done) && !d.cleared.includes(board.week.key)) {
    d = { ...d, cleared: [...d.cleared, board.week.key].slice(-12) };
  }

  const ctx = { entries, streak: streak(d.cleared, now) };
  const earned = BADGES.filter((b) => !(b.id in d.badges) && b.value(ctx) >= b.target);
  if (earned.length) {
    d = { ...d, badges: { ...d.badges, ...Object.fromEntries(earned.map((b) => [b.id, now])) } };
    for (const b of earned) fresh.push({ kind: "badge", emoji: b.emoji, title: b.name });
  }
  return { data: d, fresh };
}
