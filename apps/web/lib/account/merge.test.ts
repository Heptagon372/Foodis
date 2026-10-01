import { describe, expect, it } from "vitest";
import { computeDna, mergeEntries, mergePrefs, SyncRequest, type EntryMap, type Status } from "./merge";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const map = (o: Record<string, [Status[], number]>): EntryMap => new Map(Object.entries(o).map(([k, [s, at]]) => [k, { statuses: new Set(s), at }]));
const plain = (m: EntryMap) => Object.fromEntries([...m].map(([k, v]) => [k, [[...v.statuses].sort(), v.at]]));

describe("account merge", () => {
  it("merge: 이 기기 ∪ 계정, 가장 이른 시각 유지", () => {
    const server = map({ [A]: [["explored", "liked"], 100] });
    const { next, touched } = mergeEntries("merge", server, [
      { food_id: A, statuses: ["explored", "tried"], at: 50 },
      { food_id: B, statuses: ["explored"], at: 70 },
    ]);
    expect(plain(next)).toEqual({ [A]: [["explored", "liked", "tried"], 50], [B]: [["explored"], 70] });
    expect(touched).toEqual([A, B]);
  });

  it("push: 보낸 음식만 그대로 덮어쓰고(좋아요 취소 반영) 안 보낸 음식은 둔다", () => {
    const server = map({ [A]: [["explored", "liked"], 100], [B]: [["explored", "saved"], 90] });
    const { next, touched } = mergeEntries("push", server, [{ food_id: A, statuses: ["explored"], at: 100 }]);
    expect(plain(next)).toEqual({ [A]: [["explored"], 100], [B]: [["explored", "saved"], 90] });
    expect(touched).toEqual([A]);
  });

  it("상태가 같으면 쓰지 않는다 · explored 는 항상 남는다", () => {
    const server = map({ [A]: [["explored", "liked"], 100] });
    expect(mergeEntries("push", server, [{ food_id: A, statuses: ["liked", "explored"], at: 100 }]).touched).toEqual([]);
    expect(plain(mergeEntries("push", new Map(), [{ food_id: B, statuses: ["liked"], at: 5 }]).next)[B][0]).toEqual(["explored", "liked"]);
  });

  it("식이 조건: 처음 합칠 때는 합집합(더 엄격한 쪽), 그 뒤엔 보낸 값", () => {
    const server = { diet: ["halal" as const], allergens: ["nuts" as const], tastes: ["spicy"], onboarded: true };
    const local = { diet: ["vegan" as const], allergens: [], tastes: ["sweet"], onboarded: false };
    expect(mergePrefs("merge", server, local)).toEqual({ diet: ["halal", "vegan"], allergens: ["nuts"], tastes: ["sweet", "spicy"], onboarded: true });
    expect(mergePrefs("push", server, local)).toEqual(local);
    expect(mergePrefs("push", server, undefined)).toEqual(server);
  });

  it("Food DNA 는 클라이언트와 같은 가중치 (좋아요 2 · 먹어봤어요 1.5 · 탐험 1 · 온보딩 취향 1)", () => {
    const e = map({ [A]: [["explored", "liked"], 1], [B]: [["explored", "tried"], 2] });
    const tags: Record<string, string[]> = { [A]: ["spicy", "soupy"], [B]: ["spicy"] };
    expect(computeDna(e, (id) => tags[id], ["sweet"])).toEqual({ sweet: 1, spicy: 3.5, soupy: 2 });
  });

  it("요청 검증: uuid 가 아닌 id · 알 수 없는 상태는 거절", () => {
    expect(SyncRequest.safeParse({ mode: "push", entries: [{ food_id: "kimchi", statuses: ["explored"], at: 1 }] }).success).toBe(false);
    expect(SyncRequest.safeParse({ mode: "push", entries: [{ food_id: A, statuses: ["hacked"], at: 1 }] }).success).toBe(false);
    expect(SyncRequest.safeParse({ mode: "merge", entries: [{ food_id: A, statuses: ["liked"], at: 1 }] }).success).toBe(true);
  });
});
