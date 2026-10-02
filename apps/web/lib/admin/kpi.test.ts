import { describe, expect, it } from "vitest";
import { acceptance, computeKpis, d7Retention, firstExplores, hops, latency, normalize, northStar, percentile, sessionHops, startOfDay, voiceRate, type EventRow } from "./kpi";

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 0, 0, 0); // 2026-09-01 09:00 KST (화)

const ev = (min: number, name: string, props: Record<string, unknown> = {}, o: { anon?: string; session?: string | null } = {}): EventRow => ({
  at: new Date(T0 + min * MIN).toISOString(),
  anon_id: o.anon ?? "a1",
  session_id: o.session === undefined ? "s1" : o.session,
  name,
  props,
});
const dv = (min: number, food: string, o?: { anon?: string; session?: string | null }) => ev(min, "detail_view", { food_id: food }, o);
const ask = (min: number, props: Record<string, unknown>, o?: { anon?: string; session?: string | null }) => ev(min, "ask", props, o);
const n = (rows: EventRow[]) => normalize(rows);

describe("percentile (nearest-rank)", () => {
  it("빈 배열은 null, 정렬과 무관", () => {
    expect(percentile([], 0.95)).toBeNull();
    expect(percentile([3000], 0.95)).toBe(3000);
    expect(percentile([5, 1, 4, 2, 3], 0.5)).toBe(3);
  });
  it("p95: 20개면 19번째, 100개면 95번째", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(twenty, 0.95)).toBe(19);
    const hundred = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);
    expect(percentile(hundred, 0.95)).toBe(950);
  });
});

describe("Hops (상세 → 상세 연속 이동)", () => {
  it("한 세션 안 연속 상세 3개 = 2 hops", () => {
    expect(sessionHops(n([dv(0, "a"), dv(1, "b"), dv(2, "c")]))).toEqual([2]);
  });
  it("10분 넘게 끊기면 새 줄기 — 세션 값은 가장 긴 줄기", () => {
    // a→b (1 hop) · 15분 쉼 · c→d→e→f (3 hops)
    expect(sessionHops(n([dv(0, "a"), dv(1, "b"), dv(16, "c"), dv(17, "d"), dv(18, "e"), dv(27, "f")]))).toEqual([3]);
    // 정확히 10분은 이어진 것으로
    expect(sessionHops(n([dv(0, "a"), dv(10, "b")]))).toEqual([1]);
    expect(sessionHops(n([dv(0, "a"), dv(10.01, "b")]))).toEqual([0]);
  });
  it("같은 음식 연속(새로고침·이중 실행)은 이동이 아니다. 다시 돌아온 건 이동", () => {
    expect(sessionHops(n([dv(0, "a"), dv(0, "a"), dv(1, "b"), dv(1, "b"), dv(2, "a")]))).toEqual([2]);
  });
  it("세션별로 따로 · 상세가 없는 세션은 빠진다 · 다른 이벤트는 줄기를 끊지 않는다", () => {
    const rows = [dv(0, "a"), ask(1, { mode: "voice" }), dv(2, "b"), dv(0, "x", { session: "s2" }), ev(0, "ask", {}, { session: "s3" })];
    expect(sessionHops(n(rows)).sort()).toEqual([0, 1]);
    expect(hops(n(rows))).toEqual({ avg: 0.5, max: 1, sessions: 2 });
  });
  it("세션 id 가 없으면 anon_id 로 묶는다", () => {
    expect(sessionHops(n([dv(0, "a", { session: null }), dv(1, "b", { session: null })]))).toEqual([1]);
  });
  it("데이터가 없으면 null", () => {
    expect(hops([])).toEqual({ avg: null, max: null, sessions: 0 });
  });
});

describe("음성 사용률", () => {
  it("음성 / 전체 질의", () => {
    const r = voiceRate(n([ask(0, { mode: "voice" }), ask(1, { mode: "text" }), ask(2, { mode: "voice", error: true }), ev(3, "detail_view")]));
    expect(r).toEqual({ rate: 2 / 3, voice: 2, total: 3 });
  });
  it("질의가 없으면 null", () => {
    expect(voiceRate([]).rate).toBeNull();
  });
});

