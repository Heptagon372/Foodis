// 커뮤니티 → AI 반영의 계산부 (순수 함수, 테스트: trends.test.ts).
//  ① 모두의 행동 신호(community_signals) → 카테고리별 '요즘 열기'(trend) — 브리핑·인기 배지·맞춤 피드에 쓴다
//  ② 내 행동(브라우저에만 저장, lib/client/community.ts) → 관심 가중치(interest) — 서버엔 정규화한 숫자만 온다
//  ③ 둘 + 글의 반응·신선도 → 맞춤 피드 순서와 "왜 이 글?" 이유
import { CATEGORY, CATEGORY_KEYS, type CategoryKey } from "./categories";
import { buddyState, type PostRow, type Signal, type SignalKind } from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 행동 무게: 지나가며 누른 것 < 열어 본 것 < 반응한 것 < 직접 쓴 것 */
export const SIGNAL_WEIGHT: Record<SignalKind, number> = { tap: 1, view: 2, vote: 2, like: 3, share: 3, join: 4, comment: 4, post: 6 };
/** 열기 반감기: 사흘 전 행동은 절반만 */
export const TREND_HALF_LIFE_MS = 3 * DAY;
export const TREND_WINDOW_MS = 14 * DAY;

export type Trend = {
  category: CategoryKey;
  /** 감쇠 합 */
  score: number;
  /** 0~1 (가장 뜨거운 카테고리 = 1) */
  heat: number;
  /** 최근 48시간 점수가 그 전 5일 평균보다 1.5배 이상 */
  rising: boolean;
  posts7d: number;
};

const decay = (age: number, halfLife: number) => Math.pow(0.5, Math.max(0, age) / halfLife);

export function computeTrends(signals: Pick<Signal, "kind" | "category" | "at">[], posts: Pick<PostRow, "category" | "created_at">[], now = Date.now()): Trend[] {
  const score = new Map<CategoryKey, number>();
  const recent = new Map<CategoryKey, number>();
  const before = new Map<CategoryKey, number>();
  for (const s of signals) {
    if (!s.category) continue;
    const age = now - new Date(s.at).getTime();
    if (age > TREND_WINDOW_MS || age < -HOUR) continue;
    const w = SIGNAL_WEIGHT[s.kind];
    score.set(s.category, (score.get(s.category) ?? 0) + w * decay(age, TREND_HALF_LIFE_MS));
    if (age <= 2 * DAY) recent.set(s.category, (recent.get(s.category) ?? 0) + w);
    else if (age <= 7 * DAY) before.set(s.category, (before.get(s.category) ?? 0) + w);
  }
  const posts7d = new Map<CategoryKey, number>();
  for (const p of posts) if (now - new Date(p.created_at).getTime() <= 7 * DAY) posts7d.set(p.category, (posts7d.get(p.category) ?? 0) + 1);

  const max = Math.max(0, ...score.values());
  return CATEGORY_KEYS.map((category) => {
    const s = score.get(category) ?? 0;
    const r = recent.get(category) ?? 0;
    // 하루 평균으로 비교 (최근 2일 vs 그 전 5일). 신호가 몇 개 안 될 땐 '급상승'이라 부르지 않는다
    const rising = r >= 6 && r / 2 >= 1.5 * ((before.get(category) ?? 0) / 5);
    return { category, score: round(s), heat: max > 0 ? round(s / max) : 0, rising, posts7d: posts7d.get(category) ?? 0 };
  }).sort((a, b) => b.score - a.score || CATEGORY_KEYS.indexOf(a.category) - CATEGORY_KEYS.indexOf(b.category));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ── 관심 가중치 (클라이언트가 브라우저에 쌓는 값과 같은 규칙)
export type InterestEntry = { w: number; at: number };
export type InterestMap = Partial<Record<CategoryKey, InterestEntry>>;
/** 내 관심 반감기: 2주 */
export const INTEREST_HALF_LIFE_MS = 14 * DAY;

export function bumpInterest(m: InterestMap, category: CategoryKey, kind: SignalKind, now = Date.now()): InterestMap {
  const cur = m[category];
  const w = (cur ? cur.w * decay(now - cur.at, INTEREST_HALF_LIFE_MS) : 0) + SIGNAL_WEIGHT[kind];
  return { ...m, [category]: { w: Math.min(round(w), 500), at: now } };
}

/** 0~1 정규화 (가장 큰 관심 = 1). 서버로는 이 숫자만 보낸다 */
export function normalizeInterest(m: InterestMap, now = Date.now()): Partial<Record<CategoryKey, number>> {
  const cur = Object.entries(m).map(([k, e]) => [k, e ? e.w * decay(now - e.at, INTEREST_HALF_LIFE_MS) : 0] as const);
  const max = Math.max(0, ...cur.map(([, w]) => w));
  if (max <= 0) return {};
  return Object.fromEntries(cur.filter(([, w]) => w / max >= 0.05).map(([k, w]) => [k, round(w / max)]));
}

/** "halal:1,korean:0.42" ↔ 객체 (GET 쿼리용, 모르는 카테고리·이상한 값은 버림) */
export const encodeInterest = (n: Partial<Record<CategoryKey, number>>) =>
  Object.entries(n)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 6)
    .map(([k, w]) => `${k}:${Math.round((w ?? 0) * 100) / 100}`)
    .join(",");
