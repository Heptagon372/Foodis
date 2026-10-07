// Food DNA 매칭 (순수 함수 — 테스트: dna.test.ts). 취향 엔진(engine.ts)과 Passport 기록(foodDna)을 합쳐
//   ① 나의 맛 DNA 가닥(상위 태그 0~1)을 만들고
//   ② 추천 후보마다 "어느 가닥과 이어지는지(links)"와 매칭 %를 계산하고
//   ③ 푸디 대화 시트가 먼저 건넬 인사·질문(유도)을 만든다.
// 후보 거르기(대표 음식 규칙·다양성·이미 본 음식)는 rankFoods 가 이미 했다 — 여기서는 순서만 DNA 로 다시 맞춘다.
import type { Ranked, RankFood, TasteProfile } from "./engine";

/** 가닥 이름 (화면·질문 공용). 없는 태그는 화면에서 숨긴다 */
export const STRAND_LABEL: Record<string, string> = {
  spicy: "매운맛", fermented: "발효", soupy: "국물", sweet: "단맛", sour: "새콤", salty: "짭짤", umami: "감칠맛",
  smoky: "훈연", herbal: "허브", creamy: "크리미", crispy: "바삭", rich: "진한맛", fresh: "산뜻", nutty: "고소",
  grilled: "구이", fried: "튀김", rice: "쌀", noodle: "면", bread: "빵", dumpling: "만두", meat: "고기",
  seafood: "해산물", vegetable: "채소", legume: "콩", dairy: "유제품", street_food: "길거리",
};

export type Strand = { tag: string; label: string; w: number };
export type DnaPick<F> = { food: F; match: number; links: string[]; reason: string };

const norm = (w: Record<string, number>) => {
  const max = Math.max(0, ...Object.values(w));
  return max > 0 ? Object.fromEntries(Object.entries(w).filter(([, v]) => v > 0).map(([k, v]) => [k, v / max])) : {};
};

/** 기록(Passport 의 맛 태그 가중합) 과 행동(취향 엔진 태그) 을 반반 섞어 상위 n 가닥. 이름을 모르는 태그는 뺀다 */
export function dnaStrands(passportDna: Record<string, number>, profileTags: Record<string, number>, n = 7): Strand[] {
  const a = norm(passportDna);
  const b = norm(profileTags);
  const mixed: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) mixed[k] = 0.5 * (a[k] ?? 0) + 0.5 * (b[k] ?? 0);
  return Object.entries(norm(mixed))
    .filter(([k]) => STRAND_LABEL[k])
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, n)
    .map(([tag, w]) => ({ tag, label: STRAND_LABEL[tag], w }));
}

/** 한 음식의 DNA 매칭: 이어지는 가닥(무게 큰 순)과 0~99 %.
 *  match = 강도 70% + 음식 맛 중 내 가닥에 닿는 비율 30%. 강도 = 이어진 가닥 상위 2개 무게 합 / 1.5 (최대 1) — 두 가닥에 닿으면 한 가닥보다 세다. 하나도 안 닿으면 0 */
export function dnaMatch(tags: string[], strands: Strand[]): { match: number; links: string[] } {
  const w = new Map(strands.map((s) => [s.tag, s.w]));
  const hits = [...new Set(tags)].filter((t) => w.has(t)).sort((x, y) => w.get(y)! - w.get(x)!);
  if (!hits.length) return { match: 0, links: [] };
  const strength = Math.min(1, hits.slice(0, 2).reduce((a, t) => a + w.get(t)!, 0) / 1.5);
  const coverage = hits.length / Math.max(1, Math.min(3, new Set(tags).size));
  return { match: Math.min(99, Math.round(100 * (0.7 * strength + 0.3 * Math.min(1, coverage)))), links: hits };
}

/** 취향 엔진 후보를 DNA 매칭으로 다시 줄 세운다: 최종 = 엔진 점수 순위 40% + DNA 매칭 60%. 이어진 가닥이 있는 음식을 먼저 n 개 */
export function dnaPicks<F extends RankFood>(ranked: Ranked<F>[], strands: Strand[], n = 4): DnaPick<F>[] {
  if (!ranked.length) return [];
  const scored = ranked.map((r, i) => {
    const m = dnaMatch(r.food.taste_tags, strands);
    const rankScore = 1 - i / ranked.length;
    return { food: r.food, match: m.match, links: m.links, reason: r.reason, final: 0.4 * rankScore + 0.6 * (m.match / 100) };
  });
  const linked = scored.filter((s) => s.links.length).sort((a, b) => b.final - a.final);
  const rest = scored.filter((s) => !s.links.length);
  return [...linked, ...rest].slice(0, n).map(({ food, match, links, reason }) => ({ food, match, links, reason }));
}

/** 이 음식을 이은 가닥으로 쓰는 한 줄 이유 ("매운맛·발효 DNA") — 가닥이 없으면 엔진 이유 */
export const pickReason = (p: DnaPick<unknown>) => (p.links.length ? `${p.links.slice(0, 2).map((t) => STRAND_LABEL[t]).join("·")} DNA` : p.reason);

/** 받침 있으면 '이랑'·'에', 없으면 '랑' (한글 아닌 끝 글자는 받침 없음으로) */
const batchim = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0;
};
const irang = (w: string) => w + (batchim(w) ? "이랑" : "랑");

const CONTINENT_KO: Record<string, string> = { asia: "아시아", europe: "유럽", mena_africa: "중동·아프리카", americas: "아메리카", oceania: "오세아니아" };

/** 푸디가 먼저 건넬 인사와 질문 3개 (대화 시트가 비어 있을 때). 신호가 없으면 null → 기본 질문.
 *  질문은 오케스트레이터가 이미 아는 말(맛·나라·대륙 이름 + "추천")로만 만든다 — 의도 분류가 그대로 받는다 */
export function foodiNudge(
  strands: Strand[],
  p: Pick<TasteProfile, "countries" | "continents" | "confidence">,
  names: { country: (cc: string) => string | undefined },
  allContinents: string[] = Object.keys(CONTINENT_KO),
): { greeting: string; questions: string[] } | null {
  if (!strands.length) return null;
  const [a, b] = strands;
  const questions: string[] = [];
  questions.push(`${a.label} 음식 다른 나라 거 추천해줘`);
  if (b) questions.push(`${irang(a.label)} ${b.label} 둘 다 있는 음식 추천해줘`);
  const unseen = allContinents.find((c) => !(p.continents[c] > 0));
  if (unseen) questions.push(`아직 안 가본 ${CONTINENT_KO[unseen]} 음식 하나 추천해줘`);
  // 대륙을 다 가 봤으면 세 번째 가닥으로 (부정 표현 "~말고"는 의도 분류가 못 알아들어 쓰지 않는다)
  const c = strands[2];
  if (c && questions.length < 3) questions.push(`${c.label} 음식 하나 추천해줘`);
  const topCountry = Object.entries(p.countries).sort((x, y) => y[1] - x[1])[0]?.[0];
  const cname = topCountry ? names.country(topCountry) : undefined;
  if (cname && questions.length < 3) questions.push(`${cname} ${a.label} 음식 추천해줘`);
  const sure = p.confidence >= 0.3;
  const greeting = sure
    ? `${a.label}${b ? `·${b.label}` : ""} DNA 탐험가님, 오늘은 이쪽으로 떠나볼까요?`
    : `${a.label}에 끌리시는군요. 비슷한 음식부터 찾아볼까요?`;
  return { greeting, questions: questions.slice(0, 3) };
}
