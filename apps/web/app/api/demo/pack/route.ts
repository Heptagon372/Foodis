// GET /api/demo/pack — 데모 필수 10문항(테스트 셋 D01~D10과 같은 질문)의 답을 실제 파이프라인으로 만들어 돌려준다.
// 발표 기기의 /demo 페이지가 받아 브라우저에 저장 → 현장에서 네트워크가 끊겨도 같은 답 (06 문서 §6, 11 문서 §6).
// LLM 을 10번 부르므로 운영에서는 DEMO_MODE=true 일 때만 열린다.
import { NextResponse } from "next/server";
import { jsonError, tooMany } from "@/lib/api/http";
import { getContent } from "@/lib/content";
import type { DemoItem, DemoPack } from "@/lib/demo/pack";
import { env } from "@/lib/env";
import { getOrchestratorDeps } from "@/lib/foodi/deps";
import { EVAL_CASES } from "@/lib/foodi/eval/cases";
import { keyTerms } from "@/lib/foodi/intent";
import { ask } from "@/lib/foodi/orchestrator";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" && !env.demoMode) return jsonError(403, "demo_disabled", "DEMO_MODE=true 일 때만 데모 팩을 만들 수 있어요.");
  const rl = rateLimit(clientKey(req, null) + ":demo-pack", 3);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const content = getContent();
  const deps = getOrchestratorDeps();
  const [countries, foodNames] = await Promise.all([deps.repo.countries(), deps.repo.allFoodNames()]);
  const idOf = async (slug: string) => (await content.getFood(slug))?.id;

  const items: DemoItem[] = [];
  const slugs = new Set<string>();
  for (const c of EVAL_CASES.filter((x) => x.category === "demo")) {
    const contextId = c.context ? await idOf(c.context) : undefined;
    if (c.context && !contextId) continue; // 실제 DB 에 아직 없는 음식이면 그 문항은 건너뜀 (/demo 에 표시)
    const exploredFoods = (await Promise.all((c.guest?.explored_foods ?? []).map(idOf))).filter((x): x is string => Boolean(x));
    const response = await ask(
      deps,
      {
        text: c.text,
        input_mode: "voice",
        context_food_id: contextId,
        guest: c.guest ? { diet: c.guest.diet ?? [], allergens: c.guest.allergens ?? [], explored_countries: c.guest.explored_countries ?? [], explored_foods: exploredFoods } : undefined,
      },
      null,
    );
    items.push({ id: c.id, text: c.text, context_slug: c.context, context_food_id: contextId, must: keyTerms(c.text, { countries, foods: foodNames }), response });
    for (const card of response.cards) slugs.add(card.slug);
    if (c.context) slugs.add(c.context);
  }

  // 카드에서 한 번 더 들어갈 수 있는 화면(연결·같은 나라)까지 오프라인에 담는다
  for (const slug of [...slugs]) {
    const d = await content.getFood(slug);
    d?.relations.forEach((r) => slugs.add(r.food.slug));
    d?.sameCountry.slice(0, 3).forEach((f) => slugs.add(f.slug));
  }

  const pack: DemoPack = { version: 1, built_at: new Date().toISOString(), mode: content.mode, items, countries, food_slugs: [...slugs] };
  return NextResponse.json(pack, { headers: { "Cache-Control": "no-store" } });
}
