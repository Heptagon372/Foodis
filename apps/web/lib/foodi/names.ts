// 음식 이름 인식기 (docs/design/19 §4). 1만 개 이름 중 두 글자 이름만 956개("아시"·"부자"·"로스")라
// 단순 includes 로는 "아시아 음식"이 아프가니스탄의 '아시'가 된다. 규칙:
//   ① 띄어쓰기 무시 최장 일치 (똠 얌 꿍 = 똠얌꿍) — 겹치면 긴 이름이 이긴다
//   ② 짧은 한국어 이름(≤2자)은 앞이 글자가 아니고 뒤가 끝·조사·음식 관련 말일 때만
//   ③ 띄어쓰기를 건너 붙은 일치는 단어 경계에서 시작·끝날 때만
//   ④ 같은 이름이 여러 나라에 있으면(47쌍) 발화의 나라 → 유명도 순
//   ⑤ 정확히 없으면 자모 편집거리로 가장 가까운 이름 (음성 인식 오타: 똠양꿍 → 똠얌꿍)
import type { FoodName } from "./repo";

const HANGUL = /[가-힣]/;
const LETTER = /[가-힣a-z0-9]/;
const PARTICLE = "의|에서|에|은|는|이|가|을|를|도|만|로|으로|랑|이랑|하고|과|와|까지|부터|이야|야|이란|란|이라는|라는|이에요|예요|인데|이나|나|같은|처럼|요";
const FOLLOW =
  "요리|음식|먹|맛|추천|알려|설명|어때|어떤|뭐|무슨|좋아|같은|비슷|닮은|처럼|말고|빼고|들어|넣|만들|레시피|이야기|기원|유래|역사|문화|주문|사진|보여|소개|드셔|마셔|마실|" +
  "(?:한|두|세|몇)\\s*(?:그릇|접시|잔|개|번|입|조각)";
/** 짧은 이름(≤3자) 뒤에 와도 되는 말: 끝·문장부호 · 조사(뒤가 끊김) · 띄우고 음식 관련 말. "부자 되는"·"로스트 치킨"은 안 된다 */
const SHORT_AFTER = new RegExp(`^(?:$|\\s*[,.?!~·]|(?:${PARTICLE})(?=$|[\\s,.?!~])|\\s*(?:${FOLLOW}))`);
/** 한 글자 이름(회·전·묵·쌈·난 …)은 '그 음식을 묻는' 꼴일 때만: "회 추천해줘" ○ · "난 뭐 먹지?"(나는) ✕ */
const ONE_AFTER = /^(?:은|는|이|가|을|를|이란|란)?\s*(?:알려|설명|어떤\s*음식|무슨\s*음식|뭐야|뭔데|추천|레시피|이야기|기원|유래|먹어\s*보|맛\s*(?:있|어때))/;
/** 두 글자 이하 이름은 문장이 음식 이야기일 때만 ("부자가 되고 싶어"의 부자는 음식이 아니다) */
const FOOD_CONTEXT = /음식|요리|먹|맛|메뉴|추천|알려|설명|뭐야|뭔데|어떤|무슨|이야기|기원|유래|비슷|닮은|레시피|배고|출출|디저트|간식|마시|마실|음료|주문|식당/;

