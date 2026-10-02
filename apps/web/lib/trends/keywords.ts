// 제목·글에서 '음식 키워드' 뽑기 (규칙 — 무료·즉시·재현 가능). 뉴스 헤드라인과 커뮤니티 글이 같은 함수를 쓴다.
// 세 갈래: ① 우리 DB 음식 이름(slug 연결) ② 유행 음식 사전 ③ 음식 꼬리말(…탕·…쿠키·…버거) 규칙.
// "두바이쫀득쿠키"처럼 DB 에 없는 새 유행 음식도 ③으로 잡힌다. 조사(이·가·을…)는 떼어 보고 맞을 때만 뗀다 ("떡볶이"의 '이'를 지우지 않게).
export type FoodVocab = { foods: { slug: string; name_ko: string }[] };
export type FoodTerm = { term: string; slug: string | null };

/** 유행·대중 음식 사전 (DB 에 없을 수 있는 것 위주). 추가는 자유 — 정규화 키(공백 제거)로 비교한다 */
export const TREND_LEXICON = [
  "마라탕", "마라샹궈", "탕후루", "요아정", "두바이초콜릿", "두바이쫀득쿠키", "약과", "크로플", "소금빵", "베이글", "약과쿠키", "에그타르트",
  "떡볶이", "로제떡볶이", "김밥", "집밥", "편의점도시락", "오마카세", "하이볼", "막걸리", "제로슈거", "프로틴", "그릭요거트", "포케",
  "샐러드", "비건", "할랄", "코셔", "대체육", "배양육", "쌀국수", "팟타이", "타코", "부리토", "케밥", "훠궈", "딤섬", "샤오롱바오",
  "라멘", "스시", "초밥", "우동", "돈카츠", "규동", "텐동", "카레", "치킨", "피자", "햄버거", "파스타", "스테이크", "바비큐",
  "빙수", "젤라또", "아이스크림", "크루아상", "도넛", "마카롱", "케이크", "쿠키", "초콜릿", "커피", "말차", "흑당", "버블티",
  "김치", "비빔밥", "불고기", "삼겹살", "냉면", "국밥", "순대", "곱창", "한우",
] as const;

// 꼬리말: 이것으로 끝나는 낱말은 음식으로 본다. 한 글자 꼬리말은 3글자 이상 낱말만 (온탕·화면 같은 오탐 방지)
const SUFFIX_LONG = ["냉면", "짜장면", "쫄면", "소면", "칼국수", "국수", "버거", "피자", "치킨", "커피", "라떼", "쿠키", "케이크", "초콜릿", "젤리", "샐러드", "덮밥", "찌개", "전골", "만두", "카레", "김밥", "파스타", "아이스크림", "도넛", "토스트", "와플", "빙수", "마카롱", "볶음밥", "비빔밥", "떡볶이", "라면", "짬뽕", "짜장", "갈비", "구이", "튀김", "타르트", "푸딩", "스무디", "에이드", "주스"];
// '면'은 어미(먹으면·메뉴면)와 겹쳐 꼬리말로 쓰지 않고, 면 요리는 SUFFIX_LONG·사전에 이름으로 둔다
const SUFFIX_SHORT = ["탕", "밥", "빵", "떡", "국", "죽"];
const STOP = new Set(["목욕탕", "대중탕", "비대면", "대면", "측면", "전면", "반면", "이면", "화면", "지면", "국면", "정면", "표면", "내면", "외면", "평면", "앞면", "뒷면", "단면", "방면", "일면", "양면", "사면",
  "결국", "약국", "부국", "전국", "한국", "미국", "중국", "영국", "외국", "본국", "천국", "강국", "약국", "당국", "타국", "애국", "각국", "제국", "모국", "왕국", "입국", "출국", "귀국",
  "빵빵", "무떡", "아빵", "지난밥", "밥상머리", "한탕", "재탕", "삼탕", "사탕발림", "설탕", "사탕", "구이구이", "아이스크림콘",
  // 제너릭(너무 넓어 유행을 가리는 말)
  "음식", "요리", "메뉴", "디저트", "음료", "식품", "먹거리", "맛집"]);

