import { describe, expect, it } from "vitest";
import type { FoodSummary } from "@/lib/content/types";
import { PREVIEW_RELATIONS } from "@/lib/preview/foods";
import { previewContent } from "@/lib/preview/source";
import { buildJourney, MAX_STOPS, planRoute, type JourneyEdge, type JourneyGraph, type JourneyType } from "./route";

const slugs = (stops: { food: FoodSummary }[]) => stops.map((s) => s.food.slug);

/** 가짜 그래프: [from, to, type] 를 양방향으로 (DB 의 s06 양방향 행과 같게) */
function graphOf(pairs: [string, string, JourneyType?][]): JourneyGraph {
  const foods = new Map<string, FoodSummary>();
  const edges = new Map<string, JourneyEdge[]>();
  const food = (slug: string) => foods.get(slug) ?? (foods.set(slug, { slug, name_ko: slug, country_code: "KR" } as FoodSummary), foods.get(slug)!);
  const link = (a: string, b: string, type: JourneyType) => edges.set(a, [...(edges.get(a) ?? []), { to: b, type, description: `${a}-${b}` }]);
  for (const [a, b, type = "historical_link"] of pairs) {
    food(a);
    food(b);
    link(a, b, type);
    link(b, a, type);
  }
  return { foods, edges };
}

describe("Food Journey 경로 (기능 #14)", () => {
  it("만두(미리보기): 역사적 연결 5개를 모두 들르고, 설명은 DB 문장 그대로", async () => {
    const j = (await buildJourney("mandu", previewContent.getFood))!;
    expect(slugs(j.stops)).toEqual(["mandu", "jiaozi", "momo", "manti", "pierogi", "khinkali"]);
    expect(j.stops[0].via).toBeNull();
    const desc = PREVIEW_RELATIONS.find((r) => r.from === "mandu" && r.to === "jiaozi")!.description;
    for (const s of j.stops.slice(1)) {
      expect(s.via).toEqual({ from: 0, type: "historical_link", description: desc });
      expect(s.via!.description).toContain("여러 설이 있어요");
    }
  });

  it("관계는 양방향 — 자오쯔에서 출발해도 만두를 거쳐 나머지로 이어진다 (가장 긴 사슬 먼저)", async () => {
    const j = (await buildJourney("jiaozi", previewContent.getFood))!;
    // 자오쯔→만두→(첫 번째 이웃) 모모가 가장 긴 사슬, 나머지는 만두에서 가지
    expect(slugs(j.stops)).toEqual(["jiaozi", "mandu", "momo", "manti", "pierogi", "khinkali"]);
    expect(j.stops.map((s) => s.via?.from ?? null)).toEqual([null, 0, 1, 1, 1, 1]);
    // 비슷한 맛(자오쯔–모모)은 여정 관계가 아니다
    expect(j.stops.every((s) => !s.via || s.via.type === "historical_link")).toBe(true);
  });

  it("튀르키예 커피 → 비엔나 커피 (나라가 바뀌는 2곳 여정)", async () => {
    const j = (await buildJourney("turkish-coffee", previewContent.getFood))!;
    expect(j.stops.map((s) => s.food.country_code)).toEqual(["TR", "AT"]);
  });

  it("여정 관계가 없으면 출발지 하나, 없는 음식은 null", async () => {
    const j = (await buildJourney("kimchi", previewContent.getFood))!;
    expect(slugs(j.stops)).toEqual(["kimchi"]);
    expect(await buildJourney("no-such-food", previewContent.getFood)).toBeNull();
  });

  it("가지보다 가장 긴 사슬을 먼저 — 같은 길이면 관계 순서(결정적)", () => {
    const g = graphOf([
      ["s", "x"],
      ["s", "a"],
      ["a", "b"],
      ["b", "c"],
      ["s", "y"],
    ]);
    const stops = planRoute("s", g);
    expect(slugs(stops)).toEqual(["s", "a", "b", "c", "x", "y"]);
    expect(stops.map((s) => s.via?.from ?? null)).toEqual([null, 0, 1, 2, 0, 0]);
    expect(planRoute("s", g)).toEqual(stops);
  });

  it("역사적 연결 먼저, 지역 변이는 그다음 — 지역 변이만 있으면 그걸로 사슬", () => {
    const g = graphOf([
      ["s", "v", "regional_variant"],
      ["s", "h"],
      ["h", "h2", "regional_variant"],
    ]);
    expect(slugs(planRoute("s", g))).toEqual(["s", "h", "v", "h2"]);
    const only = graphOf([
      ["s", "v1", "regional_variant"],
      ["v1", "v2", "regional_variant"],
    ]);
    expect(slugs(planRoute("s", only))).toEqual(["s", "v1", "v2"]);
  });

  it(`재방문 없이 최대 ${MAX_STOPS}곳 (고리·긴 사슬)`, () => {
    const ring = graphOf(Array.from({ length: 12 }, (_, i) => [`n${i}`, `n${(i + 1) % 12}`] as [string, string]));
    const stops = planRoute("n0", ring);
    expect(stops).toHaveLength(MAX_STOPS);
    expect(new Set(slugs(stops)).size).toBe(MAX_STOPS);
    // 사슬이 한 줄로 이어진다 (각 정류장이 바로 앞에서 출발)
    expect(stops.slice(1).every((s, i) => s.via!.from === i)).toBe(true);
  });

  it("촘촘한 그래프(완전 그래프 10개)에서도 금방 끝난다", () => {
    const names = Array.from({ length: 10 }, (_, i) => `k${i}`);
    const g = graphOf(names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b] as [string, string])));
    const t0 = Date.now();
    expect(planRoute("k0", g)).toHaveLength(MAX_STOPS);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