const stripMarks = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").normalize("NFC");
/** 비교 키: 소문자 · 악센트 제거 · 띄어쓰기·구두점 제거 */
export const nameKey = (s: string) => stripMarks(s.toLowerCase()).replace(/[\s·\-'’`.,()]/g, "");

export type NameEntry = { id: string; name: string; key: string; country_code?: string; fame: number };
export type Mention = { start: number; end: number; text: string; entries: NameEntry[] };

export type NameIndex = {
  byKey: Map<string, NameEntry[]>;
  maxLen: number;
  /** 한국어 이름 음절 → 이름 키 (오타 교정 후보 찾기) */
  bySyllable: Map<string, Set<string>>;
};

/** 대표성 s_fame = 0.35·나라 안 순위 점수 + 0.65·세계 유명도 (docs/design/19 §6)
 *   나라 안 순위 r → 1 / (1 + ln r)            1위 1.0 · 2위 0.59 · 10위 0.30 · 100위 0.18
 *   세계 유명도 L(위키 언어판 수) → (ln(1+L) − ln 3) / (ln 81 − ln 3), 0~1   L=2 → 0 · 5 → .21 · 21 → .61 · 36 → .75 · 80↑ → 1
 *   음식 5개뿐인 나라의 1위(거북이 수프 L=21)가 김치(L=77)와 같은 점수를 받지 않게 세계 쪽을 더 무겁게 둔다 */
export function fameScore(rank: number | null | undefined, links?: number | null): number {
  const r = rank && rank > 0 ? 1 / (1 + Math.log(rank)) : null;
  const g = links != null ? Math.min(1, Math.max(0, (Math.log(1 + links) - Math.log(3)) / (Math.log(81) - Math.log(3)))) : null;
  if (r !== null && g !== null) return 0.35 * r + 0.65 * g;
  return r ?? (g !== null ? g : 0.15);
}

const memo = new WeakMap<readonly FoodName[], NameIndex>();

export function nameIndexOf(foods: readonly FoodName[]): NameIndex {
  let idx = memo.get(foods);
  if (!idx) memo.set(foods, (idx = buildNameIndex(foods)));
  return idx;
}

export function buildNameIndex(foods: readonly FoodName[]): NameIndex {
  const byKey = new Map<string, NameEntry[]>();
  const bySyllable = new Map<string, Set<string>>();
  let maxLen = 2;
  for (const f of foods) {
    const fame = fameScore(f.fame_rank, f.links);
    const raw = [f.name_ko, f.name_en, f.name_local].filter((n): n is string => Boolean(n && n.trim()));
    // "하이밀히(건초 우유)"·"던롭 (치즈)" 처럼 괄호 설명이 붙은 이름은 괄호 밖 이름으로도 찾는다
    const names = new Set([...raw, ...raw.map((n) => n.replace(/\s*\([^)]*\)\s*/g, " ").trim()).filter(Boolean)]);
    for (const name of names) {
      const key = nameKey(name);
      if (key.length < 2 && !(key.length === 1 && HANGUL.test(key))) continue;
      const list = byKey.get(key) ?? byKey.set(key, []).get(key)!;
      if (!list.some((e) => e.id === f.id)) list.push({ id: f.id, name, key, country_code: f.country_code, fame });
      maxLen = Math.max(maxLen, Math.min(key.length, 40));
      if (HANGUL.test(key)) for (const ch of new Set(key)) (bySyllable.get(ch) ?? bySyllable.set(ch, new Set()).get(ch)!).add(key);
    }
  }
  return { byKey, maxLen, bySyllable };
}

/** 소문자·악센트 제거만 한 글 + 띄어쓰기 뺀 글자들의 원래 위치 */
function compact(text: string) {
  const t = stripMarks(text.toLowerCase());
  let c = "";
  const pos: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (/[\s·\-'’`.,()]/.test(t[i])) continue;
    c += t[i];
    pos.push(i);
  }
  return { t, c, pos };
}

/** 발화 안의 음식 이름들 (겹치지 않게, 앞에서부터).
 *  inside: 나라·대륙 이름 구간 — 그 안에 '들어가는' 음식 이름은 버린다 ("아시아"의 아시). 나라 이름을 품은 음식 이름(튀르키예 커피)은 살린다 */
export function findMentions(text: string, idx: NameIndex, inside: [number, number][] = [], opts: { assumeFood?: boolean } = {}): Mention[] {
  const { t, c, pos } = compact(text);
  const foodish = opts.assumeFood || FOOD_CONTEXT.test(t);
  const found: Mention[] = [];
  for (let i = 0; i < c.length; i++) {
    for (let len = Math.min(idx.maxLen, c.length - i); len >= 1; len--) {
      const entries = idx.byKey.get(c.slice(i, i + len));
      if (!entries) continue;
      const start = pos[i];
      const end = pos[i + len - 1] + 1;
      if (!boundaryOk(t, start, end, len, foodish)) continue;
      if (inside.some(([s, e]) => start >= s && end <= e)) continue;
      found.push({ start, end, text: t.slice(start, end), entries });
    }
  }
  // 긴 이름 우선, 같은 길이면 앞쪽 — 겹치지 않게 고른다
  found.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const out: Mention[] = [];
  for (const m of found) if (!out.some((o) => m.start < o.end && m.end > o.start)) out.push(m);
  return out.sort((a, b) => a.start - b.start);
}

function boundaryOk(t: string, start: number, end: number, keyLen: number, foodish: boolean): boolean {
  const span = t.slice(start, end);
  const before = t[start - 1] ?? "";
  const after = t.slice(end);
  if (!HANGUL.test(span)) {
    // 영문 이름: 단어 경계 ("woman" 안의 Oman 같은 것 방지)
    return !/[a-z0-9]/.test(before) && !/^[a-z0-9]/.test(after);
  }
  if (keyLen === 1) return foodish && !LETTER.test(before) && ONE_AFTER.test(after);
  if (keyLen <= 2) return foodish && !LETTER.test(before) && SHORT_AFTER.test(after);
  // 세 글자 이름·띄어 쓴 이름: 뒤가 다른 낱말로 이어지면 더 긴 이름의 일부다 ("로스트 치킨"의 로스트)
  if (keyLen === 3 || /\s/.test(span)) return (!/\s/.test(span) || !LETTER.test(before)) && SHORT_AFTER.test(after);
  return true;
}

/** 같은 이름이 여러 음식일 때: 발화에 나온 나라 → 유명도 */
export function pickEntry(entries: NameEntry[], countryHint?: string | null): NameEntry {
  if (countryHint) {
    const same = entries.find((e) => e.country_code === countryHint);
    if (same) return same;
  }
  return [...entries].sort((a, b) => b.fame - a.fame)[0];
}

// ── 자모 편집거리 (음성 인식 오타 교정)
const jamo = (s: string): number[] => {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) {
      out.push(ch.charCodeAt(0) + 100000);
      continue;
    }
    out.push(Math.floor(c / 588), 19 + (Math.floor(c / 28) % 21));
    if (c % 28) out.push(40 + (c % 28));
  }
  return out;
};

