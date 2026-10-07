import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedContent, invalidateContent } from "./cache";
import type { ContentSource, FoodSummary } from "./types";

const food = { id: "1", slug: "kimchi" } as FoodSummary;
const TOP = { perCountry: 6 };

function source(topFoods: () => Promise<FoodSummary[]>) {
  const src = {
    mode: "live",
    topFoods: vi.fn(topFoods),
    searchFoods: vi.fn(async () => [food]),
    foodsByKeys: vi.fn(async () => [food]),
    listCountries: vi.fn(async () => []),
    countFoods: vi.fn(async () => 1),
    getFood: vi.fn(async () => null),
    getCountry: vi.fn(async () => null),
    getIngredient: vi.fn(async () => null),
  };
  return { src, cached: cachedContent(src as unknown as ContentSource) };
}

describe("cachedContent", () => {
  beforeEach(() => {
    invalidateContent();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("목록 조회는 한 번만 하고 5분 안에는 재사용한다", async () => {
    const { src, cached } = source(async () => [food]);
    expect(await cached.topFoods(TOP)).toEqual([food]);
    expect(await cached.topFoods(TOP)).toEqual([food]);
    await cached.countFoods();
    await cached.countFoods();
    expect(src.topFoods).toHaveBeenCalledTimes(1);
    expect(src.countFoods).toHaveBeenCalledTimes(1);
  });

  it("같은 순간 들어온 요청은 진행 중인 조회를 함께 기다린다", async () => {
    const { src, cached } = source(() => new Promise((r) => setTimeout(() => r([food]), 50)));
    const a = cached.topFoods(TOP);
    const b = cached.topFoods(TOP);
    await vi.advanceTimersByTimeAsync(50);
    expect(await a).toBe(await b);
    expect(src.topFoods).toHaveBeenCalledTimes(1);
  });

  it("5분이 지나면 지난 값을 바로 주고 뒤에서 한 번만 다시 조회한다", async () => {
    const fresh = { id: "2", slug: "bibimbap" } as FoodSummary;
    let n = 0;
    const { src, cached } = source(() => new Promise((r) => setTimeout(() => r(n++ ? [fresh] : [food]), 50)));
    const first = cached.topFoods(TOP);
    await vi.advanceTimersByTimeAsync(50);
    expect(await first).toEqual([food]);
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    // 기다리지 않고 지난 값 — 같은 순간 여러 요청이 와도 다시 조회는 한 번
    expect(await cached.topFoods(TOP)).toEqual([food]);
    expect(await cached.topFoods(TOP)).toEqual([food]);
    expect(src.topFoods).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(50);
    expect(await cached.topFoods(TOP)).toEqual([fresh]);
    expect(src.topFoods).toHaveBeenCalledTimes(2);
  });

  it("뒤에서 다시 받다 실패하면 지난 값을 계속 쓰고 다음 요청이 다시 시도한다", async () => {
    let fail = false;
    const { src, cached } = source(async () => {
      if (fail) throw new Error("db down");
      return [food];
    });
    await cached.topFoods(TOP);
    fail = true;
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    expect(await cached.topFoods(TOP)).toEqual([food]);
    await vi.advanceTimersByTimeAsync(0);
    fail = false;
    expect(await cached.topFoods(TOP)).toEqual([food]);
    expect(src.topFoods).toHaveBeenCalledTimes(3);
  });

  it("실패한 조회는 캐시에 남기지 않는다", async () => {
    let fail = true;
    const { src, cached } = source(async () => {
      if (fail) throw new Error("db down");
      return [food];
    });
    await expect(cached.topFoods(TOP)).rejects.toThrow("db down");
    fail = false;
    expect(await cached.topFoods(TOP)).toEqual([food]);
    expect(src.topFoods).toHaveBeenCalledTimes(2);
  });

  it("invalidateContent 뒤에는 다시 조회한다 · 단건 조회는 캐시하지 않는다", async () => {
    const { src, cached } = source(async () => [food]);
    await cached.topFoods(TOP);
    invalidateContent();
    await cached.topFoods(TOP);
    expect(src.topFoods).toHaveBeenCalledTimes(2);
    await cached.getFood("kimchi");
    await cached.getFood("kimchi");
    expect(src.getFood).toHaveBeenCalledTimes(2);
  });

  it("나라별 대표 음식은 개수·대륙마다 따로 캐시하고, 검색·키 조회는 캐시하지 않는다", async () => {
    const { src, cached } = source(async () => [food]);
    await cached.topFoods({ perCountry: 6 });
    await cached.topFoods({ perCountry: 6 });
    await cached.topFoods({ perCountry: 4 });
    await cached.topFoods({ perCountry: 4, continent: "asia" });
    expect(src.topFoods).toHaveBeenCalledTimes(3);
    await cached.searchFoods("김치", 10);
    await cached.searchFoods("김치", 10);
    await cached.foodsByKeys(["kimchi"]);
    await cached.foodsByKeys(["kimchi"]);
    expect(src.searchFoods).toHaveBeenCalledTimes(2);
    expect(src.foodsByKeys).toHaveBeenCalledTimes(2);
  });
});
