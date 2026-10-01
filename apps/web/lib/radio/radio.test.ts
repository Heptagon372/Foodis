import { describe, expect, it } from "vitest";
import { previewContent } from "@/lib/preview/source";
import { buildRadio } from "./queue";
import { buildEpisode, SEGMENT_MAX, sentences, type RadioFood } from "./script";

const food = (o: Partial<RadioFood>): RadioFood => ({
  id: "x", slug: "x", name_ko: "김치", country_name: "대한민국", country_code: "KR", flag: "🇰🇷", accent: "#000", image_url: null, image_credit: null, taste_tags: [],
  summary: "배추를 절여 발효한 반찬이에요.", origin_note: null, history: null, culture_story: null, ...o,
});

describe("radio script", () => {
  it("DB 필드만 순서대로 읽고, 다음 이야기로 잇는다", () => {
    const e = buildEpisode(food({ history: "오래전부터 있었어요.", culture_story: "김장을 해요." }), {
      first: true,
      next: { food: { name_ko: "인제라", country_name: "에티오피아", flag: "🇪🇹" }, bridge: { kind: "relation", type: "same_technique", description: "발효로 새콤한 맛을 내요" } },
    });
    expect(e.segments.map((s) => s.kind)).toEqual(["open", "summary", "history", "culture", "bridge"]);
    expect(e.segments[0].text).toBe("푸디 라디오예요. 대한민국에서 온 이야기, 김치.");
    expect(e.segments.at(-1)!.text).toBe("같은 조리법을 쓰는 에티오피아의 인제라로 이어 갈게요. 발효로 새콤한 맛을 내요.");
  });

  it("조사: 받침 · ㄹ 받침 · 영문", () => {
    const b = (name_ko: string) =>
      buildEpisode(food({}), { first: false, next: { food: { name_ko, country_name: "X", flag: "" }, bridge: { kind: "relation", type: "similar_taste", description: "" } } }).segments.at(-1)!.text;
    expect(b("만두")).toContain("만두로");
    expect(b("팔라펠")).toContain("팔라펠로");
    expect(b("힌칼리 국")).toContain("국으로");
    expect(buildEpisode(food({}), { first: false, next: { food: { name_ko: "a", country_name: "레바논", flag: "" }, bridge: { kind: "jump" } } }).segments.at(-1)!.text).toContain("레바논으로 떠나");
  });

  it("마지막 에피소드는 마무리, 긴 필드는 TTS 한도 안으로 문장 단위 분할", () => {
    const long = Array.from({ length: 40 }, (_, i) => `문장 ${i}번은 꽤 길게 이어지는 이야기예요.`).join(" ");
    const e = buildEpisode(food({ culture_story: long }), { first: false });
    expect(e.segments.at(-1)!.kind).toBe("close");
    for (const s of e.segments) expect(s.text.length).toBeLessThanOrEqual(SEGMENT_MAX);
    expect(e.segments.filter((s) => s.kind === "culture").map((s) => s.text).join(" ")).toBe(long);
    expect(sentences("하나예요. 둘이에요! 셋?")).toEqual(["하나예요.", "둘이에요!", "셋?"]);
  });
});

describe("radio queue (미리보기 데이터)", () => {
  it("관계를 따라 편성: 튀르키예 커피 → 비엔나 커피 (역사적 연결)", async () => {
    const r = await buildRadio(previewContent, { channel: "today", start: "turkish-coffee", day: "2026-10-01" });
    expect(r.episodes[0].food.slug).toBe("turkish-coffee");
    expect(r.episodes[1].food.slug).toBe("viennese-coffee");
    expect(r.episodes[0].next?.bridge).toMatchObject({ kind: "relation", type: "historical_link" });
    expect(r.episodes[0].segments.at(-1)!.text).toContain("여러 설");
  });

  it("같은 날·채널은 같은 편성, 중복 없음, 대륙 채널은 그 대륙에서 시작", async () => {
    const a = await buildRadio(previewContent, { channel: "asia", day: "2026-10-01" });
    const b = await buildRadio(previewContent, { channel: "asia", day: "2026-10-01" });
    expect(a.episodes.map((e) => e.food.slug)).toEqual(b.episodes.map((e) => e.food.slug));
    expect(new Set(a.episodes.map((e) => e.food.slug)).size).toBe(a.episodes.length);
    expect(["KR", "CN", "JP", "TH", "VN", "ID", "PH", "IN", "NP", "UZ"]).toContain(a.episodes[0].food.country_code);
    expect(a.episodes.length).toBe(5);
  });
});
