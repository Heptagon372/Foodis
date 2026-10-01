// 답변 생성 + 검증 + 템플릿 대체. LLM 은 후보 안에서 '고르고 설명'만 한다.
import type { LLMProvider, Usage } from "@/lib/providers/types";
import { ANSWER_SYSTEM_V1, INTENT_GUIDE } from "./prompts/answer.v1";
import type { FoodRow, UserContext } from "./repo";
import { GenerateOutput, type DietKey, type Intent } from "./schema";

const DIET_LABEL: Record<DietKey, string> = { vegan: "비건", vegetarian: "채식", halal: "할랄", gluten_free: "글루텐 프리", dairy_free: "유제품 없음" };

export function buildUserMessage(text: string, intent: Intent, foods: FoodRow[], ctx: UserContext): string {
  const withStory = intent === "culture_story";
  const candidates = foods.map((f) => ({
    food_id: f.id,
    name_ko: f.name_ko,
    name_en: f.name_en,
    country: f.country.name_ko,
    summary: f.summary,
    ...(withStory ? { culture_story: f.culture_story } : {}),
    taste_tags: f.taste_tags,
    diet: f.diet,
    explored_country: ctx.exploredCountries.includes(f.country_code),
  }));
  // 개인정보 최소화: 종교·건강 추론 없이 "조건 있음" 수준으로만 전달 (11 문서 §7)
  const dietNeeds = (Object.keys(ctx.diet) as DietKey[]).filter((k) => ctx.diet[k]).map((k) => DIET_LABEL[k]);
  const profile = { diet_conditions: dietNeeds, explored_country_count: ctx.exploredCountries.length };
  return [
    `<task intent="${intent}">${INTENT_GUIDE[intent] ?? ""}</task>`,
    `<candidates>${JSON.stringify(candidates)}</candidates>`,
    `<user_profile>${JSON.stringify(profile)}</user_profile>`,
    `<user_question>${text}</user_question>`,
  ].join("\n");
}

export type Validation = { ok: true } | { ok: false; reason: string };

/** 후보 밖 food_id, 후보 밖 음식명 언급을 잡아낸다 (04 문서 §5 할루시네이션 방어). */
export function validate(out: GenerateOutput, candidates: FoodRow[], allNames: { id: string; name_ko: string; name_en: string }[]): Validation {
  const ids = new Set(candidates.map((c) => c.id));
  if (!out.picks.length) return { ok: false, reason: "picks 비어 있음" };
  const bad = out.picks.find((p) => !ids.has(p.food_id));
  if (bad) return { ok: false, reason: `후보 밖 food_id: ${bad.food_id}` };
  if (!out.speech.trim()) return { ok: false, reason: "speech 비어 있음" };

  const candNames = candidates.flatMap((c) => [c.name_ko, c.name_en.toLowerCase()]);
  const speech = out.speech.toLowerCase();
  for (const n of allNames) {
    if (ids.has(n.id)) continue;
    for (const name of [n.name_ko, n.name_en.toLowerCase()]) {
      if (name.length < 2 || !speech.includes(name)) continue;
      // "라멘"이 후보 "돈코츠 라멘"의 일부처럼, 후보 이름 안에 포함된 경우는 허용
      if (candNames.some((c) => c.includes(name))) continue;
      return { ok: false, reason: `후보 밖 음식 언급: ${name}` };
    }
  }
  return { ok: true };
}

export async function generate(
  llm: LLMProvider,
  text: string,
  intent: Intent,
  foods: FoodRow[],
  ctx: UserContext,
  allNames: { id: string; name_ko: string; name_en: string }[],
): Promise<{ out: GenerateOutput | null; usages: Usage[]; failures: string[] }> {
  const usages: Usage[] = [];
  const failures: string[] = [];
  const user = buildUserMessage(text, intent, foods, ctx);
  // 1회 재생성까지 허용 → 그래도 실패하면 호출 측이 템플릿으로 대체 (11 문서 §6)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, usage } = await llm.structured({ system: ANSWER_SYSTEM_V1, user, schema: GenerateOutput, model: "smart", maxTokens: 600, operation: "generate" });
      usages.push(usage);
      const v = validate(data, foods, allNames);
      if (v.ok) return { out: { ...data, picks: data.picks.slice(0, 3), follow_ups: data.follow_ups.slice(0, 3) }, usages, failures };
      failures.push(v.reason);
    } catch (e) {
      failures.push((e as Error).message);
    }
  }
  return { out: null, usages, failures };
}

/** LLM 없이 DB 값만으로 만드는 답. 사실 오류 대신 단순한 답을 택한다. */
export function templateAnswer(intent: Intent, foods: FoodRow[]): GenerateOutput {
  const f = foods[0];
  if (!f) {
    return {
      speech: "조건에 꼭 맞는 음식을 아직 찾지 못했어요. 조건을 조금 바꿔서 다시 떠나볼까요?",
      picks: [],
      follow_ups: ["다른 나라 추천", "조건 바꾸기"],
    };
  }
  const body = intent === "culture_story" && f.culture_story ? f.culture_story : (f.summary ?? "");
  return {
    speech: `${f.country.name_ko}의 ${f.name_ko}, 어때요? ${body}`.trim(),
    picks: [{ food_id: f.id, reason: "추천 1순위" }],
    follow_ups: ["문화 이야기 들려줘", "비슷한 음식", "다른 거 추천"],
  };
}
