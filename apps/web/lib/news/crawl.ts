// 뉴스 수집 1회: 카테고리별 검색어 → 수집원 호출(동시 3개) → 제목 중복 제거 → 음식 키워드 추출 → 저장.
// 수집원 하나가 실패해도 나머지는 계속 (실패 수만 돌려준다). 순수 의존성 주입 → 테스트에서 가짜 fetch 로 돈다
import { extractFoodTerms, type FoodVocab } from "@/lib/trends/keywords";
import { NEWS_QUERIES, titleKey, type NewsCategory, type RawArticle } from "./sources";
import type { NewArticle, NewsStore } from "./store";

export type Fetcher = (query: string) => Promise<RawArticle[]>;
export type CrawlResult = { fetched: number; inserted: number; failed: number; queries: number };

const MAX_AGE_MS = 14 * 86_400_000;

export async function crawlNews(store: NewsStore, fetcher: Fetcher, vocab: FoodVocab, now = Date.now()): Promise<CrawlResult> {
  const jobs = (Object.entries(NEWS_QUERIES) as [NewsCategory, string[]][]).flatMap(([category, qs]) => qs.map((query) => ({ category, query })));
  const results: { category: NewsCategory; query: string; items: RawArticle[] | null }[] = [];
  for (let i = 0; i < jobs.length; i += 3) {
    const batch = await Promise.all(jobs.slice(i, i + 3).map(async (j) => ({ ...j, items: await fetcher(j.query).catch(() => null) })));
    results.push(...batch);
  }
  // 이미 있는 최근 기사 제목과도 겹치지 않게 (같은 보도자료를 여러 언론사가 받아쓴 경우)
  const seen = new Set((await store.list({ category: null, limit: 1000 })).map((a) => titleKey(a.title)));
  const rows: NewArticle[] = [];
  let fetched = 0;
  for (const r of results) {
    for (const a of r.items ?? []) {
      fetched++;
      const k = titleKey(a.title);
      if (seen.has(k) || now - Date.parse(a.published_at) > MAX_AGE_MS) continue;
      seen.add(k);
      const terms = extractFoodTerms(a.title, vocab, 4);
      rows.push({ ...a, category: r.category, query: r.query, terms: terms.map((t) => t.term), food_slugs: terms.flatMap((t) => (t.slug ? [t.slug] : [])) });
    }
  }
  const inserted = rows.length ? await store.insert(rows) : 0;
  return { fetched, inserted, failed: results.filter((r) => !r.items).length, queries: jobs.length };
}
