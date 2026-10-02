// 급상승 계산 (순수 함수, 테스트: trends.test.ts). 뉴스 기사·커뮤니티 글의 '음식 언급'을 모아
//   최근 48시간 언급 vs 그 전 7일 평균(48시간 환산) → 성장 배수 → 점수 = 최근 언급 × √성장(최대 9배)
// 순위 변동(▲·NEW)은 6시간 전 시점으로 같은 계산을 한 번 더 해서 비교한다 (실시간 검색어처럼).
import { norm } from "./keywords";

export type Mention = { term: string; slug: string | null; at: number; weight: number; source: "news" | "community" };

export type RisingItem = {
  term: string;
  slug: string | null;
  rank: number;
  /** 6시간 전 순위 (그때 목록에 없었으면 null) */
  prevRank: number | null;
  badge: "new" | "up" | "same" | "down";
  /** 순위가 몇 칸 올랐나 (내려가면 음수) */
  delta: number;
  recent: number;
  /** 성장 배수 (최근 48h ÷ 이전 평균) */
  growth: number;
  score: number;
  news: number;
  community: number;
};

const H = 3_600_000;
export const RISING = { recentMs: 48 * H, baseMs: 7 * 24 * H, shiftMs: 6 * H, minRecent: 2, limit: 10 } as const;

type Row = { key: string; term: string; slug: string | null; recent: number; growth: number; score: number; news: number; community: number };

function scoreAt(mentions: Mention[], t: number): Row[] {
  const m = new Map<string, { forms: Map<string, number>; slug: string | null; recent: number; base: number; news: number; community: number }>();
  for (const x of mentions) {
    const age = t - x.at;
    if (age < 0 || age > RISING.recentMs + RISING.baseMs) continue;
    const key = norm(x.term);
    const e = m.get(key) ?? { forms: new Map(), slug: null, recent: 0, base: 0, news: 0, community: 0 };
    e.forms.set(x.term, (e.forms.get(x.term) ?? 0) + 1);
    e.slug ??= x.slug;
    if (age <= RISING.recentMs) {
      e.recent += x.weight;
      if (x.source === "news") e.news++;
      else e.community++;
    } else e.base += x.weight;
    m.set(key, e);
  }
  const rows: Row[] = [];
  for (const [key, e] of m) {
    if (e.recent < RISING.minRecent) continue;
    const baseRate = e.base * (RISING.recentMs / RISING.baseMs);
    const growth = (e.recent + 1) / (baseRate + 1);
    const score = e.recent * Math.sqrt(Math.min(growth, 9));
    // 가장 많이 쓰인 표기로 보여 준다
    const term = [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
    rows.push({ key, term, slug: e.slug, recent: round(e.recent), growth: round(growth), score: round(score), news: e.news, community: e.community });
  }
  return rows.sort((a, b) => b.score - a.score || b.recent - a.recent || a.key.localeCompare(b.key));
}

const round = (n: number) => Math.round(n * 100) / 100;

export function rankRising(mentions: Mention[], now = Date.now(), limit: number = RISING.limit): RisingItem[] {
  const cur = scoreAt(mentions, now).slice(0, limit);
  const prev = new Map(scoreAt(mentions, now - RISING.shiftMs).slice(0, limit * 2).map((r, i) => [r.key, i + 1]));
  return cur.map((r, i) => {
    const rank = i + 1;
    const p = prev.get(r.key) ?? null;
    const delta = p == null ? 0 : p - rank;
    return {
      term: r.term,
      slug: r.slug,
      rank,
      prevRank: p,
      badge: p == null ? "new" : delta > 0 ? "up" : delta < 0 ? "down" : "same",
      delta,
      recent: r.recent,
      growth: r.growth,
      score: r.score,
      news: r.news,
      community: r.community,
    };
  });
}

/** 모임 열기: 최근 48시간 가입 + 글×2 가 이전 평균의 2배 넘게 늘면 급상승 */
export function clubHeat(activity: { club_id: string; at: number; kind: "join" | "post" }[], now = Date.now()): Map<string, { recent: number; rising: boolean }> {
  const m = new Map<string, { recent: number; base: number }>();
  for (const a of activity) {
    const age = now - a.at;
    if (age < 0 || age > RISING.recentMs + RISING.baseMs) continue;
    const e = m.get(a.club_id) ?? { recent: 0, base: 0 };
    const w = a.kind === "post" ? 2 : 1;
    if (age <= RISING.recentMs) e.recent += w;
    else e.base += w;
    m.set(a.club_id, e);
  }
  return new Map(
    [...m].map(([id, e]) => {
      const baseRate = e.base * (RISING.recentMs / RISING.baseMs);
      return [id, { recent: e.recent, rising: e.recent >= 3 && e.recent >= 2 * baseRate + 1 }];
    }),
  );
}
