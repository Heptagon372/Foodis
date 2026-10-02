import { describe, expect, it } from "vitest";
import { PREVIEW_COUNTRIES } from "@/lib/preview/countries";
import { CONTINENT_OF } from "./continents";
import { BADGES, badgeShelf, bump, EMPTY_QUEST_DATA, kstWeek, pickWeekly, QUESTS, settle, streak, weeklyBoard, type QuestData, type QuestEntry } from "./quests";

// 2026-W40 = 9/28(월) ~ 10/4(일), 한국 시간
const MON = Date.parse("2026-09-28T00:00:00+09:00");
const NOW = Date.parse("2026-10-01T12:00:00+09:00");
const DAY = 86_400_000;
const e = (cc: string, at: number, tags: string[] = [], statuses: QuestEntry["statuses"] = ["explored"]): QuestEntry => ({ cc, at, tags, statuses });
const quest = (id: string) => QUESTS.find((q) => q.id === id)!;
const data = (p: Partial<QuestData> = {}): QuestData => ({ ...EMPTY_QUEST_DATA, ...p });

describe("주 경계 (Asia/Seoul)", () => {
  it("월요일 0시(KST)에 주가 바뀐다 — UTC 일요일 15시", () => {
    const w = kstWeek(NOW);
    expect(w).toEqual({ key: "2026-W40", start: MON, end: MON + 7 * DAY });
    expect(kstWeek(Date.parse("2026-10-04T23:59:59+09:00")).key).toBe("2026-W40");
    expect(kstWeek(Date.parse("2026-10-05T00:00:00+09:00")).key).toBe("2026-W41");
    // UTC 로는 아직 일요일이지만 한국은 월요일 새벽 → 새 주
    expect(kstWeek(Date.parse("2026-10-04T16:00:00Z")).key).toBe("2026-W41");
    expect(kstWeek(Date.parse("2026-09-27T14:59:59Z")).key).toBe("2026-W39");
  });

  it("ISO 주 연도: 2027-01-01(금)은 2026-W53, 2027-01-04(월)는 2027-W01", () => {
    expect(kstWeek(Date.parse("2027-01-01T10:00:00+09:00")).key).toBe("2026-W53");
    expect(kstWeek(Date.parse("2027-01-04T00:00:00+09:00")).key).toBe("2027-W01");
  });
});

describe("주간 퀘스트 고르기", () => {
  it("같은 주엔 항상 같은 3개, 서로 다르다", () => {
    const a = pickWeekly("2026-W40", []).map((q) => q.id);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(pickWeekly("2026-W40", []).map((q) => q.id)).toEqual(a);
  });

  it("주마다 조합이 바뀐다", () => {
    const sets = new Set(Array.from({ length: 10 }, (_, i) => pickWeekly(`2026-W${30 + i}`, []).map((q) => q.id).join(",")));
    expect(sets.size).toBeGreaterThan(3);
  });

  it("다섯 대륙을 이미 다 연 사람에게 '대륙 열기'는 나오지 않는다", () => {
    const before = ["KR", "FR", "ET", "MX", "AU"].map((cc) => e(cc, MON - 30 * DAY));
    for (let i = 1; i <= 52; i++) expect(pickWeekly(`2026-W${i}`, before).map((q) => q.id)).not.toContain("new_continent");
    const seen = new Set(Array.from({ length: 52 }, (_, i) => pickWeekly(`2026-W${i + 1}`, []).map((q) => q.id)).flat());
    expect(seen.has("new_continent")).toBe(true);
  });

  it("주 중간에 대륙을 다 열어도 이번 주 퀘스트는 그대로 (주 시작 시점 기록으로 판단)", () => {
    const before = ["KR", "FR", "ET", "MX"].map((cc) => e(cc, MON - DAY));
    const now = [...before, e("AU", NOW)];
    const a = weeklyBoard(before, data(), NOW).quests.map((q) => q.id);
    expect(weeklyBoard(now, data(), NOW).quests.map((q) => q.id)).toEqual(a);
  });
});

