// GET /api/community/briefing — 푸디 브리핑 + 카테고리별 열기(트렌드) + 글에 많이 나온 음식.
// 숫자는 trends.ts 계산값, 문장은 LLM(있으면) 또는 템플릿. 30분 캐시라 방문마다 LLM 을 부르지 않는다
import { jsonError } from "@/lib/api/http";
import { briefingOf, getStore } from "@/lib/community/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await getStore();
    const { briefing, trends, hotFoods } = await briefingOf(store);
    return Response.json({ briefing, trends, hot_foods: hotFoods, mode: store.mode }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(500, "briefing_failed", (e as Error).message);
  }
}
