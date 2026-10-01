import { describe, expect, it } from "vitest";
import { matchDemo, similarity, type DemoPack } from "./pack";

import { PREVIEW_COUNTRIES } from "@/lib/preview/countries";
import { PREVIEW_FOODS, previewId } from "@/lib/preview/foods";
import { keyTerms } from "@/lib/foodi/intent";

const vocab = {
  countries: PREVIEW_COUNTRIES.map(({ code, name_ko, name_en, continent_group }) => ({ code, name_ko, name_en, continent_group })),
  foods: PREVIEW_FOODS.map((f) => ({ id: previewId(f.n), name_ko: f.name_ko, name_en: f.name_en })),
};
// 실제 팩 생성기와 같이 핵심어를 슬롯 추출로 뽑는다
const item = (id: string, text: string, ctx?: string) => ({ id, text, context_food_id: ctx, must: keyTerms(text, vocab), response: {} as never });
const pack: DemoPack = {
  version: 1,
  built_at: "",
  mode: "preview",
  countries: [],
  food_slugs: [],
  items: [
    item("D01", "푸디야, 오늘은 어디로 떠나볼까?"),
    item("D02", "내가 아직 안 가본 나라 음식 알려줘"),
    item("D03", "나 채식주의자인데 인도 음식 추천해줘"),
    item("D04", "이 음식 어느 나라 음식이야?", "falafel-id"),
    item("D08", "할랄 음식만 보여줘"),
    item("D10", "푸디야, 화성 음식 추천해줘"),
  ],
};

describe("데모 질문 매칭 (음성 인식 표기 차이)", () => {
  it.each([
    ["오늘 어디로 떠나 볼까", "D01"],
    ["푸디야 오늘은 어디로 떠나볼까요", "D01"],
    ["내가 아직 안 가 본 나라 음식 알려 줘", "D02"],
    ["나 채식주의자 인데 인도 음식 추천해 줘", "D03"],
    ["할랄 음식만 보여 주세요", "D08"],
    ["화성 음식 추천해 줘", "D10"],
  ])("%s → %s", (text, id) => {
    expect(matchDemo(pack, text)?.id).toBe(id);
  });

  // 비슷해 보여도 답이 달라야 하는 질문 — 녹화된 답을 잘못 틀면 데모가 망가진다
  it.each(["비건 음식만 보여줘", "인도 음식 추천해줘", "목성 음식 추천해줘", "나 몇 국가 탐험했어"])("'%s' 는 매칭하지 않는다", (text) => {
    const hit = matchDemo(pack, text);
    expect(hit, hit ? `${hit.id} ${similarity(text, hit.text).toFixed(2)}` : "").toBeNull();
  });

  it("맥락이 필요한 질문은 같은 음식 화면에서만", () => {
    expect(matchDemo(pack, "이 음식 어느 나라 음식이야", "falafel-id")?.id).toBe("D04");
    expect(matchDemo(pack, "이 음식 어느 나라 음식이야", "kimchi-id")).toBeNull();
    expect(matchDemo(pack, "이 음식 어느 나라 음식이야")).toBeNull();
  });

  it("핵심어는 슬롯 추출로", () => {
    expect(keyTerms("나 채식주의자인데 인도 음식 추천해줘", vocab)).toEqual(["채식", "인도"]);
    expect(keyTerms("푸디야, 화성 음식 추천해줘", vocab)).toEqual(["화성"]);
    expect(keyTerms("푸디야, 김치의 기원 알려줘", vocab)).toEqual(["김치"]);
  });

  it("유사도는 0~1", () => {
    expect(similarity("가나다", "가나다")).toBe(1);
    expect(similarity("가나다", "라마바")).toBe(0);
  });
});
