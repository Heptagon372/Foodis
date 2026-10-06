/**
 * 검색·랭킹 v2 지표 (docs/design/19 §9) — 1만 개 정리본으로, 네트워크·LLM·임베딩 없이 (규칙 + 점수식만의 하한선).
 * 실행 (apps/web): pnpm eval:retrieval
 *
 *  ① 이름 인식 정확도     "<이름> 알려줘" → 그 음식인가 (동명 음식은 같은 이름이면 정답)
 *  ② 오타 교정률          3음절 이상 이름의 자모 하나를 바꿔도 찾는가
 *  ③ 오탐                 음식 이름이 없는 일상 문장에서 음식을 찾아내는가 (0 이 목표)
 *  ④ 조건 충족률          "재료 × 종류/맛/조리법" 질문의 1순위가 말한 조건을 모두 만족하나 (가능한 질문 중)
 *  ⑤ 안전                 식이·알레르기 프로필 위반 카드 수 (0 이어야 한다)
 *  ⑥ 다양성               열린 추천을 30일 × 탐험 상태로 돌렸을 때 서로 다른 1순위 수, 후보 5개의 나라 수
 *  ⑦ 지연                 한 질문 처리 시간 p50 · p95 (색인은 미리 만든 상태)
 */
import { hitsAllergen } from "@/lib/diet/allergens";
import { foodIndexOf } from "@/lib/foodi/food-index";
import { importRepo, loadImport } from "@/lib/foodi/eval/import-repo";
import { findFoodMention, ruleClassify } from "@/lib/foodi/intent";
import { ask } from "@/lib/foodi/orchestrator";
import { coverage } from "@/lib/foodi/rank";
import { retrieve } from "@/lib/foodi/retrieve";
import { emptyDiet } from "@/lib/foodi/repo";
import type { DietKey } from "@/lib/foodi/schema";
import type { Embedder, LLMProvider } from "@/lib/providers/types";

const llm: LLMProvider = { structured: async () => Promise.reject(new Error("offline")) };
const embedder: Embedder = { embed: async () => Promise.reject(new Error("offline")) };

