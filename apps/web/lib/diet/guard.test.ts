import { describe, expect, it } from "vitest";
import { assess, flagsOf, GUARD_KEYS, GUARD_CATEGORIES, judgeCategory, selectedGuards, type GuardFood, type GuardKey } from "./guard";

const kimchi: GuardFood = {
  name_ko: "김치", name_en: "Kimchi", taste_tags: ["spicy", "fermented", "vegetable"], ingredients: ["배추", "고춧가루", "마늘", "젓갈"],
  diet: { vegan: "depends", vegetarian: "depends", halal: "yes", gluten_free: "yes", dairy_free: "yes" }, allergens: ["fish", "shellfish"],
};
const mandu: GuardFood = {
  name_ko: "만두", name_en: "Mandu", taste_tags: ["dumpling", "meat", "umami"], ingredients: ["밀가루", "돼지고기", "두부", "부추"],
  diet: { vegan: "depends", vegetarian: "depends", halal: "depends", gluten_free: "no", dairy_free: "yes" }, allergens: ["wheat", "soy"],
};
const injera: GuardFood = { name_ko: "인제라", name_en: "Injera", taste_tags: ["sour", "fermented", "bread"], ingredients: ["테프", "물"], diet: { vegan: "yes", vegetarian: "yes", halal: "yes", gluten_free: "depends", dairy_free: "yes" } };
const level = (f: GuardFood, k: GuardKey) => judgeCategory(k, flagsOf(f))?.level ?? null;

describe("식단 카테고리 판정", () => {
  it("재료에 돼지고기 → 할랄·코셔 위험, 힌두교는 소고기가 아니라 통과", () => {
    expect(level(mandu, "halal")).toBe("danger");
    expect(level(mandu, "kosher")).toBe("danger");
    expect(level(mandu, "hindu")).toBeNull();
    expect(level({ name_ko: "고기국수", taste_tags: ["meat"] }, "hindu")).toBe("caution"); // 어떤 고기인지 모르면 주의
    expect(judgeCategory("halal", flagsOf(mandu))?.reasons).toEqual(["pork"]); // 상위 신호(고기·할랄 부적합)는 이유에서 뺀다
  });

  it("이름만 있는 카탈로그 음식도 이름·태그로 잡는다", () => {
    const bulgogi: GuardFood = { name_ko: "불고기", name_en: "Bulgogi", taste_tags: ["meat"] };
    expect(level(bulgogi, "hindu")).toBe("danger");
    expect(level(bulgogi, "lacto_ovo")).toBe("danger");
    expect(level(bulgogi, "pescatarian")).toBe("danger");
    expect(level({ name_ko: "스시", name_en: "Sushi", taste_tags: ["rice", "seafood"] }, "pregnancy")).toBe("danger");
  });

  it("마늘이 든 김치 → 불교 사찰식·저포드맵 위험, 비건은 젓갈 때문에 위험(알레르기 생선 확실)", () => {
    expect(level(kimchi, "buddhist")).toBe("danger");
    expect(level(kimchi, "fodmap")).toBe("danger");
    expect(level(kimchi, "vegan")).toBe("danger");
    expect(level(kimchi, "halal")).toBeNull();
    expect(judgeCategory("buddhist", flagsOf(mandu))?.reasons).toEqual(["pork", "allium"]); // '고기·생선' 대신 실제 재료
  });

  it("채식 단계는 엄격한 정도대로", () => {
    const paneer: GuardFood = { name_ko: "팔락 파니르", name_en: "Palak paneer", ingredients: ["시금치", "파니르"], diet: { vegan: "no", vegetarian: "yes", dairy_free: "no" }, allergens: ["dairy"] };
    expect(level(paneer, "vegan")).toBe("danger");
    expect(level(paneer, "ovo")).toBe("danger");
    expect(level(paneer, "lacto")).toBeNull();
    expect(level(paneer, "lacto_ovo")).toBeNull();
  });

  it("코셔: 고기 + 유제품을 같이 쓰면 위험", () => {
    const butterChicken: GuardFood = { name_ko: "버터 치킨", name_en: "Butter chicken", ingredients: ["닭고기", "버터", "크림"] };
    expect(level(butterChicken, "kosher")).toBe("danger");
    expect(level({ name_ko: "치킨 구이", ingredients: ["닭고기"] }, "kosher")).toBe("caution");
  });

  it("소개글에서만 보이는 말은 주의까지만 ('고기 대신 두부')", () => {
    const tofu: GuardFood = { name_ko: "두부 조림", summary: "고기 대신 두부를 졸여요." };
    expect(level(tofu, "lacto_ovo")).toBe("caution");
  });

  it("고기 종류가 확실하면 이름 짐작은 버린다 · 카페인 없는 차", () => {
    const dakgalbi: GuardFood = { name_ko: "닭갈비", name_en: "Dak-galbi", taste_tags: ["meat"] };
    expect(flagsOf(dakgalbi).beef).toBeUndefined();
    expect(level(dakgalbi, "hindu")).toBeNull();
    expect(level({ name_ko: "옥수수차", name_en: "Oksusu-cha corn tea" }, "no_caffeine")).toBe("caution");
    expect(level({ name_ko: "말차 라떼", name_en: "Matcha latte" }, "no_caffeine")).toBe("danger");
  });

  it("헷갈리는 한국어 부분 일치를 피한다", () => {
    expect(flagsOf({ name_ko: "물고기 구이" }).meat).toBeUndefined();
    expect(flagsOf({ name_ko: "홍콩식 볶음" }).legume).toBeUndefined();
    expect(flagsOf({ name_ko: "밀크티" }).wheat).toBeUndefined();
    expect(flagsOf({ name_ko: "죽순 볶음" }).grain_carb).toBeUndefined();
    expect(flagsOf({ name_ko: "x", name_en: "Coconut rice" }).nuts).toBeUndefined();
  });

  it("assess: 가장 심한 단계 + 알레르기, 근거가 없으면 '정보 부족'", () => {
    const r = assess(mandu, { guards: ["hindu", "lacto_ovo", "halal"], allergens: ["peanut"] });
    expect(r.level).toBe("danger");
    expect(r.hits.map((h) => h.key)).toEqual(["lacto_ovo", "halal"]); // 고른 순서대로, 걸리지 않은 조건(힌두교)은 빠진다
    expect(assess(mandu, { guards: [], allergens: ["wheat"] }).hits[0]).toMatchObject({ key: "allergen:wheat", level: "danger" });
    expect(assess(injera, { guards: ["halal"] }).level).toBe("clear");
    expect(assess({ name_ko: "어떤 음식" }, { guards: ["halal"] }).level).toBe("unknown");
    expect(assess(mandu, { guards: [] }).level).toBeNull();
  });

  it("기존 추천 필터(diet)와 카테고리를 하나로 합친다", () => {
    expect(selectedGuards(["vegetarian", "halal"], ["gout", "nope"])).toEqual(["lacto_ovo", "halal", "gout"]);
  });

  it("모든 카테고리에 이름·설명이 있다", () => {
    for (const k of GUARD_KEYS) expect(GUARD_CATEGORIES[k].label && GUARD_CATEGORIES[k].hint).toBeTruthy();
  });
});
