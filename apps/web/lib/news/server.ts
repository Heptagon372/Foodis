// 뉴스 서버 공용: 저장소·수집원 고르기 · "30분 지나면 자동 수집" · 동시 수집 막기
import "server-only";
import { hasSupabaseKeys } from "@/lib/content";
import { supabaseAdmin } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { tagVocab } from "@/lib/community/server";
import { crawlNews, type CrawlResult, type Fetcher } from "./crawl";
import { fetchGoogleRss, fetchNaver } from "./sources";
import { memoryNewsStore, type NewArticle, type NewsArticle, type NewsStore } from "./store";

/** 자동 수집 간격 */
export const NEWS_STALE_MS = 30 * 60_000;

export type NewsProvider = "naver" | "google_rss" | "none";

/** 운영: 네이버 키가 있을 때만 수집. 개발 서버: 키가 없으면 Google 뉴스 RSS 로 미리보기 (RSS 약관 — sources.ts 주석) */
export function newsProvider(): NewsProvider {
  if (env.naverClientId && env.naverClientSecret) return "naver";
  return process.env.NODE_ENV !== "production" ? "google_rss" : "none";
}

function fetcher(): Fetcher | null {
  const p = newsProvider();
  if (p === "naver") return (q) => fetchNaver(q, { id: env.naverClientId!, secret: env.naverClientSecret! });
  if (p === "google_rss") return (q) => fetchGoogleRss(q);
  return null;
}

// next dev 는 라우트마다 모듈을 따로 올린다 → 메모리 상태는 globalThis 하나에 (lib/community/server.ts 와 같은 이유)
type Shared = { store?: NewsStore; crawling?: Promise<CrawlResult> | null; attemptAt?: number; checked?: { at: number; live: boolean } };
const g = globalThis as typeof globalThis & { __foodisNews?: Shared };
const mem: Shared = (g.__foodisNews ??= {});

const COLS = "id, url, title, source, snippet, category, provider, query, terms, food_slugs, published_at, fetched_at";

function supabaseNewsStore(): NewsStore {
  const db = supabaseAdmin();
  return {
    mode: "live",
    async insert(rows: NewArticle[]) {
      const { data, error } = await db.from("news_articles").upsert(rows, { onConflict: "url", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      return data?.length ?? 0;
    },
    async list({ category, limit, sinceIso }) {
      let q = db.from("news_articles").select(COLS).order("published_at", { ascending: false }).limit(limit);
      if (category) q = q.eq("category", category);
      if (sinceIso) q = q.gte("published_at", sinceIso);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as NewsArticle[];
    },
    async lastFetchedAt() {
      const { data } = await db.from("news_articles").select("fetched_at").order("fetched_at", { ascending: false }).limit(1);
      return (data?.[0] as { fetched_at: string } | undefined)?.fetched_at ?? null;
    },
  };
}

export async function getNewsStore(): Promise<NewsStore> {
  if (hasSupabaseKeys()) {
    if (!mem.checked || Date.now() - mem.checked.at > 60_000) {
      const { error } = await supabaseAdmin().from("news_articles").select("id").limit(1);
      mem.checked = { at: Date.now(), live: !error };
    }
    if (mem.checked.live) return supabaseNewsStore();
  }
  return (mem.store ??= memoryNewsStore());
}

/** 지금 수집 (같은 인스턴스에서 겹치면 진행 중인 것을 기다린다) */
export async function crawlNow(): Promise<CrawlResult | null> {
  const f = fetcher();
  if (!f) return null;
  if (mem.crawling) return mem.crawling;
  mem.attemptAt = Date.now();
  mem.crawling = (async () => {
    const store = await getNewsStore();
    const { v } = await tagVocab();
    return crawlNews(store, f, { foods: v.foods });
  })().finally(() => {
    mem.crawling = null;
  });
  return mem.crawling;
}

/** 마지막 수집이 30분보다 오래됐나 (실패한 시도도 30분은 쉰다 — 수집원이 막혔을 때 매 요청마다 두드리지 않게) */
export async function isStale(store: NewsStore): Promise<boolean> {
  if (!fetcher()) return false;
  if (mem.attemptAt && Date.now() - mem.attemptAt < NEWS_STALE_MS) return false;
  const last = await store.lastFetchedAt().catch(() => null);
  return !last || Date.now() - Date.parse(last) > NEWS_STALE_MS;
}
