// 할루시네이션 테스트 셋 실행기.
//   pnpm test          → 오프라인(LLM 없음): 규칙 + DB 템플릿 경로. liveOnly 항목은 건너뛴다. 회귀 테스트로 항상 돈다
//   pnpm --filter web eval:live → 실제 LLM(registry 기본 체인: Gemini → GPT)으로 같은 30문항 (apps/web/.env.local 의 GEMINI_API_KEY · OPENAI_API_KEY, 1회 약 $0.05). P3 완료 기준 "30문항 통과"
// 데이터는 미리보기 샘플(lib/preview). 결과는 lib/foodi/eval/.last-<mode>.json 에 남는다.
import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { previewRepo } from "@/lib/preview/source";
import { PREVIEW_FOODS, previewId } from "@/lib/preview/foods";
import { PREVIEW_COUNTRIES } from "@/lib/preview/countries";
import type { Embedder, LLMProvider } from "@/lib/providers/types";
import { ask } from "../orchestrator";
import type { AskResponse, DietKey } from "../schema";
import { EVAL_CASES, type EvalCase } from "./cases";

const LIVE = (import.meta as { env?: { MODE?: string } }).env?.MODE === "live" || process.env.FOODIS_EVAL_LIVE === "1";
const MODE = LIVE ? "live" : "offline";

const offlineLLM: LLMProvider = { structured: async () => Promise.reject(new Error("offline")) };
const offlineEmbedder: Embedder = { embed: async () => Promise.reject(new Error("offline")) };

/** 앱과 같은 registry 기본 체인 (LLM_PROVIDERS 순서 중 키 있는 제공자). 특정 제공자만 재려면 LLM_PROVIDERS=openai pnpm … eval:live */
async function liveLLM(): Promise<LLMProvider> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd());
  // lib/env 는 import 시점에 환경변수를 읽는다 → .env.local 을 읽은 뒤에 불러온다
  const { getLLM, llmModels, llmReady } = await import("@/lib/providers/registry/llm");
  if (!llmReady()) throw new Error("eval:live 에는 LLM 키가 필요합니다 — GEMINI_API_KEY · OPENAI_API_KEY 중 하나 (apps/web/.env.local)");
  console.log(`[eval:live] LLM ${JSON.stringify(llmModels())}`);
  return getLLM();
}

const idOf = (slug: string) => {
  const f = PREVIEW_FOODS.find((x) => x.slug === slug);
  if (!f) throw new Error(`eval case 에 없는 slug: ${slug}`);
  return previewId(f.n);
};
const foodById = new Map(PREVIEW_FOODS.map((f) => [previewId(f.n), f]));
const continentOf = (cc: string) => PREVIEW_COUNTRIES.find((c) => c.code === cc)?.continent_group;
const level = (slug: string, k: DietKey) => PREVIEW_FOODS.find((f) => f.slug === slug)!.diet[k] ?? "unknown";

/** 모든 문항 공통 — 04 문서 §5 "5감의 방어" + 03 문서 §4 답변 UX 규칙 */
function universalChecks(c: EvalCase, r: AskResponse): string[] {
  const fail: string[] = [];
  if (!r.speech.trim()) fail.push("speech 비어 있음");
  if (r.cards.length > 3) fail.push(`카드 ${r.cards.length}개 (최대 3)`);
  if (r.follow_ups.length < 2 || r.follow_ups.length > 3) fail.push(`추천 질문 ${r.follow_ups.length}개 (2~3)`);
  const allowed = new Set([...r.cards.map((x) => x.food_id), ...(c.context ? [idOf(c.context)] : [])]);
  for (const card of r.cards) {
    const f = foodById.get(card.food_id);
    if (!f) {
      fail.push(`DB에 없는 카드 ${card.food_id}`);
      continue;
    }
    for (const b of card.diet_badges) if ((f.diet[b.key] ?? "unknown") !== b.level) fail.push(`${f.slug} 배지 ${b.key}=${b.level} ≠ DB`);
    // 프로필 식이·알레르기는 추천 계열 카드에 절대 위반 금지 (특정 음식을 직접 물은 경우는 정직하게 답하는 게 정답이라 제외)
    const askedAbout = c.context === f.slug || r.intent === "explain_food" || r.intent === "culture_story";
    if (!askedAbout) {
      for (const k of c.guest?.diet ?? []) if (!["yes", "depends"].includes(f.diet[k] ?? "unknown")) fail.push(`프로필 ${k} 위반: ${f.slug}`);
      for (const a of c.guest?.allergens ?? []) if ((f.allergens ?? []).includes(a)) fail.push(`알레르기 ${a} 위반: ${f.slug}`);
    }
  }
  // 카드 음식의 DB 문장·사용자 질문에 이미 있는 말("폴란드 만두예요")은 허용 — 그 밖의 DB 음식명이 나오면 실패
  const shown = r.cards.map((x) => foodById.get(x.food_id)).filter(Boolean);
  const known = [c.text, ...shown.flatMap((f) => [f!.name_ko, f!.summary, f!.culture, f!.history, f!.diet_note, f!.origin_note])].join(" ");
  for (const f of PREVIEW_FOODS) {
    if (allowed.has(previewId(f.n)) || !r.speech.includes(f.name_ko) || known.includes(f.name_ko)) continue;
    fail.push(`speech 에 카드 밖 음식명: ${f.name_ko}`);
  }
  return fail;
}

