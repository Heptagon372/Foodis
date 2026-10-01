// Foodi 파이프라인: cache → intent·슬롯 ∥ 임베딩 → retrieve → generate → validate → 기록 (11 문서 §4, 04 문서 RAG ①~⑧).
// 어느 외부 서비스가 죽어도 카드가 있는 답은 나간다.
import type { Embedder, LLMProvider, Usage } from "@/lib/providers/types";
import { answerCacheKey } from "@/lib/guard/cache";
import { DIET_LABEL, generate, josa, templateAnswer, type GenContext } from "./generate";
import { classify, CONTINENT_WORDS, fallbackIntent, ruleClassify, type IntentResult, type Vocab } from "./intent";
import type { CountryRow, FoodisRepo, FoodRow, UserContext } from "./repo";
import { retrieve } from "./retrieve";
import { AskRequest, DIET_KEYS, type AskResponse, type FoodCard, type GenerateOutput, type Intent, type PassportSummary } from "./schema";

export type OrchestratorDeps = {
  llm: LLMProvider;
  embedder: Embedder;
  repo: FoodisRepo;
  dailyBudgetUsd: number;
  now?: () => number;
};

const CACHE_TTL_HOURS = 24;

export async function ask(deps: OrchestratorDeps, input: AskRequest, userId: string | null): Promise<AskResponse> {
  const req = AskRequest.parse(input);
  const now = deps.now ?? Date.now;
  const started = now();
  const { repo } = deps;
  const usages: Usage[] = [];

  const ctx = await repo.getUserContext(userId);
  if (!userId && req.guest) {
    for (const k of req.guest.diet) ctx.diet[k] = true;
    ctx.allergens = [...new Set([...ctx.allergens, ...req.guest.allergens])];
    ctx.exploredCountries = [...new Set([...ctx.exploredCountries, ...req.guest.explored_countries])];
    ctx.exploredFoodIds = [...new Set([...ctx.exploredFoodIds, ...req.guest.explored_foods])];
  }

  // 캐시는 대화 첫 질문만 (데모 질문 10개가 여기 해당). "다른 거 추천" 같은 이어지는 질문은 매번 새로
  const cacheable = req.seen_food_ids.length === 0;
  const cacheKey = answerCacheKey(req.text, ctx, req.context_food_id);
  const cached = cacheable ? await repo.cacheGet<AskResponse>(cacheKey).catch(() => null) : null;
  if (cached) {
    if (userId) await repo.markExplored(userId, cached.cards.map((c) => c.food_id)).catch(() => {});
    return { ...cached, conversation_id: null, cached: true };
  }

  // 예산 초과 → 캐시·템플릿 모드: LLM·임베딩 호출 없이 규칙 + 키워드 검색만 (11 문서 §6)
  const [overBudget, countries, foodNames] = await Promise.all([
    repo.usageTodayUsd().then((u) => u >= deps.dailyBudgetUsd, () => false),
    repo.countries(),
    repo.allFoodNames(),
  ]);
  const vocab: Vocab = { countries, foods: foodNames };

  const [intentRes, embedding] = await Promise.all([
    overBudget ? Promise.resolve(ruleOnly(req.text, req.context_food_id, vocab)) : classify(deps.llm, req.text, req.context_food_id, vocab),
    // 임베딩은 의도와 무관하게 병렬로 미리 계산 (비용 ≈ 0, 지연 절감)
    overBudget
      ? Promise.resolve(null)
      : deps.embedder.embed([req.text]).then(
          (r) => (usages.push(r.usage), r.vectors[0]),
          () => null,
        ),
  ]);
  if (intentRes.usage) usages.push(intentRes.usage);
  let intent: Intent = intentRes.intent;
  // 질문에서 이름으로 가리킨 음식이 화면에 떠 있는 음식보다 우선 ("비엔나 커피 이야기도 들려줘"를 터키 커피 화면에서 말해도)
  const targetId = intentRes.foodId ?? req.context_food_id ?? null;

  let out: GenerateOutput;
  let foods: FoodRow[] = [];
  let validated = true;
  let notInMap: string | undefined;
  let passport: PassportSummary | undefined;

  const baseGen = (f: FoodRow[], needDiet: GenContext["needDiet"], i: Intent = intent): GenContext => ({
    text: req.text,
    intent: i,
    foods: f,
    ctx,
    needDiet,
    targetId,
    dietQuestion: intentRes.dietQuestion,
    askedDiet: intentRes.diet,
  });
  const recommendAlternatives = () =>
    retrieve(repo, { intent: "recommend", diet: intentRes.diet, countryCode: null, continent: null, targetId: null, ctx, seen: req.seen_food_ids, embedding: null, text: req.text });

  if (intent === "passport_status") {
    passport = passportSummary(ctx, countries);
    out = passportAnswer(passport);
  } else if (intentRes.unknownTarget && !targetId) {
    // 04 문서 §5-3: "제 지도에는 없어요" + 대안. 지어내지 않고 DB 안의 음식으로 연결
    notInMap = intentRes.unknownTarget;
    intent = "out_of_scope";
    const alt = await recommendAlternatives();
    foods = alt.foods;
    const f = foods[0];
    out = {
      speech: f
        ? `${josa(notInMap, "은는")} 제 음식 지도에는 아직 없네요. 대신 ${f.name_ko.includes(f.country.name_ko) ? f.name_ko : `${f.country.name_ko}의 ${f.name_ko}`}, 어떠세요? ${f.summary ?? ""}`.trim()
        : `${josa(notInMap, "은는")} 제 음식 지도에는 아직 없네요. 다른 나라로 떠나볼까요?`,
      picks: f ? [{ food_id: f.id, reason: "대신 떠나볼 곳" }] : [],
      follow_ups: ["다른 거 추천", "문화 이야기 들려줘"],
    };
  } else if (intent === "out_of_scope") {
    out = {
      speech: "그 이야기는 제가 잘 몰라요. 대신 세계 음식 이야기라면 자신 있어요! 오늘은 어느 나라로 떠나볼까요?",
      picks: [],
      follow_ups: ["오늘의 음식 추천", "음식 문화 이야기 들려줘"],
    };
  } else {
    const r = await retrieve(repo, {
      intent,
      diet: intentRes.diet,
      countryCode: intentRes.countryCode,
      continent: intentRes.continent,
      targetId,
      ctx,
      seen: req.seen_food_ids,
      embedding,
      text: req.text,
    });
    foods = r.foods;
    const g = baseGen(foods, r.needDiet);
    if (r.similarBlocked && foods[0]) {
      // 비슷한 음식은 있지만 전부 조건 밖: 엉뚱한 음식을 '비슷하다'고 내놓는 대신 정직하게 말한다
      const conds = [...r.needDiet.map((k) => DIET_LABEL[k]), ...(ctx.allergens.length ? ["알레르기"] : [])].join("·");
      out = {
        speech: `${josa(foods[0].name_ko, "과와")} 비슷한 음식들은 ${conds} 조건에 맞지 않아서 이번엔 고르지 않았어요. 대신 조건에 맞는 다른 음식을 찾아볼까요?`,
        picks: [],
        follow_ups: [r.needDiet[0] ? `${DIET_LABEL[r.needDiet[0]]} 음식 추천해줘` : "다른 거 추천", "문화 이야기 들려줘"],
      };
    } else if (!foods.length || overBudget) {
      out = templateAnswer(g);
      // 후보 0건 안내는 정상 답. 예산 초과로 LLM 을 건너뛴 템플릿만 validated=false 로 남긴다
      validated = foods.length === 0 || !overBudget;
    } else {
      const gen = await generate(deps.llm, g, foodNames);
      usages.push(...gen.usages);
      if (gen.out) out = gen.out;
      else {
        out = templateAnswer(g);
        validated = false;
      }
    }
  }

  // culture_story 는 역사적 연결로 이어 듣기 제안 (03 문서 #5: 터키 커피 → 비엔나 커피)
  if (intent === "culture_story" && out.picks[0]) {
    const nextId = (await repo.getRelatedFoodIds(out.picks[0].food_id, 1, "historical_link").catch(() => []))[0];
    const next = nextId ? (await repo.getFoods([nextId]))[0] : undefined;
    if (next) out.follow_ups = [`${next.name_ko} 이야기도 들려줘`, ...out.follow_ups.filter((f) => !f.includes(next.name_ko))].slice(0, 3);
  }

  const byId = new Map(foods.map((f) => [f.id, f]));
  const cards: FoodCard[] = out.picks.flatMap((p) => {
    const f = byId.get(p.food_id);
    return f ? [toCard(f, p.reason)] : [];
  });
  const sources = cards.flatMap((c) => (byId.get(c.food_id)?.sources ?? []).slice(0, 2).map((s) => ({ food_id: c.food_id, ...s })));

  const response: AskResponse = {
    conversation_id: null,
    intent,
    speech: out.speech,
    cards,
    follow_ups: out.follow_ups,
    sources,
    validated,
    ...(notInMap ? { not_in_map: notInMap } : {}),
    ...(passport ? { passport } : {}),
  };

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
    cacheable && validated && intent !== "passport_status" ? repo.cacheSet(cacheKey, "answer", response, CACHE_TTL_HOURS).catch(() => {}) : null,
  ]);

  return { ...response, conversation_id: conversationId };
}

