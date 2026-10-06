import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedContent, invalidateContent } from "./cache";
import type { ContentSource, FoodSummary } from "./types";

const food = { id: "1", slug: "kimchi" } as FoodSummary;

function source(listFoods: () => Promise<FoodSummary[]>) {
  const src = {
    mode: "live",
    listFoods: vi.fn(listFoods),
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
    expect(await cached.listFoods()).toEqual([food]);
    expect(await cached.listFoods()).toEqual([food]);
    await cached.countFoods();
    await cached.countFoods();
    expect(src.listFoods).toHaveBeenCalledTimes(1);
    expect(src.countFoods).toHaveBeenCalledTimes(1);
  });

  it("같은 순간 들어온 요청은 진행 중인 조회를 함께 기다린다", async () => {
    const { src, cached } = source(() => new Promise((r) => setTimeout(() => r([food]), 50)));
    const a = cached.listFoods();
    const b = cached.listFoods();
    await vi.advanceTimersByTimeAsync(50);
    expect(await a).toBe(await b);
    expect(src.listFoods).toHaveBeenCalledTimes(1);
  });

  it("5분이 지나면 다시 조회한다", async () => {
    const { src, cached } = source(async () => [food]);
    await cached.listFoods();
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    await cached.listFoods();
    expect(src.listFoods).toHaveBeenCalledTimes(2);
  });

  it("실패한 조회는 캐시에 남기지 않는다", async () => {
    let fail = true;
    const { src, cached } = source(async () => {
      if (fail) throw new Error("db down");
      return [food];
    });
    await expect(cached.listFoods()).rejects.toThrow("db down");
    fail = false;
    expect(await cached.listFoods()).toEqual([food]);
    expect(src.listFoods).toHaveBeenCalledTimes(2);
  });

  it("invalidateContent 뒤에는 다시 조회한다 · 단건 조회는 캐시하지 않는다", async () => {
    const { src, cached } = source(async () => [food]);
    await cached.listFoods();
    invalidateContent();
    await cached.listFoods();
    expect(src.listFoods).toHaveBeenCalledTimes(2);
    await cached.getFood("kimchi");
    await cached.getFood("kimchi");
    expect(src.getFood).toHaveBeenCalledTimes(2);
  });
});
