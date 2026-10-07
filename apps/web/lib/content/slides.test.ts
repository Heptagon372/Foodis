import { describe, expect, it } from "vitest";
import { pickSlides } from "./slides";
import type { FoodSummary } from "./types";

const food = (slug: string, cc: string, img: string | null) => ({ id: slug, slug, name_ko: slug, name_en: slug, country_code: cc, flag: "🏳️", accent: "#000", country_name: cc, summary: null, taste_tags: [], image_url: img, image_credit: null, diet: {}, allergens: [] }) as unknown as FoodSummary;

describe("pickSlides", () => {
  const foods = [food("a", "KR", "x"), food("b", "KR", "x"), food("c", "JP", "x"), food("d", "IT", null), food("e", "FR", "x"), food("f", "MX", "x")];

  it("사진 있는 음식만, 나라는 겹치지 않게, n 개까지", () => {
    const out = pickSlides(foods, 3);
    expect(out).toHaveLength(3);
    expect(out.every((f) => f.image_url)).toBe(true);
    expect(new Set(out.map((f) => f.country_code)).size).toBe(3);
    expect(out.some((f) => f.slug === "d")).toBe(false);
  });

  it("나라 수보다 많이 달라면 있는 만큼만", () => {
    expect(pickSlides(foods, 10)).toHaveLength(4); // KR · JP · FR · MX (IT 는 사진 없음)
  });

  it("뽑을 때마다 순서가 달라진다 (난수 주입)", () => {
    const seq = (vals: number[]) => {
      let i = 0;
      return () => vals[i++ % vals.length];
    };
    const one = pickSlides(foods, 4, seq([0.1, 0.9, 0.3])).map((f) => f.slug).join();
    const two = pickSlides(foods, 4, seq([0.8, 0.2, 0.6])).map((f) => f.slug).join();
    expect(one).not.toBe(two);
  });
});