async function main() {
  const repo = importRepo();
  const d = loadImport();
  const idx = foodIndexOf(d.rows, d.countries);
  const vocab = { countries: d.countries, foods: idx.foodNames, index: idx };
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const sample = <T>(xs: T[], n: number) => Array.from({ length: n }, () => xs[Math.floor(rand() * xs.length)]);
  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}% (${a}/${b})`;
  const out: string[] = [];
  const log = (s: string) => (console.log(s), out.push(s));

  // ① 이름 인식
  const foods = sample(idx.foods, 600);
  let ok = 0;
  for (const f of foods) {
    const m = findFoodMention(`${f.name_ko} 알려줘`, vocab);
    if (m && idx.byId.get(m.id)!.name_ko === f.name_ko) ok++;
  }
  log(`① 이름 인식 정확도: ${pct(ok, foods.length)}`);

  // ② 오타 교정: 3음절 이상 한국어 이름의 한 음절 받침을 바꾼다
  const typo = (s: string) => {
    const cs = [...s];
    const i = cs.findIndex((c, j) => j > 0 && c >= "가" && c <= "힣");
    if (i < 0) return null;
    const code = cs[i].charCodeAt(0) - 0xac00;
    const fin = code % 28;
    cs[i] = String.fromCharCode(0xac00 + code - fin + (fin === 0 ? 4 : 0));
    return cs.join("");
  };
  let tried = 0;
  let fixed = 0;
  for (const f of foods.filter((x) => /^[가-힣]{3,6}$/.test(x.name_ko)).slice(0, 300)) {
    const t = typo(f.name_ko);
    if (!t || idx.names.byKey.has(t)) continue;
    tried++;
    const r = ruleClassify(`${t}은 어떤 음식이야?`, undefined, vocab);
    if (r.foodId && idx.byId.get(r.foodId)!.name_ko === f.name_ko) fixed++;
  }
  log(`② 음성 인식 오타 교정률: ${pct(fixed, tried)}`);

  // ③ 오탐
  const plain = ["부자 되고 싶어", "아시아 여행 가고 싶다", "로스앤젤레스 날씨 알려줘", "오늘 기분이 좋아", "내일 회의가 있어", "차 막히네", "피곤해서 쉬고 싶어", "음악 틀어줘", "공부하기 싫다", "친구랑 놀러 가자", "비가 오네", "집에 가고 싶다", "운동 해야 하는데", "주말에 뭐 하지", "엄마한테 전화해야지", "시험 잘 봤어", "영화 추천해줘", "코딩 알려줘", "부산 가는 기차", "가나다라 연습"];
  const fp = plain.filter((t) => findFoodMention(t, vocab));
  log(`③ 일상 문장 음식 오탐: ${fp.length}/${plain.length}${fp.length ? ` — ${fp.join(", ")}` : ""}`);

  // ④ 조건 충족률
  const topIngredients = [...idx.df].filter(([n]) => idx.ingWords.has(n)).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([n]) => n);
  const kinds = ["디저트", "간식", "국물 요리", "면 요리", "튀긴 요리", "구운 요리", "매운 요리", "달콤한 음식", "바삭한 간식", "아침 메뉴"];
  let feasible = 0;
  let satisfied = 0;
  const ctx = { userId: null, diet: emptyDiet(), allergens: [], tagWeights: {}, exploredCountries: [], exploredFoodIds: [] };
  for (const ing of topIngredients)
    for (const k of kinds) {
      const text = `${ing} 들어간 ${k} 추천해줘`;
      const r = ruleClassify(text, undefined, vocab);
      const canAll = idx.foods.some((f) => coverage(f, r.spec)?.hard === 1);
      if (!canAll) continue;
      feasible++;
      const res = await retrieve(repo, { intent: r.intent ?? "recommend", diet: r.diet, countryCode: r.countryCode, continent: r.continent, targetId: null, ctx, seen: [], embedding: null, text, index: idx, spec: r.spec, seed: "eval" });
      const top = res.foods[0] && idx.byId.get(res.foods[0].id);
      if (top && coverage(top, r.spec)?.hard === 1) satisfied++;
    }
  log(`④ 조건 충족률 (재료 40 × 종류 10 중 가능한 질문): ${pct(satisfied, feasible)}`);

  // ⑤ 안전
  const profiles: { diet: DietKey[]; allergens: ("peanut" | "shellfish" | "dairy" | "wheat" | "egg" | "nuts" | "fish" | "soy" | "sesame")[] }[] = [
    { diet: ["vegan"], allergens: ["peanut"] },
    { diet: ["halal"], allergens: ["shellfish", "fish"] },
    { diet: ["vegetarian", "gluten_free"], allergens: ["sesame"] },
    { diet: ["dairy_free"], allergens: ["egg", "soy", "nuts"] },
  ];
  const qs = ["오늘 뭐 먹지?", "디저트 추천해줘", "매운 거", "국물 요리", "간식", "아시아 음식", "유럽 음식", "빵 추천", "해산물 요리", "비 오는 날 음식", "튀긴 거", "아침 메뉴"];
  let cards = 0;
  let bad = 0;
  for (const p of profiles)
    for (const q of qs) {
      const r = await ask({ llm, embedder, repo, dailyBudgetUsd: 5 }, { text: q, input_mode: "text", guest: { diet: p.diet, allergens: p.allergens, explored_countries: [], explored_foods: [], tag_weights: {} } }, null);
      for (const c of r.cards) {
        cards++;
        const f = idx.byId.get(c.food_id)!;
        if (hitsAllergen(f.allergens, p.allergens) || p.diet.some((k) => !["yes", "depends"].includes(f.diet[k]))) bad++;
      }
    }
  log(`⑤ 안전: 프로필 ${profiles.length} × 질문 ${qs.length} → 카드 ${cards}장 중 위반 ${bad}장`);

  // ⑥ 다양성
  const tops = new Set<string>();
  let countrySum = 0;
  let runs = 0;
  const lat: number[] = [];
  for (let day = 0; day < 30; day++)
    for (const explored of [[], ["KR", "JP", "CN"], ["IT", "FR", "ES", "US"]]) {
      const t0 = performance.now();
      const res = await retrieve(repo, { intent: "recommend", diet: [], countryCode: null, continent: null, targetId: null, ctx: { ...ctx, exploredCountries: explored }, seen: [], embedding: null, text: "오늘 뭐 먹지?", index: idx, seed: `2026-10-${day}:guest` });
      lat.push(performance.now() - t0);
      tops.add(res.foods[0].id);
      countrySum += new Set(res.foods.map((f) => f.country_code)).size;
      runs++;
    }
  log(`⑥ 다양성: 열린 추천 ${runs}회 → 서로 다른 1순위 ${tops.size}개, 후보 5개의 평균 나라 수 ${(countrySum / runs).toFixed(2)}`);

  // ⑦ 지연
  for (const q of qs) {
    const t0 = performance.now();
    await ask({ llm, embedder, repo, dailyBudgetUsd: 5 }, { text: q, input_mode: "text" }, null);
    lat.push(performance.now() - t0);
  }
  lat.sort((a, b) => a - b);
  log(`⑦ 지연 (색인 준비 후, LLM 제외): p50 ${lat[Math.floor(lat.length / 2)].toFixed(0)}ms · p95 ${lat[Math.floor(lat.length * 0.95)].toFixed(0)}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
