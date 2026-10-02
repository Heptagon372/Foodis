import { describe, expect, it } from "vitest";
import { buildProfile, decay, fameScore, rankFoods, signatureGate, type RankFood, type Signal } from "./engine";

const CONT: Record<string, string> = { KR: "asia", JP: "asia", TH: "asia", IT: "europe", FR: "europe", MX: "americas", ET: "mena_africa" };
const cont = (cc: string) => CONT[cc];
const NOW = Date.UTC(2026, 9, 2);
const DAY = 86_400_000;

let n = 0;
const food = (cc: string, fame: number, tags: string[] = [], slug?: string): RankFood => {
  n += 1;
  return { id: `id-${n}`, slug: slug ?? `${cc.toLowerCase()}-${fame}`, name_ko: `${cc}${fame}`, country_code: cc, country_name: cc, taste_tags: tags, fame_rank: fame };
};
const FOODS: RankFood[] = [
  ...[1, 2, 3, 4, 5, 6].map((r) => food("KR", r, r % 2 ? ["spicy", "fermented"] : ["soupy"])),
  ...[1, 2, 3, 4, 5].map((r) => food("JP", r, ["noodle", "soupy"])),
  ...[1, 2, 3, 4].map((r) => food("TH", r, ["spicy", "sour"])),
  ...[1, 2, 3, 4].map((r) => food("IT", r, ["bread", "dairy"])),
  ...[1, 2, 3].map((r) => food("FR", r, ["dairy", "rich"])),
  ...[1, 2, 3].map((r) => food("MX", r, ["spicy", "meat"])),
  ...[1, 2].map((r) => food("ET", r, ["fermented", "bread"])),
];
const bySlug = new Map(FOODS.map((f) => [f.slug, f]));
const sig = (k: Signal["k"], slug: string, daysAgo = 0, extra: Partial<Signal> = {}): Signal => {
  const f = bySlug.get(slug)!;
  return { k, t: NOW - daysAgo * DAY, slug, cc: f.country_code, tags: f.taste_tags, ...extra };
};

describe("취향 엔진 v1", () => {
  it("처음(신호 0): 확신도 0, 나라마다 1위 대표 음식만 — 같은 나라 2개 없음", () => {
    const p = buildProfile([], {}, cont, NOW);
    expect(p.confidence).toBe(0);
    const recs = rankFoods(FOODS, p, cont, { limit: 6 });
    expect(recs).toHaveLength(6);
    expect(recs.every((r) => r.food.fame_rank === 1)).toBe(true);
    expect(new Set(recs.map((r) => r.food.country_code)).size).toBe(6);
    expect(recs[0].reason).toMatch(/대표 음식/);
  });

  it("대표 음식 우선 규칙: 그 나라 음식을 2개 보기 전엔 상위 3위까지만", () => {
    const p0 = buildProfile([], {}, cont, NOW);
    expect(signatureGate(bySlug.get("kr-4")!, p0)).toBe(false);
    expect(signatureGate(bySlug.get("kr-3")!, p0)).toBe(true);
    const p2 = buildProfile([sig("view", "kr-1"), sig("view", "kr-2")], {}, cont, NOW);
    expect(signatureGate(bySlug.get("kr-4")!, p2)).toBe(true);
    // 신호가 아무리 많아도 안 본 나라의 4위 이하는 안 나온다
    const heavy = buildProfile(Array.from({ length: 30 }, () => sig("like", "th-1")), {}, cont, NOW);
    const recs = rankFoods(FOODS, heavy, cont, { limit: 20 });
    expect(recs.some((r) => r.food.country_code === "KR" && (r.food.fame_rank ?? 0) > 3)).toBe(false);
  });

  it("신호가 쌓이면 취향(매운맛·발효)이 순위를 끈다 · 이미 본 음식은 빠진다", () => {
    const signals = [
      ...["kr-1", "kr-3", "th-1", "mx-1"].flatMap((s) => [sig("view", s), sig("like", s), sig("dwell", s, 0, { ms: 45_000 })]),
      sig("ask", "kr-5"),
    ];
    const p = buildProfile(signals, {}, cont, NOW);
    expect(p.confidence).toBeGreaterThan(0.8);
    expect(Object.keys(p.tags)[0]).toBeDefined();
    expect(p.tags.spicy).toBe(1);
    const recs = rankFoods(FOODS, p, cont, { limit: 5 });
    expect(recs.some((r) => ["kr-1", "kr-3", "th-1", "mx-1"].includes(r.food.slug))).toBe(false);
    const spicyShare = recs.filter((r) => r.food.taste_tags.includes("spicy")).length / recs.length;
    expect(spicyShare).toBeGreaterThanOrEqual(0.6);
    expect(recs.some((r) => /좋아하는 매운맛|자주 본/.test(r.reason))).toBe(true);
  });

  it("한 대륙이 목록을 독차지하지 않는다 (6개 중 같은 대륙 최대 2개)", () => {
    const recs = rankFoods(FOODS, buildProfile([sig("view", "kr-1")], {}, cont, NOW), cont, { limit: 6 });
    const byCont: Record<string, number> = {};
    for (const r of recs) byCont[cont(r.food.country_code)] = (byCont[cont(r.food.country_code)] ?? 0) + 1;
    expect(Math.max(...Object.values(byCont))).toBeLessThanOrEqual(2);
    expect(recs).toHaveLength(6);
  });

  it("안 가본 대륙 한 자리는 남겨 둔다", () => {
    const signals = ["kr-1", "kr-2", "jp-1", "jp-2", "th-1"].flatMap((s) => [sig("view", s), sig("like", s)]);
    const recs = rankFoods(FOODS, buildProfile(signals, {}, cont, NOW), cont, { limit: 4 });
    expect(recs.some((r) => cont(r.food.country_code) !== "asia")).toBe(true);
  });

  it("시간 감쇠: 21일 전 신호는 절반 · 지나친 추천은 순위가 내려간다", () => {
    expect(decay(NOW - 21 * DAY, NOW)).toBeCloseTo(0.5, 5);
    const p = buildProfile([], {}, cont, NOW);
    const base = rankFoods(FOODS, p, cont, { limit: 6 }).map((r) => r.food.slug);
    const ignored = Object.fromEntries(base.slice(0, 1).map((s) => [s, 10]));
    const after = rankFoods(FOODS, p, cont, { limit: 6, ignored }).map((r) => r.food.slug);
    expect(after.indexOf(base[0])).not.toBe(0);
  });

  it("짧게 본 상세(10초 미만)는 신호가 아니다 · 기능 사용은 많이 쓴 순", () => {
    const p = buildProfile([sig("dwell", "kr-1", 0, { ms: 4000 })], { radio: { n: 5, last: NOW }, map: { n: 2, last: NOW } }, cont, NOW);
    expect(p.signalCount).toBe(0);
    expect(p.features.map((f) => f.name)).toEqual(["radio", "map"]);
  });

  it("유명도 점수: 1위 1 → 순위 정보 없으면 낮게", () => {
    expect(fameScore(1)).toBe(1);
    expect(fameScore(4)).toBeCloseTo(0.5, 5);
    expect(fameScore(null)).toBeLessThan(fameScore(10));
  });
});