describe("진행도", () => {
  const week = kstWeek(NOW);
  const ctx = (entries: QuestEntry[], counts = {}) => ({ entries, week, counts });

  it("새로운 나라: 이번 주에 '처음' 기록한 나라만", () => {
    const entries = [e("KR", MON - DAY), e("KR", NOW), e("JP", NOW), e("TH", MON), e("FR", MON + 7 * DAY)];
    expect(quest("new_countries").progress(ctx(entries))).toBe(2); // JP·TH (KR 은 지난주, FR 은 다음 주)
  });

  it("대륙 열기: 주 시작 때 0이던 대륙", () => {
    expect(quest("new_continent").progress(ctx([e("KR", MON - DAY), e("JP", NOW)]))).toBe(0);
    expect(quest("new_continent").progress(ctx([e("KR", MON - DAY), e("PE", NOW)]))).toBe(1);
  });

  it("태그 퀘스트 · 카운터 퀘스트", () => {
    const entries = [e("KR", NOW, ["fermented", "spicy"]), e("JP", NOW, ["soupy"]), e("ET", MON - DAY, ["fermented"])];
    expect(quest("fermented").progress(ctx(entries))).toBe(1);
    expect(quest("soupy").progress(ctx(entries))).toBe(1);
    expect(quest("voice_ask").progress(ctx([], { voice_ask: 2 }))).toBe(2);
    expect(quest("fermented").next(1)).toBe("발효 음식 1개 더");
  });

  it("보드: 목표에서 자르고, 지난주 카운터는 무시", () => {
    const b = weeklyBoard([], data({ week: "2026-W39", counts: { radio: 5, voice_ask: 9, tried: 4 } }), NOW);
    expect(b.week.key).toBe("2026-W40");
    expect(b.quests.every((q) => q.value === 0 && !q.done)).toBe(true);
    const c = weeklyBoard([], data({ week: "2026-W40", counts: { radio: 5, voice_ask: 9, tried: 4 } }), NOW);
    for (const q of c.quests) if (["radio", "voice_ask", "tried"].includes(q.id)) expect(q).toMatchObject({ value: q.target, done: true });
  });
});

// 어떤 3개가 뽑혀도 모두 끝나는 기록: 다섯 대륙 새 나라 · 발효+국물 · 카운터
const ALL = ["KR", "FR", "ET", "MX", "AU"].map((cc) => e(cc, MON + DAY, ["fermented", "soupy", "dumpling"], ["explored", "tried"]));
const ALL_COUNTS = { radio: 1, voice_ask: 3, tried: 1 };

describe("완료 기록 (settle)", () => {
  it("새로 끝난 퀘스트를 시각과 함께 기록하고, 다시 불러도 축하는 한 번", () => {
    const r = settle(data({ week: "2026-W40", counts: ALL_COUNTS }), ALL, NOW);
    expect(r.fresh.filter((f) => f.kind === "quest")).toHaveLength(3);
    expect(Object.values(r.data.done)).toEqual([NOW, NOW, NOW]);
    expect(r.data.cleared).toEqual(["2026-W40"]);
    const again = settle(r.data, ALL, NOW + 1000);
    expect(again.fresh).toEqual([]);
    expect(again.data).toBe(r.data);
  });

  it("완료 후 진행도가 줄어도(먹어봤어요 취소 등) 완료는 유지", () => {
    const r = settle(data({ week: "2026-W40", counts: ALL_COUNTS }), ALL, NOW);
    const b = weeklyBoard([], { ...r.data, counts: {} }, NOW + 1000);
    expect(b.doneCount).toBe(3);
    expect(b.quests[0].doneAt).toBe(NOW);
  });

  it("주가 바뀌면 카운터·완료를 비운다", () => {
    const r = settle(data({ week: "2026-W39", counts: ALL_COUNTS, done: { radio: 1 } }), [], NOW);
    expect(r.data).toMatchObject({ week: "2026-W40", counts: {}, done: {} });
    expect(bump(data({ week: "2026-W39", counts: { radio: 3 } }), "radio", NOW).counts).toEqual({ radio: 1 });
  });
});

