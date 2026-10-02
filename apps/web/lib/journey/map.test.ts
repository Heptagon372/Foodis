import { describe, expect, it } from "vitest";
import { buildWorldMap } from "@/lib/map/world";
import { buildJourneyMap, countryLonLat, countryPath } from "./map";

const inside = ([x, y]: [number, number], [bx, by, bw, bh]: number[]) => x >= bx && x <= bx + bw && y >= by && y <= by + bh;

describe("Food Journey 지도", () => {
  it("세계 지도와 같은 투영 — 나라 경로가 글자 하나까지 같다", () => {
    const world = new Map(buildWorldMap().shapes.map((s) => [s.code, s.d]));
    for (const code of ["KR", "FR", "US", "BR", "AU"]) expect(countryPath(code), code).toBe(world.get(code));
  });

  it("해외 영토가 있는 나라는 본토 중심 (프랑스 = 유럽, 미국 = 본토)", () => {
    const [frLon, frLat] = countryLonLat("FR")!;
    expect(frLon).toBeGreaterThan(-5);
    expect(frLat).toBeGreaterThan(42);
    const [usLon, usLat] = countryLonLat("US")!;
    expect(usLon).toBeLessThan(-80);
    expect(usLon).toBeGreaterThan(-110);
    expect(usLat).toBeLessThan(50);
    expect(countryLonLat("SG")).toEqual([103.82, 1.35]); // 폴리곤 없는 나라는 점 마커 좌표
    expect(countryLonLat("XX")).toBeNull();
  });

  it("만두 여정: 정류장마다 마커, 나라가 바뀌는 구간마다 호, 화면 비율·범위가 맞는다", () => {
    const stops = [{ country: "KR", from: null }, ...["CN", "NP", "UZ", "PL", "GE"].map((country) => ({ country, from: 0 }))];
    const m = buildJourneyMap(stops);
    expect(m.box[2] / m.box[3]).toBeCloseTo(m.aspect, 1);
    expect(m.segs.map((s) => s.to)).toEqual([1, 2, 3, 4, 5]);
    for (const s of m.segs) expect(s.d).toMatch(/^M/);
    for (const p of m.pins) expect(inside(p!, m.box), String(p)).toBe(true);
    expect(m.lit.map((l) => l.code).sort()).toEqual(["CN", "GE", "KR", "NP", "PL", "UZ"]);
    expect(m.land.length).toBeGreaterThan(0);
  });

  it("한 나라짜리 여정도 최소 크기로 확대되고, 같은 나라 정류장은 겹치지 않게 벌린다", () => {
    const one = buildJourneyMap([{ country: "SG", from: null }]);
    expect(one.box[2]).toBeGreaterThanOrEqual(240);
    expect(one.segs).toEqual([]);
    expect(inside(one.pins[0]!, one.box)).toBe(true);

    const same = buildJourneyMap([
      { country: "IT", from: null },
      { country: "IT", from: 0 },
    ]);
    const [a, b] = same.pins as [number, number][];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(same.r * 2);
    expect(same.segs).toHaveLength(1); // 같은 나라 안 이동은 짧은 직선
  });

  it("지도에 없는 나라는 마커 없이(null) — 화면은 깨지지 않는다", () => {
    const m = buildJourneyMap([
      { country: "XX", from: null },
      { country: "JP", from: 0 },
    ]);
    expect(m.pins[0]).toBeNull();
    expect(m.segs).toEqual([]);
    expect(m.pins[1]).not.toBeNull();
  });
});