function caseChecks(c: EvalCase, r: AskResponse): string[] {
  const e = c.expect;
  const skip = new Set(LIVE ? [] : (c.liveOnly ?? []));
  const slugs = r.cards.map((x) => foodById.get(x.food_id)?.slug ?? "?");
  const fail: string[] = [];
  const on = (k: keyof EvalCase["expect"]) => e[k] !== undefined && !skip.has(k);
  if (on("intent") && !e.intent!.includes(r.intent)) fail.push(`intent ${r.intent} ∉ ${e.intent}`);
  if (on("minCards") && r.cards.length < e.minCards!) fail.push(`카드 ${r.cards.length} < ${e.minCards}`);
  if (on("maxCards") && r.cards.length > e.maxCards!) fail.push(`카드 ${r.cards.length} > ${e.maxCards}`);
  if (on("cardsAllOf")) for (const s of e.cardsAllOf!) if (!slugs.includes(s)) fail.push(`카드에 ${s} 없음`);
  if (on("cardsAnyOf") && !slugs.some((s) => e.cardsAnyOf!.includes(s))) fail.push(`카드 ${slugs} 중 기대 음식 없음`);
  if (on("cardsNoneOf")) for (const s of slugs) if (e.cardsNoneOf!.includes(s)) fail.push(`나오면 안 되는 카드 ${s}`);
  if (on("cardsDiet")) for (const s of slugs) for (const k of e.cardsDiet!) if (!["yes", "depends"].includes(level(s, k))) fail.push(`${s} ${k}=${level(s, k)}`);
  if (on("cardCountry")) for (const x of r.cards) if (x.country.code !== e.cardCountry) fail.push(`국가 ${x.country.code} ≠ ${e.cardCountry}`);
  if (on("cardCountryNotIn")) for (const x of r.cards) if (e.cardCountryNotIn!.includes(x.country.code)) fail.push(`이미 간 나라 ${x.country.code}`);
  if (on("cardContinent")) for (const x of r.cards) if (continentOf(x.country.code) !== e.cardContinent) fail.push(`대륙 ${continentOf(x.country.code)} ≠ ${e.cardContinent}`);
  if (on("notInMap") && Boolean(r.not_in_map) !== e.notInMap) fail.push(`not_in_map=${r.not_in_map ?? "없음"}`);
  if (on("speechIncludesAny") && !e.speechIncludesAny!.some((w) => r.speech.includes(w))) fail.push(`speech 에 ${e.speechIncludesAny} 중 하나 필요`);
  if (on("speechExcludes")) for (const re of e.speechExcludes!) if (re.test(r.speech)) fail.push(`speech 금지 패턴 ${re}`);
  if (on("followUpIncludes") && !r.follow_ups.some((f) => f.includes(e.followUpIncludes!))) fail.push(`추천 질문에 '${e.followUpIncludes}' 없음: ${r.follow_ups}`);
  if (on("passportCountries") && r.passport?.countries !== e.passportCountries) fail.push(`passport ${r.passport?.countries}`);
  return fail;
}

const results: { id: string; category: string; text: string; intent: string; cards: string[]; speech: string; validated: boolean; fail: string[] }[] = [];

describe(`할루시네이션 테스트 셋 (${MODE})`, () => {
  let llm: LLMProvider = offlineLLM;

  it.each(EVAL_CASES.map((c) => [c.id, c] as const))("%s", { timeout: 60_000 }, async (_id, c) => {
    if (LIVE && llm === offlineLLM) llm = await liveLLM();
    const res = await ask(
      { llm, embedder: offlineEmbedder, repo: previewRepo(), dailyBudgetUsd: 999 },
      {
        text: c.text,
        input_mode: "voice",
        context_food_id: c.context ? idOf(c.context) : undefined,
        seen_food_ids: (c.seen ?? []).map(idOf),
        guest: c.guest
          ? { diet: c.guest.diet ?? [], allergens: c.guest.allergens ?? [], explored_countries: c.guest.explored_countries ?? [], explored_foods: (c.guest.explored_foods ?? []).map(idOf) }
          : undefined,
      },
      null,
    );
    const fail = [...universalChecks(c, res), ...caseChecks(c, res)];
    results.push({ id: c.id, category: c.category, text: c.text, intent: res.intent, cards: res.cards.map((x) => x.slug), speech: res.speech, validated: res.validated, fail });
    expect(fail, `${c.id} "${c.text}"\n  → ${res.speech}\n  카드: ${res.cards.map((x) => x.slug)}`).toEqual([]);
  });

  afterAll(() => {
    const passed = results.filter((r) => !r.fail.length).length;
    const fallback = results.filter((r) => !r.validated).length;
    const summary = { mode: MODE, total: results.length, passed, templateFallback: fallback, at: new Date().toISOString() };
    console.log(`\n[eval:${MODE}] ${passed}/${results.length} 통과 · 템플릿 대체 ${fallback}건`);
    try {
      writeFileSync(new URL(`./.last-${MODE}.json`, import.meta.url), JSON.stringify({ summary, results }, null, 2));
    } catch {
      /* 보고서 저장 실패는 무시 */
    }
  });
});
