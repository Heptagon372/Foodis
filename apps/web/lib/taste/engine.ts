// 취향 엔진 (Taste Engine v1): 행동 신호 → 취향 프로필 → 추천 순위. 순수 함수만 (브라우저 저장은 lib/client/taste.ts).
// 설계: docs/design/09_취향_엔진_v1.md
//
// 1) 신호마다 무게가 다르다: 좋아요 > 먹어봤어요 > 저장 > 질문 · 듣기 > 오래 보기 > 상세 열기 · 클릭 > 나라 페이지
//    추천했는데 여러 번 지나친 음식은 약한 음(-) 신호
// 2) 오래된 신호는 반감기 21일로 옅어진다 (취향은 바뀐다)
// 3) 프로필 = 맛 태그 · 나라 · 대륙별 가중합을 0~1 로 정규화 + 기능 사용 횟수 (라디오 · 지도 · 음성 …)
// 4) 확신도 c = 1 - e^(-신호량/12). 초반(c 낮음)에는 "그 나라의 유명한 대표 음식"이 순위를 지배하고, 신호가 쌓일수록 취향 점수가 커진다
// 5) 대표 음식 우선 규칙 (반드시): 사용자가 아직 그 나라 음식을 2개 이상 보지 않았다면, 그 나라에서는 유명도 상위 3개만 추천한다
// 6) 다양성: 한 목록에 같은 나라는 초반 1개 · 나중 2개까지, 아직 안 가본 대륙 1자리는 남겨 둔다

export type SignalKind =
  | "click" // 카드 탭 (어느 화면에서 눌렀는지 src)
  | "view" // 상세 열기
  | "dwell" // 상세에서 머문 시간 (ms)
  | "tab" // 상세 탭 보기 (문화 · 식이 · 연결)
  | "listen" // 음성 듣기 · 라디오로 듣기
  | "ask" // 이 음식으로 푸디에게 질문
  | "like"
  | "tried"
  | "saved"
  | "share"
  | "country" // 나라 페이지 · 지도에서 나라 탭
  | "skip"; // 추천에 떴는데 지나침 (같은 음식이 여러 번 노출됐을 때만 기록)

export type Signal = { k: SignalKind; t: number; slug?: string; cc?: string; tags?: string[]; ms?: number; src?: string };

/** 신호 무게. dwell 은 10초 넘게 머문 경우만, 30초당 1 (최대 2) */
export const WEIGHT: Record<SignalKind, number> = {
  like: 4, tried: 3, saved: 2.5, share: 2, ask: 2, listen: 1.5, tab: 0.5, view: 1, click: 1, dwell: 1, country: 0.5, skip: -0.3,
};
export const HALF_LIFE_DAYS = 21;
const CONFIDENCE_SCALE = 12;
export const SIGNATURE_TOP = 3;
const SIGNATURE_UNLOCK = 2;

export type FeatureUse = Record<string, { n: number; last: number }>;

export type TasteProfile = {
  tags: Record<string, number>; // 0~1
  countries: Record<string, number>; // 0~1
  continents: Record<string, number>; // 0~1
  /** 나라별로 상세를 본 음식 (대표 음식 규칙) */
  seenByCountry: Record<string, string[]>;
  seen: Set<string>;
  features: { name: string; n: number }[]; // 많이 쓴 순
  signalCount: number; // 감쇠 반영한 양(+) 신호 합
  confidence: number; // 0~1
};

export const decay = (t: number, now: number) => Math.pow(0.5, Math.max(0, now - t) / (HALF_LIFE_DAYS * 86_400_000));

export function signalWeight(s: Signal): number {
  if (s.k === "dwell") return (s.ms ?? 0) < 10_000 ? 0 : Math.min(2, (s.ms ?? 0) / 30_000) * WEIGHT.dwell;
  return WEIGHT[s.k];
}

const normalize = (w: Record<string, number>) => {
  const max = Math.max(0, ...Object.values(w));
  return max > 0 ? Object.fromEntries(Object.entries(w).filter(([, v]) => v > 0).map(([k, v]) => [k, v / max])) : {};
};

export function buildProfile(
  signals: Signal[],
  features: FeatureUse,
  continentOf: (cc: string) => string | undefined,
  now = Date.now(),
  seed: { tastes?: string[] } = {},
): TasteProfile {
  const tags: Record<string, number> = {};
  const countries: Record<string, number> = {};
  const continents: Record<string, number> = {};
  const seenByCountry: Record<string, string[]> = {};
  const seen = new Set<string>();
  let amount = 0;
  for (const t of seed.tastes ?? []) tags[t] = (tags[t] ?? 0) + 1; // 온보딩 취향 = 시작값 (확신도에는 안 친다)
  for (const s of signals) {
    const w = signalWeight(s) * decay(s.t, now);
    if (!w) continue;
    if (w > 0) amount += w;
    for (const tag of s.tags ?? []) tags[tag] = (tags[tag] ?? 0) + w;
    if (s.cc) {
      countries[s.cc] = (countries[s.cc] ?? 0) + w;
      const cont = continentOf(s.cc);
      if (cont) continents[cont] = (continents[cont] ?? 0) + w;
    }
    if (s.slug && (s.k === "view" || s.k === "click") && s.cc) {
      seen.add(s.slug);
      const list = (seenByCountry[s.cc] ??= []);
      if (!list.includes(s.slug)) list.push(s.slug);
    }
  }
  return {
    tags: normalize(tags),
    countries: normalize(countries),
    continents: normalize(continents),
    seenByCountry,
    seen,
    features: Object.entries(features).map(([name, v]) => ({ name, n: v.n })).sort((a, b) => b.n - a.n),
    signalCount: amount,
    confidence: 1 - Math.exp(-amount / CONFIDENCE_SCALE),
  };
}

