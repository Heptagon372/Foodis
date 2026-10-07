// 사회적 대화 층 (docs/design/24 §K): 발화 전체가 인사·감사·작별일 때만 잡고, 이름·시간·탐험 수로 문장을 만든다.
import { describe, expect, it } from "vitest";
import { previewRepo } from "@/lib/preview/source";
import type { Embedder, LLMProvider } from "@/lib/providers/types";
import { ask } from "./orchestrator";
import { detectSocial, honorific, kstHour, socialAnswer, socialKey } from "./social";

const ctx = (over: Partial<Parameters<typeof socialAnswer>[1]> = {}) => ({ exploredCountries: 0, now: Date.UTC(2026, 9, 7, 0, 30), seed: "2026-10-07:guest", ...over });

describe("detectSocial", () => {
  it.each([
    ["안녕 푸디야", "greet"],
    ["푸디야 안녕!", "greet"],
    ["안녕하세요", "greet"],
    ["hi", "greet"],
    ["잘 지냈어?", "how_are_you"],
    ["밥 먹었어?", "how_are_you"],
    ["고마워", "thanks"],
    ["감사합니다 푸디님", "thanks"],
    ["너 최고야", "compliment"],
    ["잘가 푸디야", "bye"],
    ["안녕히 계세요", "bye"],
    ["넌 누구야?", "who"],
    ["뭐 할 수 있어?", "can"],
    ["심심해", "mood"],
  ])("%s → %s", (text, kind) => expect(detectSocial(text)).toBe(kind));

  it.each(["안녕 푸디야, 오늘 뭐 먹지?", "인도 음식 추천해줘", "김치 뭐야?", "배고파", "내일 날씨 알려줘", "비건 디저트", "안녕이라는 음식 알려줘"])(
    "음식 질문·범위 밖은 social 이 아니다: %s",
    (text) => expect(detectSocial(text)).toBeNull(),
  );

  it("호출어·문장부호·끝의 '요'를 뗀 뼈대로 본다", () => {
    expect(socialKey("안녕하세요, 푸디야!")).toBe("안녕하세");
    expect(socialKey("고마워요~")).toBe("고마워");
  });
});

describe("socialAnswer", () => {
  it("인사: 호칭 + 푸디 소개 + 탐험 제안, 카드 없음, 추천 질문 2~3개", () => {
    const out = socialAnswer("greet", ctx());
    expect(out.speech).toMatch(/^안녕하세요, 사용자님!/);
    expect(out.speech).toContain("어느 나라로 떠나볼까요");
    expect(out.picks).toEqual([]);
    expect(out.follow_ups.length).toBeGreaterThanOrEqual(2);
    expect(out.follow_ups.length).toBeLessThanOrEqual(3);
  });

  it("로그인 사용자는 이름으로, 탐험 기록이 있으면 나라 수(DB 값)를 말한다", () => {
    const out = socialAnswer("greet", ctx({ displayName: "지민", exploredCountries: 4 }));
    expect(out.speech).toContain("안녕하세요, 지민님!");
    expect(out.speech).toContain("4개 나라를 탐험하셨네요");
    expect(out.speech).toContain("새로운 나라로");
    expect(out.follow_ups).toContain("안 가본 나라 음식 추천");
  });

  it("같은 날·같은 사람은 같은 문장, 날이 바뀌면 바뀔 수 있다", () => {
    expect(socialAnswer("thanks", ctx())).toEqual(socialAnswer("thanks", ctx()));
    const days = new Set(Array.from({ length: 10 }, (_, i) => socialAnswer("thanks", ctx({ seed: `2026-10-${10 + i}:guest` })).speech));
    expect(days.size).toBeGreaterThan(1);
  });

  it("모든 종류가 비어 있지 않은 해요체 문장과 추천 질문을 낸다", () => {
    for (const kind of ["greet", "how_are_you", "thanks", "compliment", "bye", "who", "can", "mood", "chat"] as const) {
      const out = socialAnswer(kind, ctx({ displayName: " " }));
      expect(out.speech.length).toBeGreaterThan(10);
      expect(out.speech).toMatch(/[요죠][.!?]/);
      expect(out.picks).toEqual([]);
      expect(out.follow_ups.length).toBeGreaterThanOrEqual(2);
      expect(out.speech).not.toContain("undefined");
    }
  });

  it("호칭: 빈 이름은 사용자님, 긴 이름은 20자까지", () => {
    expect(honorific(null)).toBe("사용자님");
    expect(honorific("  ")).toBe("사용자님");
    expect(honorific("a".repeat(30))).toBe("a".repeat(20) + "님");
  });

  it("한국 시간 기준 시각", () => {
    expect(kstHour(Date.UTC(2026, 9, 7, 0, 30))).toBe(9); // UTC 00:30 = KST 09:30
    expect(kstHour(Date.UTC(2026, 9, 7, 15, 0))).toBe(0);
  });
});

describe("오케스트레이터 연결", () => {
  const calls: string[] = [];
  const llm: LLMProvider = { structured: async ({ operation }) => (calls.push(operation), Promise.reject(new Error("LLM 호출되면 안 됨"))) };
  const embedder: Embedder = { embed: async () => (calls.push("embed"), Promise.reject(new Error("임베딩 호출되면 안 됨"))) };

  it("'안녕 푸디야' → social, LLM·임베딩 호출 0, 캐시 안 함, 카드 없음", async () => {
    const repo = previewRepo();
    const res = await ask({ llm, embedder, repo, dailyBudgetUsd: 5 }, { text: "안녕 푸디야" }, null);
    expect(res.intent).toBe("social");
    expect(res.speech).toMatch(/^안녕하세요, 사용자님!/);
    expect(res.cards).toEqual([]);
    expect(res.validated).toBe(true);
    expect(calls).toEqual([]);
    const again = await ask({ llm, embedder, repo, dailyBudgetUsd: 5 }, { text: "안녕 푸디야" }, null);
    expect(again.cached).toBeUndefined();
  });

  it("인사가 섞인 음식 질문은 추천으로 간다", async () => {
    const res = await ask({ llm, embedder, repo: previewRepo(), dailyBudgetUsd: 5 }, { text: "안녕 푸디야, 오늘 뭐 먹지?" }, null);
    expect(res.intent).toBe("recommend");
    expect(res.cards.length).toBe(1);
  });
});
