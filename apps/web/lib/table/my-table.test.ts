import { describe, expect, it } from "vitest";
import type { PassportEntry } from "@/lib/client/passport";
import { DEFAULT_ACCENT, MAX_PLATES, foodGlyph, setTable, tableLayout } from "./my-table";

// 화면 식탁(88×118)과 이미지 저장 식탁(848×772) 비율 + 극단 비율
const TABLES: [number, number][] = [
  [88, 118],
  [848, 772],
  [100, 100],
  [300, 80],
];

describe("tableLayout", () => {
  for (const [w, h] of TABLES) {
    it(`${w}×${h}: 1~60개 접시가 겹치지 않고 식탁 안에 놓인다`, () => {
      for (let n = 1; n <= MAX_PLATES; n++) {
        const { r, plates } = tableLayout(n, w, h);
        expect(plates).toHaveLength(n);
        expect(r).toBeGreaterThan(0);
        for (const p of plates) {
          expect(p.x - r).toBeGreaterThanOrEqual(-1e-9);
          expect(p.x + r).toBeLessThanOrEqual(w + 1e-9);
          expect(p.y - r).toBeGreaterThanOrEqual(-1e-9);
          expect(p.y + r).toBeLessThanOrEqual(h + 1e-9);
        }
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) expect(Math.hypot(plates[i].x - plates[j].x, plates[i].y - plates[j].y)).toBeGreaterThanOrEqual(2 * r - 1e-9);
      }
    });
  }

  it("접시가 많을수록 작아지고(단조), 60개여도 화면 폭의 1/10 이상", () => {
    let prev = Infinity;
    for (let n = 1; n <= MAX_PLATES; n++) {
      const { r } = tableLayout(n, 88, 118);
      expect(r).toBeLessThanOrEqual(prev + 1e-9);
      prev = r;
    }
    expect((2 * prev) / 88).toBeGreaterThan(0.1);
  });

  it("적을 때는 가운데에 · 0개는 빈 배치", () => {
    expect(tableLayout(0, 88, 118)).toEqual({ r: 0, plates: [] });
    const one = tableLayout(1, 88, 118);
    expect(one.plates[0]).toEqual({ x: 44, y: 59 });
    expect(one.r).toBeCloseTo(88 * 0.17);
    // 3개는 2 + 1 삼각형
    const three = tableLayout(3, 88, 118).plates;
    expect(three[0].y).toBe(three[1].y);
    expect(three[2].x).toBeCloseTo(44);
  });
});

const entry = (o: Partial<PassportEntry>): PassportEntry => ({ slug: "kimchi", name_ko: "김치", flag: "🇰🇷", cc: "KR", tags: ["fermented"], statuses: ["explored"], at: 1, ...o });

describe("setTable", () => {
  const foods = [{ id: "a", slug: "kimchi", image_url: "https://x/kimchi.jpg", image_credit: "A / CC BY / https://x", accent: "#C8102E", country_name: "대한민국" }];
  const countries = [{ code: "KR", name_ko: "대한민국", flag: "🇰🇷", accent: "#C8102E", continent: "asia" }];

  it("탐험한 순서로, 사진·국가색은 조회표에서 · 없는 id 는 slug 로 다시 찾는다", () => {
    const { plates, hidden } = setTable({ b: entry({ at: 5, slug: "mandu", name_ko: "만두", tags: ["dumpling"] }), old: entry({ at: 2 }) }, foods, countries);
    expect(hidden).toBe(0);
    expect(plates.map((p) => p.name)).toEqual(["김치", "만두"]);
    expect(plates[0]).toMatchObject({ id: "old", image: "https://x/kimchi.jpg", accent: "#C8102E", continent: "asia", glyph: "🫙" });
    // 조회표에 없는 음식도 국기 + 국가색으로
    expect(plates[1]).toMatchObject({ image: null, accent: "#C8102E", country: "대한민국", glyph: "🥟" });
  });

  it("나라도 모르면 기본 색 · 넘치면 최근 것만", () => {
    const { plates } = setTable({ z: entry({ cc: "ZZ", flag: "", slug: "zz" }) }, [], []);
    expect(plates[0]).toMatchObject({ accent: DEFAULT_ACCENT, continent: null, flag: "🏳️" });
    const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`f${i}`, entry({ at: i, slug: `s${i}` })]));
    const r = setTable(many, [], countries);
    expect(r.hidden).toBe(5);
    expect(r.plates).toHaveLength(MAX_PLATES);
    expect(r.plates[0].id).toBe("f5");
  });

  it("음식 모양: 앞선 태그 우선 · 없으면 접시", () => {
    expect(foodGlyph(["spicy", "soupy", "noodle"])).toBe("🍜");
    expect(foodGlyph(["spicy"])).toBe("🍽️");
  });
});