describe("연속 기록 · 배지", () => {
  it("이번 주가 아직이면 지난주부터 센다, 한 주 빠지면 끊긴다", () => {
    expect(streak(["2026-W38", "2026-W39"], NOW)).toBe(2);
    expect(streak(["2026-W38", "2026-W39", "2026-W40"], NOW)).toBe(3);
    expect(streak(["2026-W37", "2026-W39"], NOW)).toBe(1);
    expect(streak(["2026-W38"], NOW)).toBe(0);
    expect(streak(["2026-W52", "2026-W53"], Date.parse("2027-01-05T09:00:00+09:00"))).toBe(2); // 연도 경계
  });

  it("이번 주를 끝내 2주 연속이 되면 배지", () => {
    const r = settle(data({ week: "2026-W40", counts: ALL_COUNTS, cleared: ["2026-W39"] }), ALL, NOW);
    expect(r.data.badges.streak_2).toBe(NOW);
    expect(r.data.badges.streak_4).toBeUndefined();
    expect(r.fresh.map((f) => f.title)).toContain("2주 연속");
  });

  it("탐험 마일스톤 · 만두 로드는 '먹어봤어요'만 센다", () => {
    const dumplings = ["CN", "JP", "NP"].map((cc) => e(cc, MON - DAY, ["dumpling"]));
    const shelf = (entries: QuestEntry[]) => Object.fromEntries(badgeShelf(entries, data(), NOW).map((b) => [b.id, b]));
    expect(shelf(dumplings).dumpling_road).toMatchObject({ value: 0, earnedAt: null });
    const tried = dumplings.map((x) => ({ ...x, statuses: ["explored", "tried"] as QuestEntry["statuses"] }));
    const r = settle(data(), tried, NOW);
    expect(Object.keys(r.data.badges).sort()).toEqual(["dumpling_road", "first"]);
    expect(shelf(ALL).continents).toMatchObject({ value: 5, target: 5 });
    expect(shelf(ALL).countries_10).toMatchObject({ value: 5, target: 10 });
  });

  it("받은 배지는 기록이 줄어도 유지", () => {
    const b = badgeShelf([], data({ badges: { countries_5: 123 } }), NOW).find((x) => x.id === "countries_5")!;
    expect(b).toMatchObject({ earnedAt: 123, value: 5 });
  });
});

describe("아이콘 · 문구 (디자인 v2)", () => {
  // 화면은 라인 아이콘만 쓴다 — 이모지가 데이터 문구에 섞여 들어오면 보상 칩·토스트에 그대로 찍힌다
  const EMOJI = /\p{Extended_Pictographic}/u;
  it("퀘스트·배지·축하는 아이콘 이름만 갖고, 문구엔 이모지가 없다", () => {
    for (const q of QUESTS) {
      expect(q.icon, q.id).toMatch(/^[a-z-]+$/);
      expect(EMOJI.test(q.title + q.reward + q.next(1)), q.id).toBe(false);
    }
    for (const b of BADGES) {
      expect(b.icon, b.id).toMatch(/^[a-z-]+$/);
      expect(EMOJI.test(b.name + b.hint), b.id).toBe(false);
    }
    const r = settle(data({ week: "2026-W40", counts: ALL_COUNTS }), ALL, NOW);
    for (const f of r.fresh) expect(f.icon).toMatch(/^[a-z-]+$/);
    expect(weeklyBoard([], data(), NOW).quests[0]).not.toHaveProperty("emoji");
  });
});

describe("대륙 표", () => {
  it("시드 150개국과 같다", () => {
    expect(Object.keys(CONTINENT_OF)).toHaveLength(PREVIEW_COUNTRIES.length);
    for (const c of PREVIEW_COUNTRIES) expect(CONTINENT_OF[c.code], c.code).toBe(c.continent_group);
  });
});