/** DB 음식 이름이지만 기사에서는 거의 다른 뜻으로 쓰이는 말 */
const DB_STOP = new Set(["페스티벌"]);

const PARTICLES = ["으로", "에서", "까지", "부터", "처럼", "보다", "이라", "라는", "이랑", "에게", "하고", "인기", "열풍", "와", "과", "은", "는", "이", "가", "을", "를", "의", "도", "로", "에", "만", "랑"];

export const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const LEX = new Map<string, string>(TREND_LEXICON.map((t) => [norm(t), t]));

function looksFood(w: string): boolean {
  if (w.length < 2 || w.length > 12 || STOP.has(w)) return false;
  if (LEX.has(norm(w))) return true;
  if (SUFFIX_LONG.some((s) => w.endsWith(s))) return true;
  return w.length >= 3 && SUFFIX_SHORT.some((s) => w.endsWith(s));
}

/** 낱말과 조사를 뗀 형태들 */
const forms = (token: string) => [token, ...PARTICLES.filter((p) => token.length - p.length >= 2 && token.endsWith(p)).map((p) => token.slice(0, -p.length))];

/** 낱말 하나 → 음식이면 표기, 아니면 null. 원형 먼저, 안 되면 조사를 떼 본다 */
function asFood(token: string): string | null {
  if (looksFood(token)) return token;
  for (const p of PARTICLES) {
    if (token.length - p.length >= 2 && token.endsWith(p)) {
      const base = token.slice(0, -p.length);
      if (looksFood(base)) return base;
    }
  }
  return null;
}

/** 텍스트 → 음식 키워드 (중복 없이, 최대 max개). DB 음식은 slug 를 붙인다 */
export function extractFoodTerms(text: string, vocab: FoodVocab, max = 5): FoodTerm[] {
  const t = text.slice(0, 1000);
  const flat = norm(t);
  const out = new Map<string, FoodTerm>();
  const tokens = t.split(/[^가-힣A-Za-z0-9]+/).filter(Boolean);
  const tokenForms = new Set(tokens.flatMap((tok) => forms(tok).map(norm)));
  // ① DB 음식 (긴 이름 먼저). 두 글자 이름은 낱말 그대로일 때만 ("브리즈번"의 '브리', "박미란"의 '박미' 오탐 방지)
  for (const f of [...vocab.foods].sort((a, b) => b.name_ko.length - a.name_ko.length)) {
    const k = norm(f.name_ko);
    if (k.length < 2 || DB_STOP.has(k)) continue;
    const hit = k.length >= 3 ? flat.includes(k) : tokenForms.has(k);
    if (hit && ![...out.keys()].some((o) => o.includes(k))) out.set(k, { term: f.name_ko, slug: f.slug });
  }
  // ② 사전 (공백 섞인 표기 "두바이 초콜릿"도)
  for (const [k, term] of LEX) {
    if (flat.includes(norm(k)) && ![...out.keys()].some((o) => o.includes(k))) {
      // 짧은 것이 이미 들어 있으면 긴 것으로 바꾼다 (쿠키 → 두바이쫀득쿠키)
      for (const o of [...out.keys()]) if (k.includes(o) && !out.get(o)!.slug) out.delete(o);
      out.set(k, { term, slug: null });
    }
  }
  // ③ 꼬리말 규칙
  for (const tok of tokens) {
    const w = asFood(tok);
    if (!w) continue;
    const k = norm(w);
    if ([...out.keys()].some((o) => o.includes(k))) continue;
    // 더 구체적인 이름이 이긴다 (김치 → 김치찌개). DB 음식(slug)은 지우지 않는다
    if ([...out.entries()].some(([o, v]) => k.includes(o) && v.slug)) continue;
    for (const o of [...out.keys()]) if (k.includes(o)) out.delete(o);
    out.set(k, { term: w, slug: null });
  }
  return [...out.values()].slice(0, max);
}