export function editDistance<T>(a: ArrayLike<T>, b: ArrayLike<T>, cap = Infinity): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** 정확히 일치하는 이름이 없을 때 가장 가까운 이름. 한국어는 자모 거리 (3음절 1 · 5음절 2 · 그 이상 3), 영어는 글자 거리 */
export function fuzzyFind(term: string, idx: NameIndex): NameEntry | null {
  const key = nameKey(term);
  if (key.length < 3) return null;
  if (HANGUL.test(key)) {
    const syl = [...key];
    const counts = new Map<string, number>();
    for (const ch of new Set(syl)) for (const k of idx.bySyllable.get(ch) ?? []) counts.set(k, (counts.get(k) ?? 0) + 1);
    const need = Math.ceil(syl.length / 2);
    const cap = syl.length <= 3 ? 1 : syl.length <= 5 ? 2 : 3;
    const target = jamo(key);
    let best: { e: NameEntry; d: number } | null = null;
    for (const [k, n] of counts) {
      if (n < need || Math.abs([...k].length - syl.length) > 1) continue;
      const d = editDistance(target, jamo(k), cap);
      if (d > cap) continue;
      const e = pickEntry(idx.byKey.get(k)!);
      if (!best || d < best.d || (d === best.d && e.fame > best.e.fame)) best = { e, d };
    }
    return best?.e ?? null;
  }
  if (!/^[a-z]+$/.test(key) || key.length < 5) return null;
  const cap = key.length <= 8 ? 1 : 2;
  let best: { e: NameEntry; d: number } | null = null;
  for (const [k, entries] of idx.byKey) {
    if (k[0] !== key[0] || Math.abs(k.length - key.length) > cap || !/^[a-z]+$/.test(k)) continue;
    const d = editDistance(key, k, cap);
    if (d <= cap && (!best || d < best.d)) best = { e: pickEntry(entries), d };
  }
  return best?.e ?? null;
}