export function decodeInterest(s: string | null | undefined): Partial<Record<CategoryKey, number>> {
  const out: Partial<Record<CategoryKey, number>> = {};
  for (const part of (s ?? "").slice(0, 200).split(",")) {
    const [k, v] = part.split(":");
    const w = Number(v);
    if ((CATEGORY_KEYS as readonly string[]).includes(k) && Number.isFinite(w) && w > 0) out[k as CategoryKey] = Math.min(1, w);
  }
  return out;
}

// ── 피드 순서
export type Ranked<T> = { post: T; score: number; reason: string | null };

const engagement = (p: Pick<PostRow, "like_count" | "comment_count" | "join_count">) => p.like_count + 2 * p.comment_count + 2 * p.join_count;

export function popularity(p: Pick<PostRow, "like_count" | "comment_count" | "join_count" | "created_at">, now = Date.now()) {
  // 반응 수를 시간으로 나눈다 (해커뉴스식): 오래된 글이 맨 위에 붙어 있지 않게
  const hours = Math.max(0, (now - new Date(p.created_at).getTime()) / HOUR);
  return (engagement(p) + 1) / Math.pow(hours + 2, 1.2);
}

/**
 * AI 맞춤 피드: 내 관심(0.45) + 모두의 열기(0.2) + 반응(0.2) + 신선도(0.35) — 지난 밥약속은 뒤로.
 * 관심이 하나도 없으면(첫 방문) 열기·반응·신선도만으로 정한다.
 */
export function rankForYou<T extends PostRow>(posts: T[], interest: Partial<Record<CategoryKey, number>>, trends: Trend[], now = Date.now()): Ranked<T>[] {
  const heat = new Map(trends.map((t) => [t.category, t]));
  const maxEng = Math.max(1, ...posts.map(engagement));
  const top = Object.entries(interest).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0];
  return posts
    .map((post) => {
      const i = interest[post.category] ?? 0;
      const t = heat.get(post.category);
      const h = t?.heat ?? 0;
      const e = Math.log1p(engagement(post)) / Math.log1p(maxEng);
      const fresh = decay(now - new Date(post.created_at).getTime(), 2 * DAY);
      const past = buddyState(post, now) === "past";
      const score = 0.45 * i + 0.2 * h + 0.2 * e + 0.35 * fresh - (past ? 0.6 : 0);
      // 이유는 가장 크게 기여한 쪽으로 (사용자가 '왜 이게 위에?'를 이해할 수 있게)
      const label = CATEGORY[post.category].label;
      const reason =
        i >= 0.5 && !past
          ? post.category === top
            ? `자주 보는 ${label}`
            : `관심 있는 ${label}`
          : t?.rising
            ? `요즘 뜨는 ${label}`
            : e >= 0.6
              ? "반응 많은 글"
              : fresh >= 0.8
                ? "방금 올라온 글"
                : null;
      return { post, score: round(score), reason };
    })
    .sort((a, b) => b.score - a.score || b.post.created_at.localeCompare(a.post.created_at));
}