describe("추천 수락률", () => {
  it("보여준 카드 중 상세 진입·좋아요로 이어진 비율 (같은 음식은 한 번)", () => {
    const rows = [
      ask(0, { mode: "voice", cards: 3, card_ids: ["f1", "f2", "f3"] }),
      ev(1, "rec_accept", { food_id: "f1", via: "open" }),
      ev(2, "rec_accept", { food_id: "f1", via: "like" }),
      ask(3, { mode: "text", cards: 2, card_ids: ["f3", "f4"] }), // f3 은 이미 보여준 카드
      ev(4, "rec_accept", { food_id: "f4", via: "open" }),
    ];
    expect(acceptance(n(rows))).toEqual({ rate: 2 / 4, accepted: 2, shown: 4 });
  });
  it("보여주기 전·다른 세션·추천에 없던 음식의 수락은 세지 않는다", () => {
    const rows = [
      ev(0, "rec_accept", { food_id: "f1" }),
      ask(1, { cards: 1, card_ids: ["f1"] }),
      ev(2, "rec_accept", { food_id: "f1" }, { session: "s2" }),
      ev(3, "rec_accept", { food_id: "zz" }),
    ];
    expect(acceptance(n(rows))).toEqual({ rate: 0, accepted: 0, shown: 1 });
  });
  it("card_ids 가 없는 질의는 cards 개수만 분모에", () => {
    expect(acceptance(n([ask(0, { cards: 2 }), ask(1, { cards: 1, card_ids: ["f1"] }), ev(2, "rec_accept", { food_id: "f1" })]))).toEqual({ rate: 1 / 3, accepted: 1, shown: 3 });
  });
  it("카드가 없으면 null", () => {
    expect(acceptance(n([ask(0, { cards: 0, card_ids: [] })])).rate).toBeNull();
  });
});

describe("음성 응답 지연", () => {
  it("first_audio_ms p95 는 음성 질의만, latency_ms p95 는 전체", () => {
    const rows = [
      ...Array.from({ length: 19 }, (_, i) => ask(i, { mode: "voice", first_audio_ms: 1000 + i * 100, latency_ms: 500 })),
      ask(30, { mode: "voice", first_audio_ms: 9000, latency_ms: 500 }),
      ask(31, { mode: "text", first_audio_ms: 99_999, latency_ms: 8000 }),
      ask(32, { mode: "voice" }), // 음성을 끈 경우 — 측정값 없음
    ];
    const l = latency(n(rows));
    expect(l.firstAudioN).toBe(20);
    expect(l.firstAudioP95).toBe(2800); // 20개 중 19번째 (9000 은 상위 5%)
    expect(l.responseN).toBe(21);
    expect(l.responseP95).toBe(500);
  });
});

describe("North Star (주간 신규 탐험 국가 / 활성 사용자)", () => {
  it("사용자·나라 쌍마다 처음 한 번만", () => {
    const rows = [ev(0, "explore_country", { country: "KR" }), ev(1, "explore_country", { country: "KR" }), ev(2, "explore_country", { country: "KR" }, { anon: "a2" }), ev(3, "explore_country", {})];
    expect(firstExplores(n(rows))).toHaveLength(2);
  });
  it("주마다 (새 나라 / 활성 사용자) 의 평균 — 7일 안 되는 마지막 조각은 제외", () => {
    const W = 7 * 24 * 60;
    const rows = [
      // 1주차: a1 이 4개국, a2 는 방문만 → 4/2 = 2
      ...["KR", "JP", "ET", "MX"].map((c, i) => ev(i, "explore_country", { country: c })),
      ev(5, "session_start", {}, { anon: "a2", session: "x" }),
      // 2주차: a1 이 4개국 → 4/1 = 4
      ...["IT", "FR", "IN", "TH"].map((c, i) => ev(W + i, "explore_country", { country: c })),
      // 3주차(2일만): 제외
      ev(2 * W + 10, "explore_country", { country: "VN" }),
    ];
    const ns = northStar(n(rows), T0, T0 + 16 * DAY);
    expect(ns.weeks.map((w) => [w.newCountries, w.active])).toEqual([
      [4, 2],
      [4, 1],
    ]);
    expect(ns.value).toBe(3);
    expect(ns.partial).toBe(false);
  });
  it("기간이 7일 미만이면 그 조각으로 계산하고 partial 표시", () => {
    const ns = northStar(n([ev(0, "explore_country", { country: "KR" }), ev(1, "explore_country", { country: "JP" })]), T0, T0 + 3 * DAY);
    expect(ns).toMatchObject({ value: 2, partial: true });
  });
  it("활성 사용자가 없으면 null", () => {
    expect(northStar([], T0, T0 + 7 * DAY).value).toBeNull();
  });
});

