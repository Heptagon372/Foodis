// 뉴스 저장소: 메모리(미리보기·테스트) / Supabase(news_articles, 0007). 수집(crawl.ts)과 화면(API)이 같은 인터페이스를 쓴다
import type { NewsCategory, RawArticle } from "./sources";

export type NewsArticle = RawArticle & { id: string; category: NewsCategory; query: string | null; terms: string[]; food_slugs: string[]; fetched_at: string };
export type NewArticle = Omit<NewsArticle, "id" | "fetched_at">;

export interface NewsStore {
  readonly mode: "live" | "preview";
  /** url 이 같으면 건너뛴다. 새로 들어간 개수 */
  insert(rows: NewArticle[]): Promise<number>;
  /** 최신 순 */
  list(q: { category: NewsCategory | null; limit: number; sinceIso?: string }): Promise<NewsArticle[]>;
  /** 마지막으로 새 기사를 넣은 시각 */
  lastFetchedAt(): Promise<string | null>;
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export function memoryNewsStore(max = 2000): NewsStore {
  const rows = new Map<string, NewsArticle>();
  let last: string | null = null;
  return {
    mode: "preview",
    async insert(list) {
      let n = 0;
      const now = new Date().toISOString();
      for (const r of list) {
        if (rows.has(r.url)) continue;
        rows.set(r.url, { ...r, id: uid(), fetched_at: now });
        n++;
      }
      if (n) last = now;
      // 오래된 것부터 지워 상한 유지
      if (rows.size > max) for (const a of [...rows.values()].sort((a, b) => a.published_at.localeCompare(b.published_at)).slice(0, rows.size - max)) rows.delete(a.url);
      return n;
    },
    async list({ category, limit, sinceIso }) {
      return [...rows.values()]
        .filter((a) => (!category || a.category === category) && (!sinceIso || a.published_at >= sinceIso))
        .sort((a, b) => b.published_at.localeCompare(a.published_at))
        .slice(0, limit);
    },
    async lastFetchedAt() {
      return last;
    },
  };
}
