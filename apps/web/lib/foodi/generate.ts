// 답변 생성 + 검증 + 템플릿 대체 (04 문서 RAG ⑤~⑦). LLM 은 후보 안에서 '고르고 설명'만 한다.
import type { LLMProvider, Usage } from "@/lib/providers/types";
import { ANSWER_SYSTEM_V1, INTENT_GUIDE } from "./prompts/answer.v1";
import type { FoodName, FoodRow, UserContext } from "./repo";
import { GenerateOutput, type DietKey, type DietLevel, type Intent } from "./schema";

export const DIET_LABEL: Record<DietKey, string> = { vegan: "비건", vegetarian: "채식", halal: "할랄", gluten_free: "글루텐 프리", dairy_free: "유제품 없음" };
const LEVEL_SPEECH: Record<DietLevel, string> = { yes: "가능한 음식이에요", depends: "조리법에 따라 달라요", no: "맞지 않는 음식이에요", unknown: "아직 확인되지 않았어요" };

/** 몇 장까지 카드를 보여줄지 (03 문서 §4: 카드 1~3) */
export const MAX_PICKS: Partial<Record<Intent, number>> = { recommend: 1, explain_food: 1, culture_story: 1, filter_by_diet: 3, compare_similar: 3 };

// ── 한국어 조사: 받침 유무로 은/는, 이/가, 을/를, 와/과, (으)로
const hasBatchim = (w: string) => {
  const c = w.trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
const isRieul = (w: string) => (w.trim().slice(-1).charCodeAt(0) - 0xac00) % 28 === 8;
export const josa = (w: string, p: "은는" | "이가" | "을를" | "과와" | "으로") =>
  w + (p === "으로" ? (hasBatchim(w) && !isRieul(w) ? "으로" : "로") : hasBatchim(w) ? p[0] : p[1]);

export type GenContext = {
  text: string;
  intent: Intent;
  foods: FoodRow[];
  ctx: UserContext;
  needDiet: DietKey[];
  /** 특정 음식(화면에서 보는 것 / 이름으로 가리킨 것)에 대한 질문이면 그 id */
  targetId: string | null;
  dietQuestion: boolean;
  askedDiet: DietKey[];
};

export function buildUserMessage(g: GenContext): string {
  const withStory = g.intent === "culture_story";
  const candidates = g.foods.map((f) => ({
    food_id: f.id,
    name_ko: f.name_ko,
    name_en: f.name_en,
    country: f.country.name_ko,
    is_target: f.id === g.targetId,
    summary: f.summary,
    history: g.intent === "explain_food" ? f.history : undefined,
    origin_note: f.origin_note,
    ...(withStory ? { culture_story: f.culture_story } : {}),
    taste_tags: f.taste_tags,
    diet: f.diet,
    explored_country: g.ctx.exploredCountries.includes(f.country_code),
  }));
  // 개인정보 최소화: 종교·건강 추론 없이 "조건 있음" 수준으로만 전달 (11 문서 §7)
  const profile = { diet_conditions: g.needDiet.map((k) => DIET_LABEL[k]), explored_country_count: g.ctx.exploredCountries.length };
  const guide = [INTENT_GUIDE[g.intent] ?? "", g.dietQuestion ? `사용자는 대상 음식이 ${g.askedDiet.map((k) => DIET_LABEL[k]).join("·")} 기준에 맞는지 묻고 있다. diet 값 그대로 답한다.` : ""].join(" ");
  return [
    `<task intent="${g.intent}" max_picks="${MAX_PICKS[g.intent] ?? 1}">${guide}</task>`,
    `<candidates>${JSON.stringify(candidates)}</candidates>`,
    `<user_profile>${JSON.stringify(profile)}</user_profile>`,
    `<user_question>${g.text}</user_question>`,
  ].join("\n");
}

export type Validation = { ok: true } | { ok: false; reason: string };

const HEDGE = /아니|않|없|확인|다를|달라|어려|모르|주의|빼고|대신/;

/** 후보 밖 food_id·음식명, 식이 조건 위반, DB 에 없는 식이 단정을 잡아낸다 (04 문서 §5 할루시네이션 방어). */
export function validate(out: GenerateOutput, g: Pick<GenContext, "foods" | "intent" | "targetId" | "needDiet" | "ctx" | "text">, allNames: FoodName[]): Validation {
  const ids = new Set(g.foods.map((c) => c.id));
  if (!out.picks.length) return { ok: false, reason: "picks 비어 있음" };
  const bad = out.picks.find((p) => !ids.has(p.food_id));
  if (bad) return { ok: false, reason: `후보 밖 food_id: ${bad.food_id}` };
  if (!out.speech.trim()) return { ok: false, reason: "speech 비어 있음" };
  if (g.intent === "compare_similar" && g.targetId && out.picks.every((p) => p.food_id === g.targetId)) return { ok: false, reason: "비슷한 음식 대신 대상 음식만 고름" };

  // ② 식이 하드 필터는 DB 가 이미 걸렀지만, 추천 계열에서 조건 밖 음식을 골랐다면 거부
  if ((g.intent === "recommend" || g.intent === "filter_by_diet") && g.needDiet.length) {
    const byId = new Map(g.foods.map((f) => [f.id, f]));
    const off = out.picks.find((p) => g.needDiet.some((k) => !["yes", "depends"].includes(byId.get(p.food_id)!.diet[k])));
    if (off) return { ok: false, reason: `식이 조건 밖 음식 선택: ${byId.get(off.food_id)!.name_ko}` };
  }

  const candNames = g.foods.flatMap((c) => [c.name_ko, c.name_en.toLowerCase()]);
  // "중국 만두예요"처럼 DB 음식명이 일반 명사로도 쓰인다 → 후보의 DB 문장이나 사용자 질문에 이미 있는 말은 'AI가 끌어온 음식'이 아니다
  const known = [g.text, ...g.foods.flatMap((c) => [c.summary, c.history, c.culture_story, c.diet_note, c.origin_note])].join(" ").toLowerCase();
  const speech = out.speech.toLowerCase();
  for (const n of allNames) {
    if (ids.has(n.id)) continue;
    for (const name of [n.name_ko, n.name_en.toLowerCase()]) {
      if (name.length < 2 || !speech.includes(name)) continue;
      // "라멘"이 후보 "돈코츠 라멘"의 일부처럼, 후보 이름 안에 포함된 경우는 허용
      if (candNames.some((c) => c.includes(name)) || known.includes(name)) continue;
      return { ok: false, reason: `후보 밖 음식 언급: ${name}` };
    }
  }

  // ③ 정직한 불확실성: DB 가 no/unknown 인 식이 조건을 '된다'고 단정하는 문장 차단
  for (const sentence of out.speech.split(/(?<=[.!?。])\s+|\n/)) {
    for (const f of g.foods) {
      if (!sentence.includes(f.name_ko)) continue;
      for (const k of Object.keys(DIET_LABEL) as DietKey[]) {
        const level = f.diet[k];
        if ((level === "no" || level === "unknown") && sentence.includes(DIET_LABEL[k].split(" ")[0]) && !HEDGE.test(sentence)) {
          return { ok: false, reason: `식이 단정: ${f.name_ko} ${DIET_LABEL[k]}=${level}` };
        }
      }
    }
  }
  return { ok: true };
}

export async function generate(llm: LLMProvider, g: GenContext, allNames: FoodName[]): Promise<{ out: GenerateOutput | null; usages: Usage[]; failures: string[] }> {
  const usages: Usage[] = [];
  const failures: string[] = [];
  const user = buildUserMessage(g);
  const max = MAX_PICKS[g.intent] ?? 1;
  // 1회 재생성까지 허용 → 그래도 실패하면 호출 측이 템플릿으로 대체 (11 문서 §6)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, usage } = await llm.structured({
        system: ANSWER_SYSTEM_V1,
        user,
        schema: GenerateOutput,
        model: "smart",
        maxTokens: g.intent === "culture_story" ? 900 : 600,
        operation: "generate",
      });
      usages.push(usage);
      const v = validate(data, g, allNames);
      if (v.ok) {
        const picks = g.intent === "compare_similar" ? data.picks.filter((p) => p.food_id !== g.targetId) : data.picks;
        return { out: { ...data, picks: picks.slice(0, max), follow_ups: data.follow_ups.slice(0, 3) }, usages, failures };
      }
      failures.push(v.reason);
    } catch (e) {
      failures.push((e as Error).message);
    }
  }
  return { out: null, usages, failures };
}

