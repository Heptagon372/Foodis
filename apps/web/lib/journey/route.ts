// Food Journey (기능 #14): 음식 하나에서 '역사적 연결' → '지역 변이' 관계를 따라 나라를 잇는 여정을 만든다.
// 순수 로직만 — 그래프 수집(getFood)과 경로 계획(planRoute)을 나눠 테스트에서 미리보기 데이터·가짜 그래프를 그대로 쓴다.
// 역사 문장은 만들지 않는다: 각 정류장의 설명은 DB 관계 description 을 그대로 싣는다 ("여러 설이 있어요" 유지).
import type { FoodDetail, FoodSummary, RelationType } from "@/lib/content/types";

export const JOURNEY_TYPES = ["historical_link", "regional_variant"] as const satisfies readonly RelationType[];
export type JourneyType = (typeof JOURNEY_TYPES)[number];
/** 지도·타임라인이 한 화면에서 읽히는 한도 */
export const MAX_STOPS = 8;
/** 그래프 수집 상한 — 가장 긴 사슬을 찾을 만큼만 DB 를 부른다 */
const MAX_FETCH = 24;
/** 가장 긴 사슬 탐색(DFS) 상한 — 관계가 촘촘해도 요청 하나가 오래 걸리지 않게 */
const DFS_BUDGET = 20_000;

export type JourneyEdge = { to: string; type: JourneyType; description: string };
/** foods: 알게 된 모든 음식, edges: 관계를 실제로 읽은 음식만 (없으면 아직 안 펼친 끝 정류장) */
export type JourneyGraph = { foods: Map<string, FoodSummary>; edges: Map<string, JourneyEdge[]> };
/** via: 앞선 어느 정류장(from = 정류장 번호)에서 어떤 관계로 왔는지. 출발지는 null */
export type JourneyStop = { food: FoodSummary; via: { from: number; type: JourneyType; description: string } | null };

const isJourney = (t: RelationType): t is JourneyType => (JOURNEY_TYPES as readonly RelationType[]).includes(t);

/** 출발 음식에서 여정 관계만 너비 우선으로 읽어 그래프를 만든다. 관계 순서는 소스 순서(DB 는 strength 내림차순) 그대로 */
export async function collectGraph(start: string, getFood: (slug: string) => Promise<FoodDetail | null>): Promise<{ start: FoodDetail; graph: JourneyGraph } | null> {
  const first = await getFood(start);
  if (!first) return null;
  const graph: JourneyGraph = { foods: new Map([[first.slug, first]]), edges: new Map() };
  const queue: { food: FoodDetail; depth: number }[] = [{ food: first, depth: 0 }];
  let fetched = 1;
  while (queue.length) {
    const { food, depth } = queue.shift()!;
    const edges: JourneyEdge[] = [];
    for (const r of food.relations) {
      // 같은 쌍이 두 번 오면(양방향 행 중복 등) 앞의 것만
      if (!isJourney(r.type) || r.food.slug === food.slug || edges.some((e) => e.to === r.food.slug && e.type === r.type)) continue;
      edges.push({ to: r.food.slug, type: r.type, description: r.description });
      if (!graph.foods.has(r.food.slug)) graph.foods.set(r.food.slug, r.food);
    }
    graph.edges.set(food.slug, edges);
    if (depth + 1 >= MAX_STOPS) continue;
    for (const e of edges) {
      if (graph.edges.has(e.to) || queue.some((q) => q.food.slug === e.to) || fetched >= MAX_FETCH) continue;
      fetched++;
      const next = await getFood(e.to);
      if (next) queue.push({ food: next, depth: depth + 1 });
    }
  }
  return { start: first, graph };
}

/** 한 관계 타입만으로 갈 수 있는 가장 긴 단순 경로(재방문 없음). 길이가 같으면 먼저 찾은 것(관계 순서) — 결과가 항상 같다 */
function longestChain(start: string, type: JourneyType, graph: JourneyGraph, max: number): JourneyEdge[] {
  let best: JourneyEdge[] = [];
  const path: JourneyEdge[] = [];
  const seen = new Set([start]);
  let budget = DFS_BUDGET;
  const dfs = (at: string) => {
    if (path.length > best.length) best = [...path];
    if (path.length + 1 >= max || --budget <= 0) return;
    for (const e of graph.edges.get(at) ?? []) {
      if (e.type !== type || seen.has(e.to)) continue;
      seen.add(e.to);
      path.push(e);
      dfs(e.to);
      path.pop();
      seen.delete(e.to);
    }
  };
  dfs(start);
  return best;
}

/**
 * 정류장 순서 정하기:
 * 1) 출발지에서 '역사적 연결'로만 이어지는 가장 긴 사슬 (없으면 '지역 변이' 사슬)
 * 2) 남은 자리는 이미 들른 정류장에서 가지치기 — 역사적 연결 먼저, 그다음 지역 변이 (너비 우선)
 * 최대 MAX_STOPS 곳, 같은 음식은 한 번만.
 */
export function planRoute(start: string, graph: JourneyGraph, max = MAX_STOPS): JourneyStop[] {
  const food = graph.foods.get(start);
  if (!food) return [];
  const stops: JourneyStop[] = [{ food, via: null }];
  const index = new Map([[start, 0]]);
  const add = (from: string, e: JourneyEdge) => {
    const f = graph.foods.get(e.to);
    if (!f || index.has(e.to) || stops.length >= max) return;
    index.set(e.to, stops.length);
    stops.push({ food: f, via: { from: index.get(from)!, type: e.type, description: e.description } });
  };

  let chain = longestChain(start, "historical_link", graph, max);
  if (!chain.length) chain = longestChain(start, "regional_variant", graph, max);
  let at = start;
  for (const e of chain) {
    add(at, e);
    at = e.to;
  }

  for (const type of JOURNEY_TYPES) {
    // stops 가 자라는 동안 같이 훑는다 = 새로 들른 정류장의 관계도 이어서 펼친다
    for (let i = 0; i < stops.length && stops.length < max; i++) {
      const slug = stops[i].food.slug;
      for (const e of graph.edges.get(slug) ?? []) if (e.type === type) add(slug, e);
    }
  }
  return stops;
}

export async function buildJourney(start: string, getFood: (slug: string) => Promise<FoodDetail | null>) {
  const got = await collectGraph(start, getFood);
  if (!got) return null;
  return { food: got.start, stops: planRoute(got.start.slug, got.graph) };
}
