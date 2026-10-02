// 베타 KPI 계산 (07 문서 §1). events 행 배열 → 숫자. DB·네트워크 없이 순수 함수라 vitest 로 검증한다.
// 정의는 docs/design/07_KPI_측정_v1.md "측정 방법" 과 같다 — 바꾸면 문서도 같이 고친다.

export type EventRow = {
  at: string | number | Date;
  anon_id: string;
  session_id: string | null;
  name: string;
  props: Record<string, unknown> | null;
};

/** 07 문서 §1 경진대회(베타) 목표 */
export const KPI_TARGETS = { northStar: 3, hops: 3, voiceRate: 0.6, acceptRate: 0.5, firstAudioP95Ms: 3000 } as const;

const MIN = 60_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** 상세 → 상세 사이가 이보다 길면 다른 탐험 줄기로 본다 */
export const HOP_GAP_MS = 10 * MIN;

export type Ev = { t: number; anon: string; session: string; name: string; props: Record<string, unknown> };

/** 시간순 정렬 + 세션 id 가 없으면 anon_id 로 대신 */
export function normalize(rows: EventRow[]): Ev[] {
  return rows
    .map((r) => ({ t: new Date(r.at).getTime(), anon: r.anon_id, session: r.session_id || `anon:${r.anon_id}`, name: r.name, props: r.props ?? {} }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t);
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);

function bySession(evs: Ev[]): Map<string, Ev[]> {
  const m = new Map<string, Ev[]>();
  for (const e of evs) {
    const list = m.get(e.session);
    if (list) list.push(e);
    else m.set(e.session, [e]);
  }
  return m;
}

/** 최근접 순위(nearest-rank) 백분위: 정렬 후 ceil(p·n) 번째 값 */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length, Math.max(1, Math.ceil(p * s.length))) - 1];
}

/**
 * 세션별 Hops: detail_view 를 시간순으로 이어, 10분 넘게 끊기면 새 줄기. 줄기 안 이동 횟수 = 상세 수 - 1.
 * 같은 음식이 연달아 찍힌 건(새로고침·개발 모드 이중 실행) 이동이 아니다. 세션 값 = 가장 긴 줄기.
 * detail_view 가 하나도 없는 세션은 제외한다.
 */
export function sessionHops(evs: Ev[]): number[] {
  const out: number[] = [];
  for (const list of bySession(evs).values()) {
    let best = -1;
    let cur = 0;
    let lastT = -Infinity;
    let lastFood: string | null = null;
    for (const e of list) {
      if (e.name !== "detail_view") continue;
      const food = str(e.props.food_id);
      const gap = e.t - lastT;
      if (gap > HOP_GAP_MS) cur = 0;
      else if (food !== lastFood) cur++;
      lastT = e.t;
      lastFood = food;
      best = Math.max(best, cur);
    }
    if (best >= 0) out.push(best);
  }
  return out;
}

export function hops(evs: Ev[]) {
  const per = sessionHops(evs);
  return { avg: mean(per), max: per.length ? Math.max(...per) : null, sessions: per.length };
}

/** 음성 사용률 = 음성 질의 / 전체 질의 (실패한 질의 포함) */
export function voiceRate(evs: Ev[]) {
  const asks = evs.filter((e) => e.name === "ask");
  const voice = asks.filter((e) => e.props.mode === "voice").length;
  return { rate: ratio(voice, asks.length), voice, total: asks.length };
}

/**
 * 추천 수락률 = 수락된 추천 카드 / 보여준 추천 카드.
 * 보여준 카드: 세션 안에서 ask.card_ids 의 서로 다른 음식 (card_ids 가 없으면 cards 개수만 분모에).
 * 수락: 같은 세션에서 그 카드를 '먼저 보여준 뒤' 생긴 rec_accept (상세 진입·좋아요). 같은 음식은 한 번만.
 */
export function acceptance(evs: Ev[]) {
  let shown = 0;
  let accepted = 0;
  for (const list of bySession(evs).values()) {
    const seen = new Set<string>();
    const took = new Set<string>();
    for (const e of list) {
      if (e.name === "ask") {
        const ids = Array.isArray(e.props.card_ids) ? e.props.card_ids.filter((x): x is string => typeof x === "string") : null;
        if (ids) ids.forEach((id) => seen.add(id));
        else shown += num(e.props.cards) ?? 0;
      } else if (e.name === "rec_accept") {
        const id = str(e.props.food_id);
        if (id && seen.has(id)) took.add(id);
      }
    }
    shown += seen.size;
    accepted += took.size;
  }
  return { rate: ratio(accepted, shown), accepted, shown };
}

/** 음성 응답 지연: 음성 질의의 발화 확정 → 첫 음성 재생 (first_audio_ms) p95. 참고로 전체 질의 응답 지연 p95 도 */
export function latency(evs: Ev[]) {
  const asks = evs.filter((e) => e.name === "ask");
  const audio = asks.filter((e) => e.props.mode === "voice").flatMap((e) => num(e.props.first_audio_ms) ?? []);
  const resp = asks.flatMap((e) => num(e.props.latency_ms) ?? []);
  return { firstAudioP95: percentile(audio, 0.95), firstAudioN: audio.length, responseP95: percentile(resp, 0.95), responseN: resp.length };
}