const FOLLOW = {
  story: "문화 이야기 들려줘",
  similar: "비슷한 음식",
  other: "다른 거 추천",
};

/** LLM 없이 DB 값만으로 만드는 답. 사실 오류 대신 단순한 답을 택한다. 의도마다 문장 틀만 다르다. */
export function templateAnswer(g: GenContext): GenerateOutput {
  const { foods, intent, targetId } = g;
  const target = foods.find((f) => f.id === targetId) ?? null;
  const first = foods[0];
  if (!first) {
    const cond = g.needDiet.length ? `${g.needDiet.map((k) => DIET_LABEL[k]).join("·")} 조건에 맞는 ` : "조건에 꼭 맞는 ";
    return { speech: `${cond}음식을 아직 찾지 못했어요. 조건을 조금 바꿔서 다시 떠나볼까요?`, picks: [], follow_ups: ["다른 나라 추천", "오늘의 음식 추천"] };
  }
  // "튀르키예의 튀르키예 커피"처럼 나라 이름이 겹치면 음식 이름만
  const where = (f: FoodRow) => (f.name_ko.includes(f.country.name_ko) ? f.name_ko : `${f.country.name_ko}의 ${f.name_ko}`);

  if (intent === "explain_food" && target) {
    if (g.dietQuestion && g.askedDiet.length) {
      const parts = g.askedDiet.map((k) => `${DIET_LABEL[k]} 기준으로는 ${LEVEL_SPEECH[target.diet[k]]}`);
      const note = target.diet_note ? ` ${target.diet_note}` : "";
      // 확인 권유는 '조리법에 따라 다름·미확인'일 때만. 분명히 안 되는 것(no)에 덧붙이면 답이 흐려진다
      const careful = !note && g.askedDiet.some((k) => target.diet[k] === "depends" || target.diet[k] === "unknown") ? " 식당마다 다를 수 있으니 주문할 때 꼭 확인해 주세요." : "";
      return { speech: `${josa(target.name_ko, "은는")} ${parts.join(", ")}.${note}${careful}`, picks: [{ food_id: target.id, reason: "물어본 음식" }], follow_ups: [FOLLOW.similar, `${DIET_LABEL[g.askedDiet[0]]} 음식 추천해줘`] };
    }
    const asksOrigin = /기원|유래|역사/.test(g.text);
    const body = asksOrigin && target.history ? target.history : (target.summary ?? "");
    const origin = target.origin_note ? " 다만 기원과 범위에 대해서는 여러 이야기가 있어요." : "";
    return {
      speech: `${josa(target.name_ko, "은는")} ${target.country.name_ko} 음식으로 소개하고 있어요.${origin} ${body}`.trim(),
      picks: [{ food_id: target.id, reason: "물어본 음식" }],
      follow_ups: [FOLLOW.story, FOLLOW.similar],
    };
  }

  if (intent === "culture_story") {
    const f = target ?? foods.find((x) => x.culture_story) ?? first;
    return {
      speech: f.culture_story ? `${f.name_ko} 이야기를 들려줄게요. ${f.culture_story}` : `${f.name_ko}의 문화 이야기는 아직 준비 중이에요. 대신 이런 음식이에요. ${f.summary ?? ""}`.trim(),
      picks: [{ food_id: f.id, reason: target ? "물어본 음식" : "오늘의 이야기" }],
      follow_ups: [FOLLOW.similar, FOLLOW.other],
    };
  }

  if (intent === "compare_similar") {
    const others = foods.filter((f) => f.id !== targetId).slice(0, 3);
    if (!others.length) return templateAnswer({ ...g, intent: "recommend" });
    const names = others.map((f) => `${f.country.name_ko} ${f.name_ko}`).join(", ");
    const lead = target ? `${josa(target.name_ko, "과와")} 비슷한 음식은 세계 곳곳에 있어요.` : "비슷한 음식을 모아봤어요.";
    return { speech: `${lead} ${names}. 카드에서 무엇이 닮았는지 확인해 보세요.`, picks: others.map((f) => ({ food_id: f.id, reason: "비슷한 음식" })), follow_ups: [FOLLOW.story, FOLLOW.other] };
  }

  if (intent === "filter_by_diet") {
    const picks = foods.slice(0, 3);
    const cond = g.needDiet.map((k) => DIET_LABEL[k]).join("·");
    const anyDepends = picks.some((f) => g.needDiet.some((k) => f.diet[k] === "depends"));
    const names = picks.map((f) => f.name_ko).join(", ");
    return {
      speech: `${cond ? `${cond} 기준으로 ` : ""}${josa(names, "을를")} 골랐어요.${anyDepends ? " 노란 표시는 조리법에 따라 다른 음식이니 주문할 때 확인해 주세요." : ""}`,
      picks: picks.map((f) => ({ food_id: f.id, reason: cond ? `${cond} 조건` : "추천" })),
      follow_ups: [FOLLOW.story, FOLLOW.other],
    };
  }

  // recommend (기본)
  const unexplored = !g.ctx.exploredCountries.includes(first.country_code) && g.ctx.exploredCountries.length > 0;
  // 시나리오 B: 조건에 '조리법에 따라 다름'으로 걸친 음식이면 그 이유(diet_note)까지 말한다
  const depends = g.needDiet.filter((k) => first.diet[k] === "depends");
  const caution = depends.length ? ` ${depends.map((k) => DIET_LABEL[k]).join("·")} 기준으로는 조리법에 따라 달라요.${first.diet_note ? ` ${first.diet_note}` : ""} 주문할 때 확인해 주세요.` : "";
  return {
    speech: `${unexplored ? `${josa(first.country.name_ko, "은는")} 아직 안 가보셨네요. ${first.name_ko}, 어때요?` : `${where(first)}, 어때요?`} ${first.summary ?? ""}${caution}`.trim(),
    picks: [{ food_id: first.id, reason: unexplored ? "아직 안 가본 나라" : "추천 1순위" }],
    follow_ups: [FOLLOW.story, FOLLOW.similar, FOLLOW.other],
  };
}
