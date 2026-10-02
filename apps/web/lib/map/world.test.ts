import { describe, expect, it } from "vitest";
import atlas from "world-atlas/countries-110m.json";
import { PREVIEW_COUNTRIES } from "@/lib/preview/countries";
import { CONTINENT_BOX, ISO_NUMERIC, MARKER_LONLAT } from "./iso";
import { buildWorldMap } from "./world";

const atlasIds = new Set((atlas as unknown as { objects: { countries: { geometries: { id?: string }[] } } }).objects.countries.geometries.map((g) => g.id));

describe("세계 지도 (F-EXP-05)", () => {
  it("150개국 모두 폴리곤(world-atlas id) 또는 점 마커가 있다", () => {
    expect(PREVIEW_COUNTRIES.length).toBe(150);
    for (const c of PREVIEW_COUNTRIES) {
      const id = ISO_NUMERIC[c.code];
      expect(id, `${c.code} 숫자 코드 없음`).toBeDefined();
      expect(atlasIds.has(id) || c.code in MARKER_LONLAT, `${c.code}(${id}) 폴리곤도 마커도 없음`).toBe(true);
    }
  });

  it("숫자 코드가 겹치지 않고, 마커는 정말 폴리곤이 없는 나라에만", () => {
    const ids = Object.values(ISO_NUMERIC);
    expect(new Set(ids).size).toBe(ids.length);
    for (const code of Object.keys(MARKER_LONLAT)) expect(atlasIds.has(ISO_NUMERIC[code]), code).toBe(false);
  });

  it("서버 계산 결과: 모든 나라가 그릴 모양(경로 또는 점)을 갖고, 대륙 칩마다 화면 비율에 맞는 viewBox", () => {
    const map = buildWorldMap();
    const byCode = new Map(map.shapes.map((s) => [s.code, s]));
    for (const c of PREVIEW_COUNTRIES) {
      const s = byCode.get(c.code);
      expect(s && (s.d || s.dot), c.code).toBeTruthy();
    }
    expect(map.others.length).toBeGreaterThan(0);
    for (const k of ["all", ...Object.keys(CONTINENT_BOX)]) {
      const [, , w, h] = map.views[k];
      expect(w / h).toBeCloseTo(map.aspect, 1);
    }
    // 페이로드 가드: 110m + 소수점 1자리면 경로 전체가 200KB 를 넘지 않는다
    const size = map.others.length + map.shapes.reduce((n, s) => n + s.d.length, 0);
    expect(size).toBeLessThan(200_000);
  });

  it("점 마커는 전체·해당 대륙 viewBox 안에 들어온다 (날짜변경선 너머 사모아·통가 포함)", () => {
    const map = buildWorldMap();
    const cont = new Map(PREVIEW_COUNTRIES.map((c) => [c.code, c.continent_group]));
    for (const s of map.shapes.filter((x) => x.dot)) {
      for (const view of ["all", cont.get(s.code)!]) {
        const [x, y, w, h] = map.views[view];
        const [dx, dy] = s.dot!;
        expect(dx >= x && dx <= x + w && dy >= y && dy <= y + h, `${s.code} @ ${view}`).toBe(true);
      }
    }
  });
});
