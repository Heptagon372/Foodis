import { describe, expect, it } from "vitest";
import { PREVIEW_COUNTRIES } from "@/lib/preview/countries";
import { extractContinent, findCountry } from "./intent";

const C = PREVIEW_COUNTRIES.map(({ code, name_ko, name_en, continent_group }) => ({ code, name_ko, name_en, continent_group }));
const f = (t: string) => findCountry(t, C);

describe("국가 찾기 (150개국)", () => {
  it("새로 추가한 나라 · 별칭", () => {
    expect(f("몽골 음식 추천해줘")).toBe("MN");
    expect(f("가나 음식 알려줘")).toBe("GH");
    expect(f("말리의 전통 음식")).toBe("ML");
    expect(f("오만에서는 뭘 먹어?")).toBe("OM");
    expect(f("오스트레일리아 디저트")).toBe("AU");
    expect(f("타이완 국수")).toBe("TW");
    expect(f("콩고 요리")).toBe("CD");
    expect(f("콩고민주공화국 요리")).toBe("CD");
    expect(f("사우디 음식")).toBe("SA");
    expect(f("보스니아 음식")).toBe("BA");
    expect(f("스코틀랜드 음식")).toBe("GB");
    expect(f("what do people eat in Oman")).toBe("OM");
  });

  it("150개국 확장: 새로 넣은 20개국 · 별칭", () => {
    expect(f("북한 음식 뭐가 있어?")).toBe("KP");
    expect(f("한국 음식")).toBe("KR");
    expect(f("마케도니아 요리")).toBe("MK");
    expect(f("북마케도니아 음식")).toBe("MK");
    expect(f("케이프베르데 음식")).toBe("CV");
    expect(f("모리셔스 디저트")).toBe("MU");
    expect(f("슬로베니아 전통 음식")).toBe("SI");
    expect(f("what do people eat in Suriname")).toBe("SR");
  });

  it("짧은 이름이 일반 단어 안에 있으면 나라로 보지 않는다", () => {
    expect(f("가나다라 순서로 알려줘")).toBeNull();
    expect(f("빨래 말리다가 배고파")).toBeNull();
    expect(f("오만하게 굴지 마")).toBeNull();
    expect(f("a woman's favorite dish")).toBeNull();
    expect(f("통가리 같은 거")).toBeNull();
  });

  it("긴 이름 우선 · 기존 나라 그대로", () => {
    expect(f("인도네시아 음식")).toBe("ID");
    expect(f("인도 커리")).toBe("IN");
    expect(f("남아공 음식")).toBe("ZA");
    expect(f("터키 커피")).toBe("TR");
    expect(f("조지아 와인")).toBe("GE");
  });

  it("대륙: 오세아니아", () => {
    expect(extractContinent("오세아니아 음식 추천해줘")).toBe("oceania");
    expect(extractContinent("남태평양 섬나라 음식")).toBe("oceania");
    expect(extractContinent("카리브해 음식")).toBe("americas");
  });
});