describe("D7 재방문", () => {
  it("7일 지난 사용자 중 7~13일차에 다시 온 비율", () => {
    const rows = [
      ev(0, "session_start", {}, { anon: "a1" }),
      ev(8 * 24 * 60, "session_start", {}, { anon: "a1" }), // 8일차 재방문
      ev(0, "session_start", {}, { anon: "a2" }),
      ev(3 * 24 * 60, "session_start", {}, { anon: "a2" }), // 3일차만 — 미재방문
      ev(15 * 24 * 60, "session_start", {}, { anon: "a2" }), // 15일차 — 창 밖
      ev(10 * 24 * 60, "session_start", {}, { anon: "a3" }), // 아직 7일 안 지남 → 코호트 아님
    ];
    expect(d7Retention(n(rows), T0 + 16 * DAY)).toEqual({ rate: 0.5, cohort: 2, retained: 1 });
  });
});

describe("computeKpis", () => {
  const rows = [
    ev(0, "session_start"),
    ask(1, { mode: "voice", intent: "recommend", cards: 2, card_ids: ["f1", "f2"], latency_ms: 1200, first_audio_ms: 2100 }),
    ev(2, "rec_accept", { food_id: "f1", via: "open" }),
    dv(2, "f1"),
    dv(3, "f9"),
    dv(4, "f8"),
    ev(2, "explore_country", { country: "KR" }),
    // 다음날(KST) 다른 사용자
    ev(24 * 60, "session_start", {}, { anon: "a2", session: "s9" }),
    ask(24 * 60 + 1, { mode: "text", cards: 1, card_ids: ["f3"] }, { anon: "a2", session: "s9" }),
    // 기간 밖
    ask(-60, { mode: "text" }),
  ];
  it("기간 안 이벤트로 전체 지표 + 일별 막대", () => {
    const k = computeKpis(rows, { from: T0, to: T0 + 3 * DAY });
    expect(k.events).toBe(9);
    expect(k.activeUsers).toBe(2);
    expect(k.sessions).toBe(2);
    expect(k.voice).toEqual({ rate: 0.5, voice: 1, total: 2 });
    expect(k.accept).toEqual({ rate: 1 / 3, accepted: 1, shown: 3 });
    expect(k.hops).toEqual({ avg: 2, max: 2, sessions: 1 });
    expect(k.latency.firstAudioP95).toBe(2100);
    expect(k.newCountries).toBe(1);
    expect(k.northStar).toMatchObject({ value: 0.5, partial: true });
    // 2026-09-01 09:00 KST 시작 → 일별 버킷은 KST 0시 기준 (9/1, 9/2, 9/3, 9/4)
    expect(k.daily.map((d) => d.day)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(k.daily.map((d) => [d.active, d.asks, d.newCountries])).toEqual([
      [1, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(k.daily[0]).toMatchObject({ voiceRate: 1, hopsAvg: 2, acceptRate: 0.5, firstAudioP95: 2100 });
    expect(k.daily[1]).toMatchObject({ voiceRate: 0, hopsAvg: null, acceptRate: 0 });
  });
  it("from 이 없으면(베타 전체) 첫 이벤트 날 0시(KST)부터", () => {
    const k = computeKpis(rows, { to: T0 + 2 * DAY });
    expect(k.from).toBe(startOfDay(T0 - 60 * MIN, 540));
    expect(new Date(k.from).toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(k.events).toBe(10);
    expect(k.voice.total).toBe(3);
  });
  it("이벤트가 없어도 깨지지 않는다", () => {
    const k = computeKpis([], { from: T0, to: T0 + 7 * DAY });
    expect(k.activeUsers).toBe(0);
    expect(k.voice.rate).toBeNull();
    expect(k.northStar.value).toBeNull();
    expect(k.daily).toHaveLength(8);
  });
});