/** 사용자(anon)·나라 쌍마다 처음 나온 explore_country 만 (저장소를 지워 같은 나라가 다시 '새로' 찍혀도 한 번) */
export function firstExplores(evs: Ev[]): Ev[] {
  const seen = new Set<string>();
  return evs.filter((e) => {
    const c = str(e.props.country);
    if (e.name !== "explore_country" || !c) return false;
    const k = `${e.anon}|${c}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * North Star = 주간 신규 탐험 국가 수 / 활성 사용자. from 부터 7일 단위로 자르고, 주마다 (새 나라 수 / 그 주 활성 사용자) 의 평균.
 * 7일이 안 되는 마지막 조각은 빼되, 전체가 7일 미만이면 그 조각 하나로 계산한다(partial=true).
 */
export function northStar(evs: Ev[], from: number, to: number) {
  const explores = firstExplores(evs);
  const weeks: { start: number; full: boolean; newCountries: number; active: number; ratio: number | null }[] = [];
  for (let s = from; s < to; s += WEEK) {
    const e = Math.min(s + WEEK, to);
    const inWeek = (x: Ev) => x.t >= s && x.t < e;
    const active = new Set(evs.filter(inWeek).map((x) => x.anon)).size;
    const newCountries = explores.filter(inWeek).length;
    weeks.push({ start: s, full: e - s === WEEK, newCountries, active, ratio: ratio(newCountries, active) });
  }
  const full = weeks.filter((w) => w.full);
  const use = full.length ? full : weeks;
  const value = mean(use.flatMap((w) => w.ratio ?? []));
  return { value, weeks: use, partial: !full.length };
}

/** D7 재방문(참고): 처음 본 날로부터 7일이 지난 사용자 중 7~13일차에 다시 온 비율 */
export function d7Retention(evs: Ev[], to: number) {
  const first = new Map<string, number>();
  for (const e of evs) if (!first.has(e.anon)) first.set(e.anon, e.t);
  const cohort = [...first].filter(([, t]) => t + WEEK <= to);
  const back = new Set(cohort.filter(([anon, t0]) => evs.some((e) => e.anon === anon && e.t >= t0 + WEEK && e.t < t0 + 2 * WEEK)).map(([a]) => a));
  return { rate: ratio(back.size, cohort.length), cohort: cohort.length, retained: back.size };
}

export type DayRow = {
  day: string; // YYYY-MM-DD (tz 기준)
  active: number;
  asks: number;
  voiceRate: number | null;
  hopsAvg: number | null;
  acceptRate: number | null;
  firstAudioP95: number | null;
  newCountries: number;
};

export type KpiSummary = {
  from: number;
  to: number;
  days: number;
  events: number;
  activeUsers: number;
  sessions: number;
  northStar: ReturnType<typeof northStar>;
  newCountries: number;
  hops: ReturnType<typeof hops>;
  voice: ReturnType<typeof voiceRate>;
  accept: ReturnType<typeof acceptance>;
  latency: ReturnType<typeof latency>;
  d7: ReturnType<typeof d7Retention>;
  daily: DayRow[];
};

/** tz(분) 기준 그날 0시의 UTC ms */
export const startOfDay = (t: number, tzOffsetMin: number) => {
  const off = tzOffsetMin * MIN;
  return Math.floor((t + off) / DAY) * DAY - off;
};

/**
 * 기간 [from, to) 의 KPI. from 이 없으면(베타 전체) 첫 이벤트가 있는 날 0시부터.
 * 일별 값은 그날 이벤트만으로 다시 계산한다 — 자정을 넘긴 세션은 날짜별로 나뉜다(막대 그래프용 근사).
 */
export function computeKpis(rows: EventRow[], opts: { from?: number | null; to: number; now?: number; tzOffsetMin?: number }): KpiSummary {
  const tz = opts.tzOffsetMin ?? 540; // 한국 시간
  const all = normalize(rows);
  const to = opts.to;
  const from = opts.from ?? startOfDay(all[0]?.t ?? to, tz);
  const evs = all.filter((e) => e.t >= from && e.t < to);
  const explores = firstExplores(evs);

  const daily: DayRow[] = [];
  for (let d = startOfDay(from, tz); d < to; d += DAY) {
    const day = evs.filter((e) => e.t >= d && e.t < d + DAY);
    daily.push({
      day: new Date(d + tz * MIN).toISOString().slice(0, 10),
      active: new Set(day.map((e) => e.anon)).size,
      asks: day.filter((e) => e.name === "ask").length,
      voiceRate: voiceRate(day).rate,
      hopsAvg: hops(day).avg,
      acceptRate: acceptance(day).rate,
      firstAudioP95: latency(day).firstAudioP95,
      newCountries: explores.filter((e) => e.t >= d && e.t < d + DAY).length,
    });
  }

  return {
    from,
    to,
    days: Math.max(1, Math.ceil((to - from) / DAY)),
    events: evs.length,
    activeUsers: new Set(evs.map((e) => e.anon)).size,
    sessions: new Set(evs.map((e) => e.session)).size,
    northStar: northStar(evs, from, to),
    newCountries: explores.length,
    hops: hops(evs),
    voice: voiceRate(evs),
    accept: acceptance(evs),
    latency: latency(evs),
    d7: d7Retention(evs, Math.min(to, opts.now ?? to)), // 기간 끝이 오늘 자정이어도 7일 경과는 지금 기준
    daily,
  };
}
