import { describe, expect, it } from "vitest";
import { dnaMatch, dnaPicks, dnaStrands, foodiNudge, pickReason, type Strand } from "./dna";
import type { Ranked, RankFood } from "./engine";

const food = (id: string, tags: string[], cc = "KR"): RankFood => ({ id, slug: id, name_ko: id, country_code: cc, country_name: cc, taste_tags: tags });
const ranked = (fs: RankFood[]): Ranked<RankFood>[] => fs.map((f) => ({ food: f, score: 1, reason: "대표 음식" }));

describe("dnaStrands", () => {
  it("기록과 행동을 반반 섞어 0~1 로 정규화하고 무게 순으로", () => {
    const s = dnaStrands({ spicy: 4, sweet: 2 }, { fermented: 1, spicy: 0.5 });
    expect(s[0]).toMatchObject({ tag: "spicy", w: 1 });
    expect(s.map((x) => x.tag)).toEqual(["spicy", "fermented", "sweet"]);
    expect(s.every((x) => x.w > 0 && x.w <= 1)).toBe(true);
  });
  it("이름 모르는 태그는 빼고 n 개까지", () => {
    expect(dnaStrands({ spicy: 1, zzz: 9 }, {}).map((x) => x.tag)).toEqual(["spicy"]);
    expect(dnaStrands({ spicy: 5, sweet: 4, sour: 3, salty: 2, umami: 1 }, {}, 3)).toHaveLength(3);
  });
  it("아무 기록이 없으면 빈 DNA", () => {
    expect(dnaStrands({}, {})).toEqual([]);
  });
});

describe("dnaMatch", () => {
  const strands: Strand[] = [
    { tag: "spicy", label: "매운맛", w: 1 },
    { tag: "fermented", label: "발효", w: 0.6 },
    { tag: "sweet", label: "단맛", w: 0.2 },
  ];
  it("닿는 가닥을 무게 순으로, 강한 가닥일수록 매칭이 높다", () => {
    const kimchi = dnaMatch(["fermented", "spicy", "sour"], strands);
    expect(kimchi.links).toEqual(["spicy", "fermented"]);
    const cake = dnaMatch(["sweet", "bread"], strands);
    expect(kimchi.match).toBeGreaterThan(cake.match);
    expect(kimchi.match).toBeLessThanOrEqual(99);
  });
  it("하나도 안 닿으면 0", () => {
    expect(dnaMatch(["seafood"], strands)).toEqual({ match: 0, links: [] });
  });
});

describe("dnaPicks", () => {
  const strands = dnaStrands({ spicy: 3, fermented: 2 }, {});
  it("가닥과 이어진 음식을 먼저, 이어진 것끼리는 매칭이 높은 순", () => {
    const picks = dnaPicks(ranked([food("plain", ["bread"]), food("sweet", ["sweet", "spicy"]), food("kimchi", ["spicy", "fermented"])]), strands, 3);
    expect(picks.map((p) => p.food.id)).toEqual(["kimchi", "sweet", "plain"]);
    expect(picks[2].links).toEqual([]);
    expect(pickReason(picks[0])).toBe("매운맛·발효 DNA");
    expect(pickReason(picks[2])).toBe("대표 음식");
  });
  it("n 개까지만", () => {
    expect(dnaPicks(ranked([food("a", ["spicy"]), food("b", ["spicy"]), food("c", ["spicy"])]), strands, 2)).toHaveLength(2);
  });
});

describe("foodiNudge", () => {
  const p = { countries: { KR: 1 }, continents: { asia: 1 }, confidence: 0.5 };
  const names = { country: (cc: string) => (cc === "KR" ? "한국" : undefined) };
  it("상위 가닥 · 안 가본 대륙으로 질문 3개와 인사", () => {
    const n = foodiNudge(dnaStrands({ spicy: 3, fermented: 2 }, {}), p, names)!;
    expect(n.questions).toEqual(["매운맛 음식 다른 나라 거 추천해줘", "매운맛이랑 발효 둘 다 있는 음식 추천해줘", "아직 안 가본 유럽 음식 하나 추천해줘"]);
    expect(n.greeting).toContain("매운맛·발효 DNA");
  });
  it("받침 없는 가닥은 '랑'", () => {
    const n = foodiNudge(dnaStrands({ herbal: 3, spicy: 1 }, {}), p, names)!;
    expect(n.questions[1]).toBe("허브랑 매운맛 둘 다 있는 음식 추천해줘");
  });
  it("모든 대륙을 가 봤으면 세 번째 가닥, 없으면 자주 본 나라로 채운다", () => {
    const all = { asia: 1, europe: 1, mena_africa: 1, americas: 1, oceania: 1 };
    expect(foodiNudge(dnaStrands({ spicy: 3, fermented: 2, sour: 1 }, {}), { ...p, continents: all }, names)!.questions[2]).toBe("새콤 음식 하나 추천해줘");
    expect(foodiNudge(dnaStrands({ spicy: 3, fermented: 2 }, {}), { ...p, continents: all }, names)!.questions[2]).toBe("한국 매운맛 음식 추천해줘");
  });
  it("확신이 낮으면 부드러운 인사, DNA 가 없으면 null", () => {
    expect(foodiNudge(dnaStrands({ spicy: 1 }, {}), { ...p, confidence: 0.1 }, names)!.greeting).toBe("매운맛에 끌리시는군요. 비슷한 음식부터 찾아볼까요?");
    expect(foodiNudge([], p, names)).toBeNull();
  });
});