function ruleOnly(text: string, contextFoodId: string | undefined, vocab: Vocab): IntentResult {
  const r = ruleClassify(text, contextFoodId, vocab);
  return { ...r, intent: r.intent ?? fallbackIntent(text, r.diet), via: "rule" };
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

export function passportSummary(ctx: UserContext, countries: CountryRow[]): PassportSummary {
  return {
    countries: ctx.exploredCountries.length,
    foods: ctx.exploredFoodIds.length,
    by_continent: CONTINENT_WORDS.map(([, key, label]) => {
      const all = countries.filter((c) => c.continent_group === key);
      return { key, label, total: all.length, done: all.filter((c) => ctx.exploredCountries.includes(c.code)).length };
    }),
  };
}

function passportAnswer(p: PassportSummary): GenerateOutput {
  if (p.countries === 0) return { speech: "아직 탐험한 나라가 없어요. 첫 번째 여행지를 같이 골라볼까요?", picks: [], follow_ups: ["오늘의 음식 추천", "음식 문화 이야기 들려줘"] };
  const ratio = (c: PassportSummary["by_continent"][number]) => (c.total ? c.done / c.total : 1);
  const most = [...p.by_continent].sort((a, b) => b.done - a.done)[0];
  const least = [...p.by_continent].sort((a, b) => ratio(a) - ratio(b))[0];
  const foods = p.foods ? `, ${p.foods}가지 음식` : "";
  const tail = least.done === 0 ? `${josa(least.label, "은는")} 아직 시작 전이에요.` : `${josa(least.label, "은는")} 아직 ${least.done}개 나라예요.`;
  return {
    speech: `지금까지 ${josa(`${p.countries}개 나라${foods}`, "을를")} 탐험했어요. ${most.label} 쪽이 가장 많고, ${tail} 다음엔 ${josa(least.label, "으로")} 가볼까요?`,
    picks: [],
    follow_ups: [`${least.label} 음식 추천해줘`, "내 패스포트 보기"],
  };
}

export type { Intent };