export type RankFood = { id: string; slug: string; name_ko: string; country_code: string; country_name: string; taste_tags: string[]; fame_rank?: number | null };
export type Ranked<F> = { food: F; score: number; reason: string };

/** 유명도: 그 나라 1위 = 1, 2위 0.75, 3위 0.6 … 순위 정보가 없으면 0.15 (검수 전 음식보다 대표 음식이 먼저) */
export const fameScore = (rank?: number | null) => (rank ? 1 / (1 + (rank - 1) / 3) : 0.15);

/** 대표 음식 우선 규칙: 그 나라 음식을 아직 2개 이상 안 봤으면 상위 3개만 */
export const signatureGate = (f: RankFood, p: TasteProfile) =>
  (p.seenByCountry[f.country_code]?.length ?? 0) >= SIGNATURE_UNLOCK || (f.fame_rank ?? 99) <= SIGNATURE_TOP;

const TAG_REASON: Record<string, string> = {
  spicy: "매운맛", fermented: "발효 음식", soupy: "국물 요리", sweet: "단맛", sour: "새콤한 맛", grilled: "구이", fried: "튀김",
  noodle: "면 요리", rice: "쌀 요리", bread: "빵", dumpling: "만두류", meat: "고기 요리", seafood: "해산물", vegetable: "채소 요리",
  legume: "콩 요리", dairy: "유제품", street_food: "길거리 음식", creamy: "크리미한 맛", herbal: "허브 향", smoky: "훈연 향", rich: "진한 맛",
};

export function rankFoods<F extends RankFood>(
  foods: F[],
  p: TasteProfile,
  continentOf: (cc: string) => string | undefined,
  opts: { limit?: number; exclude?: Set<string>; ignored?: Record<string, number> } = {},
): Ranked<F>[] {
  const c = p.confidence;
  const visitedConts = new Set(Object.keys(p.continents));
  const scored = foods
    .filter((f) => !opts.exclude?.has(f.id) && !p.seen.has(f.slug) && signatureGate(f, p))
    .map((f) => {
      const tagHits = f.taste_tags.map((t) => [t, p.tags[t] ?? 0] as const).sort((a, b) => b[1] - a[1]);
      const tagAff = tagHits.length ? tagHits.slice(0, 3).reduce((a, [, v]) => a + v, 0) / Math.min(3, tagHits.length) : 0;
      const countryAff = p.countries[f.country_code] ?? 0;
      const cont = continentOf(f.country_code);
      const contAff = cont ? (p.continents[cont] ?? 0) : 0;
      const fame = fameScore(f.fame_rank);
      const novelty = cont && !visitedConts.has(cont) ? 1 : countryAff === 0 ? 0.5 : 0;
      const ignoredPenalty = Math.min(0.4, (opts.ignored?.[f.slug] ?? 0) * 0.1);
      const score = c * (0.45 * tagAff + 0.2 * countryAff + 0.1 * contAff) + fame * (1 - 0.6 * c) + 0.15 * novelty - ignoredPenalty;
      // 이유: 가장 크게 기여한 항목
      const parts: [number, string][] = [
        [fame * (1 - 0.6 * c), (f.fame_rank ?? 99) <= SIGNATURE_TOP ? `${f.country_name} 대표 음식` : `${f.country_name}에서 사랑받는 음식`],
        [c * 0.45 * tagAff, tagHits[0] && tagHits[0][1] > 0 ? `좋아하는 ${TAG_REASON[tagHits[0][0]] ?? "맛"}` : ""],
        [c * 0.2 * countryAff, `자주 본 ${f.country_name} 음식`],
        [c * 0.1 * contAff + 0.15 * novelty, novelty === 1 ? "아직 안 가본 대륙" : ""],
      ];
      const reason = parts.filter(([, r]) => r).sort((a, b) => b[0] - a[0])[0]?.[1] ?? "";
      return { food: f, score, reason };
    })
    .sort((a, b) => b.score - a.score || (a.food.fame_rank ?? 99) - (b.food.fame_rank ?? 99));

  // 다양성: 같은 나라 상한 + 안 가본 대륙 한 자리
  const limit = opts.limit ?? 6;
  const perCountry = c < 0.5 ? 1 : 2;
  const out: Ranked<F>[] = [];
  const count: Record<string, number> = {};
  const take = (r: Ranked<F>) => {
    out.push(r);
    count[r.food.country_code] = (count[r.food.country_code] ?? 0) + 1;
  };
  const fresh = scored.find((r) => {
    const cont = continentOf(r.food.country_code);
    return cont && !visitedConts.has(cont);
  });
  for (const r of scored) {
    if (out.length >= limit - (fresh && !out.includes(fresh) ? 1 : 0)) break;
    if ((count[r.food.country_code] ?? 0) >= perCountry) continue;
    take(r);
  }
  if (fresh && !out.includes(fresh) && out.length < limit) take({ ...fresh, reason: fresh.reason || "아직 안 가본 대륙" });
  return out;
}

/** 화면 표시용 요약: 상위 태그 · 나라 · 기능 */
export function topOf(w: Record<string, number>, n = 3) {
  return Object.entries(w)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
