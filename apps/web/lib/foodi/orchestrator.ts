// Foodi 파이프라인: cache → intent ∥ profile ∥ embedding → retrieve → generate → validate → 기록 (11 문서 §4).
// 어느 외부 서비스가 죽어도 카드가 있는 답은 나간다.
import type { Embedder, LLMProvider, Usage } from "@/lib/providers/types";
import { answerCacheKey } from "@/lib/guard/cache";
import { generate, templateAnswer } from "./generate";
import { classify, extractDiet, ruleIntent, type IntentResult } from "./intent";
import type { FoodisRepo, FoodRow, UserContext } from "./repo";
import { retrieve } from "./retrieve";
import { DIET_KEYS, type AskRequest, type AskResponse, type FoodCard, type GenerateOutput, type Intent } from "./schema";

export type OrchestratorDeps = {
  llm: LLMProvider;
  embedder: Embedder;
  repo: FoodisRepo;
  dailyBudgetUsd: number;
  now?: () => number;
};

const CACHE_TTL_HOURS = 24;

export async function ask(deps: OrchestratorDeps, req: AskRequest, userId: string | null): Promise<AskResponse> {
  const now = deps.now ?? Date.now;
  const started = now();
  const { repo } = deps;
  const usages: Usage[] = [];

  const ctx = await repo.getUserContext(userId);
  const cacheKey = answerCacheKey(req.text, ctx, req.context_food_id);
  const cached = await repo.cacheGet<AskResponse>(cacheKey).catch(() => null);
  if (cached) {
    if (userId) await repo.markExplored(userId, cached.cards.map((c) => c.food_id)).catch(() => {});
    return { ...cached, conversation_id: null, cached: true };
  }

  // 예산 초과 → 캐시·템플릿 모드: LLM·임베딩 호출 없이 규칙 + 키워드 검색만 (11 문서 §6)
  const overBudget = (await repo.usageTodayUsd().catch(() => 0)) >= deps.dailyBudgetUsd;
  const hasCtx = Boolean(req.context_food_id);

  const [intentRes, embedding] = await Promise.all([
    overBudget
      ? Promise.resolve<IntentResult>({ intent: ruleIntent(req.text, hasCtx) ?? "recommend", diet: extractDiet(req.text), countryCode: null, via: "rule" })
      : classify(deps.llm, req.text, hasCtx),
    // 임베딩은 의도와 무관하게 병렬로 미리 계산 (비용 ≈ 0, 지연 절감)
    overBudget
      ? Promise.resolve(null)
      : deps.embedder.embed([req.text]).then(
          (r) => (usages.push(r.usage), r.vectors[0]),
          () => null,
        ),
  ]);
  if (intentRes.usage) usages.push(intentRes.usage);
  const intent = intentRes.intent;

  let out: GenerateOutput;
  let foods: FoodRow[] = [];
  let validated = true;

  if (intent === "passport_status") {
    out = passportAnswer(ctx);
  } else if (intent === "out_of_scope") {
    out = {
      speech: "그 이야기는 제가 잘 몰라요. 대신 세계 음식 이야기라면 자신 있어요! 오늘은 어느 나라로 떠나볼까요?",
      picks: [],
      follow_ups: ["오늘의 음식 추천", "비건 음식 찾기"],
    };
  } else {
    const r = await retrieve(repo, { intent, diet: intentRes.diet, countryCode: intentRes.countryCode, contextFoodId: req.context_food_id, ctx, embedding, text: req.text });
    foods = await repo.getFoods(r.foodIds);
    if (!foods.length || overBudget) {
      out = templateAnswer(intent, foods);
      // 후보 0건 안내는 정상 답. 예산 초과로 LLM 을 건너뛴 템플릿만 validated=false 로 남긴다
      validated = foods.length === 0 || !overBudget;
    } else {
      const g = await generate(deps.llm, req.text, intent, foods, ctx, await repo.allFoodNames());
      usages.push(...g.usages);
      if (g.out) out = g.out;
      else {
        out = templateAnswer(intent, foods);
        validated = false;
      }
    }
  }

  const byId = new Map(foods.map((f) => [f.id, f]));
  const cards: FoodCard[] = out.picks.flatMap((p) => {
    const f = byId.get(p.food_id);
    return f ? [toCard(f, p.reason)] : [];
  });
  const sources = cards.flatMap((c) => (byId.get(c.food_id)?.sources ?? []).slice(0, 2).map((s) => ({ food_id: c.food_id, ...s })));

  const response: AskResponse = { conversation_id: null, intent, speech: out.speech, cards, follow_ups: out.follow_ups, sources, validated };

  const conversationId = await repo
    .recordConversation({
      userId,
      inputMode: req.input_mode,
      intent,
      userText: req.text,
      aiJson: response,
      foodIds: cards.map((c) => c.food_id),
      validated,
      latencyMs: now() - started,
    })
    .catch(() => null);
  await Promise.all([
    repo.recordUsage(usages, conversationId).catch(() => {}),
    userId && cards.length ? repo.markExplored(userId, cards.map((c) => c.food_id)).catch(() => {}) : null,
    // 검증 통과한 '일반' 답만 캐시. 개인 기록(passport)은 캐시하지 않는다
    validated && intent !== "passport_status" ? repo.cacheSet(cacheKey, "answer", response, CACHE_TTL_HOURS).catch(() => {}) : null,
  ]);

  return { ...response, conversation_id: conversationId };
}

export function toCard(f: FoodRow, reason: string): FoodCard {
  return {
    food_id: f.id,
    slug: f.slug,
    name_ko: f.name_ko,
    country: { code: f.country_code, flag: f.country.flag_emoji, accent: f.country.accent_color },
    summary: f.summary,
    image_url: f.image_url,
    // 식이 배지는 LLM 출력이 아니라 DB 값 (07 문서 §6.3)
    diet_badges: DIET_KEYS.filter((k) => f.diet[k] !== "unknown").map((k) => ({ key: k, level: f.diet[k] })),
    reason,
  };
}

function passportAnswer(ctx: UserContext): GenerateOutput {
  const n = ctx.exploredCountries.length;
  const foods = ctx.exploredFoodIds.length;
  return {
    speech:
      n === 0
        ? "아직 탐험한 나라가 없어요. 첫 번째 여행지를 같이 골라볼까요?"
        : `지금까지 ${n}개 나라, ${foods}가지 음식을 탐험했어요. 아직 가보지 않은 나라로 떠나볼까요?`,
    picks: [],
    follow_ups: ["안 가본 나라 추천", "내 패스포트 보기"],
  };
}

export type { Intent };
