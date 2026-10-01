import { describe, expect, it } from "vitest";
import { approvalProblem, dietProblems, embeddingText, parseCsv, reviewRowToEdit } from "./rules";

const diet = (o: Record<string, string> = {}) => ({ vegan: "unknown", vegetarian: "unknown", halal: "unknown", gluten_free: "unknown", dairy_free: "unknown", ...o }) as never;

describe("식이 검수 규칙 (03 태깅 기준 · s07)", () => {
  it("확정값은 출처 2개 이상", () => {
    expect(dietProblems({ diet: diet({ halal: "no" }), allergens: [], diet_sources: ["https://a.com"], diet_note: null })[0]).toMatch(/2개 이상/);
    expect(dietProblems({ diet: diet({ halal: "no" }), allergens: [], diet_sources: ["https://a.com", "https://b.com"], diet_note: null })).toEqual([]);
    expect(dietProblems({ diet: diet({ halal: "no" }), allergens: [], diet_sources: ["https://a.com", "https://a.com"], diet_note: null })[0]).toMatch(/2개 이상/);
  });
  it("모순 차단", () => {
    const two = ["https://a.com", "https://b.com"];
    expect(dietProblems({ diet: diet({ vegan: "yes", vegetarian: "unknown" }), allergens: [], diet_sources: two, diet_note: null })).toContain("비건이 yes 면 채식도 yes 여야 해요");
    expect(dietProblems({ diet: diet({ gluten_free: "yes" }), allergens: ["wheat"], diet_sources: two, diet_note: null }).join()).toMatch(/글루텐/);
    expect(dietProblems({ diet: diet({ vegan: "yes", vegetarian: "yes" }), allergens: ["fish"], diet_sources: two, diet_note: null }).join()).toMatch(/비건/);
  });
  it("depends 는 이유(diet_note)가 필요", () => {
    expect(dietProblems({ diet: diet({ vegan: "depends" }), allergens: [], diet_sources: [], diet_note: null }).join()).toMatch(/diet_note/);
    expect(dietProblems({ diet: diet({ vegan: "depends" }), allergens: [], diet_sources: [], diet_note: "젓갈을 넣기도 해요" })).toEqual([]);
  });
});

describe("작성자·검수자 분리", () => {
  it("editor 는 승인 불가, 본인 작성은 불가, admin 은 예외 승인", () => {
    expect(approvalProblem({ role: "editor", userId: "u1", createdBy: "u2", override: false })).toMatch(/reviewer/);
    expect(approvalProblem({ role: "reviewer", userId: "u1", createdBy: "u1", override: true })).toMatch(/다른 사람/);
    expect(approvalProblem({ role: "reviewer", userId: "u1", createdBy: "u2", override: false })).toBeNull();
    expect(approvalProblem({ role: "admin", userId: "u1", createdBy: "u1", override: false })).toMatch(/다른 사람/);
    expect(approvalProblem({ role: "admin", userId: "u1", createdBy: "u1", override: true })).toBeNull();
  });
});

describe("검수 시트 가져오기", () => {
  const csv = '﻿slug,name_ko,name_en,country_code,summary,history,culture_story,taste_tags,allergens,draft_vegan,final_vegan,final_vegetarian,diet_note,diet_sources\r\n' +
    'injera,인제라,Injera,ET,"테프로 만든 빵이에요, 시큼해요.",,"줄바꿈\n있는 이야기",sour fermented,,yes,,,,\r\n' +
    'kimchi,김치,Kimchi,KR,배추 발효 반찬이에요.,,,spicy,"fish,shellfish",no,depends,depends,젓갈을 넣기도 해요,https://a.com https://b.com\r\n';
  it("따옴표·쉼표·줄바꿈·BOM", () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].summary).toBe("테프로 만든 빵이에요, 시큼해요.");
    expect(rows[0].culture_story).toBe("줄바꿈\n있는 이야기");
  });
  it("식이는 사람이 적은 final_* 만 — AI 초안(draft_*)은 버린다", () => {
    const [a, b] = parseCsv(csv).map(reviewRowToEdit);
    expect("edit" in a && a.edit.diet.vegan).toBe("unknown"); // draft_vegan=yes 무시
    expect("edit" in b && b.edit.diet.vegan).toBe("depends");
    expect("edit" in b && b.edit.allergens).toEqual(["fish", "shellfish"]);
    expect("edit" in b && b.edit.diet_sources).toHaveLength(2);
  });
});

it("임베딩 텍스트는 s09 와 같은 구성", () => {
  const t = embeddingText({ name_ko: "인제라", name_en: "Injera", summary: "시큼한 빵", taste_tags: ["sour", "fermented"], cooking_method: "fermented", course_type: "bread", culture_story: null, diet: { vegan: "yes" }, mainIngredients: ["테프"], countryKo: "에티오피아" });
  expect(t.split("\n")).toEqual(["인제라 (Injera) — 에티오피아 음식", "시큼한 빵", "맛·특징: 새콤한, 발효", "주재료: 테프", "조리법: fermented, 분류: bread", "식이: vegan"]);
});
