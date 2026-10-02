// 뉴스 수집원 (순수 파싱 + fetch 어댑터). 서버·테스트 공용 — server-only 아님.
// ⚠️ 약관 (확인일 2026-10-02):
//  · 네이버 검색 API(뉴스): 공식 오픈 API. 하루 25,000회. 결과(제목·링크·요약·날짜)를 서비스 화면에 보여 주는 용도로 허용 → 운영 기본 수집원.
//  · Google 뉴스 RSS: 피드에 "personal, non-commercial use" 로만 허용한다고 적혀 있다 → 개발 미리보기에서만 쓴다 (운영 빌드에서는 끈다).
// 어느 쪽이든 기사 본문은 가져오지 않는다. 제목·언론사·날짜(+네이버 요약)만 보여 주고 원문 링크로 보낸다.

export type NewsCategory = "food" | "culture";
export const NEWS_CATEGORIES: { key: NewsCategory; label: string; blurb: string }[] = [
  { key: "food", label: "음식 뉴스", blurb: "신메뉴 · 외식 · 식품 트렌드" },
  { key: "culture", label: "문화 뉴스", blurb: "식문화 · 축제 · 세계 음식 이야기" },
];

/** 카테고리별 검색어 — 수집 1회 = 검색어 수만큼 호출 */
export const NEWS_QUERIES: Record<NewsCategory, string[]> = {
  food: ["음식 트렌드", "외식 트렌드", "신메뉴 출시", "디저트 유행", "푸드 트렌드", "식품업계 인기", "편의점 신상 먹거리", "오픈런 맛집", "SNS 화제 음식"],
  culture: ["음식 문화", "식문화", "음식 축제", "한식 세계화", "할랄 음식", "비건 식당"],
};

export type RawArticle = { url: string; title: string; source: string | null; snippet: string | null; published_at: string; provider: "naver" | "google_rss" };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };
export const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
const clean = (s: string) => stripTags(decodeEntities(s)).replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] ?? null;

/** Google 뉴스 RSS → 기사. 제목 끝의 " - 언론사" 는 떼서 source 로 */
export function parseGoogleRss(xml: string): RawArticle[] {
  const out: RawArticle[] = [];
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const rawTitle = clean(tag(item, "title") ?? "");
    const url = clean(tag(item, "link") ?? "");
    const date = Date.parse(clean(tag(item, "pubDate") ?? ""));
    if (!rawTitle || !/^https?:\/\//.test(url) || !Number.isFinite(date)) continue;
    const source = clean(tag(item, "source") ?? "") || null;
    const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    out.push({ url, title: title.slice(0, 300), source, snippet: null, published_at: new Date(date).toISOString(), provider: "google_rss" });
  }
  return out;
}

type NaverItem = { title: string; originallink?: string; link: string; description?: string; pubDate: string };

/** 네이버 검색 API 뉴스 응답 → 기사. 언론사 이름은 주지 않아 원문 주소의 도메인으로 */
export function parseNaver(json: { items?: NaverItem[] }): RawArticle[] {
  const out: RawArticle[] = [];
  for (const it of json.items ?? []) {
    const url = it.originallink || it.link;
    const date = Date.parse(it.pubDate);
    const title = clean(it.title ?? "");
    if (!title || !/^https?:\/\//.test(url ?? "") || !Number.isFinite(date)) continue;
    let source: string | null = null;
    try {
      source = new URL(url).hostname.replace(/^(www|m|news)\./, "");
    } catch {
      /* 그대로 null */
    }
    out.push({ url, title: title.slice(0, 300), source, snippet: it.description ? clean(it.description).slice(0, 200) : null, published_at: new Date(date).toISOString(), provider: "naver" });
  }
  return out;
}

const TIMEOUT_MS = 8000;

export async function fetchGoogleRss(query: string, f: typeof fetch = fetch): Promise<RawArticle[]> {
  const u = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:7d`)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await f(u, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "FOODIS-news/1.0 (dev preview)" } });
  if (!res.ok) throw new Error(`google_rss ${res.status}`);
  return parseGoogleRss(await res.text()).slice(0, 30);
}

export async function fetchNaver(query: string, keys: { id: string; secret: string }, f: typeof fetch = fetch): Promise<RawArticle[]> {
  const u = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=30&sort=date`;
  const res = await f(u, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "X-Naver-Client-Id": keys.id, "X-Naver-Client-Secret": keys.secret } });
  if (!res.ok) throw new Error(`naver ${res.status}`);
  return parseNaver(await res.json());
}

/** 같은 기사가 여러 언론사·검색어로 들어오면 제목으로 한 번 더 거른다 */
export const titleKey = (t: string) => t.replace(/[^가-힣A-Za-z0-9]/g, "").toLowerCase().slice(0, 40);
