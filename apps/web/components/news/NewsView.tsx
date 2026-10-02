"use client";
// /news — 음식 뉴스 · 문화 뉴스. 30분마다 자동 수집(서버), 맨 위에 '뉴스에서 뜨는 음식' 급상승 순위, 키워드로 걸러 보기.
// 기사 본문은 가져오지 않는다 — 제목·언론사·날짜(+요약)만 보여 주고 원문으로 보낸다
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchNews, type NewsPage } from "@/lib/client/community";
import type { NewsCategory } from "@/lib/news/sources";
import { norm } from "@/lib/trends/keywords";
import { timeAgo } from "../community/parts";
import { Icon } from "../icons";
import { TopBar } from "../TopBar";
import { TrendingFoods } from "../trending/TrendingFoods";
import { btn, Eyebrow, SegTabs } from "../ui";

type Tab = "all" | NewsCategory;
const TABS: Tab[] = ["all", "food", "culture"];
const CAT_LABEL: Record<NewsCategory, string> = { food: "음식", culture: "문화" };
const PROVIDER_LABEL = { naver: "네이버 뉴스 검색 API", google_rss: "Google 뉴스 RSS (개발 미리보기 전용)", none: "" } as const;

export function NewsView() {
  const router = useRouter();
  const params = useSearchParams();
  const c = params.get("category");
  const [tab, setTab] = useState<Tab>(c === "food" || c === "culture" ? c : "all");
  const [term, setTerm] = useState<string | null>(params.get("term"));
  const [data, setData] = useState<NewsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // 같은 화면에서 순위 링크(/news?term=…)를 누르면 주소만 바뀐다 → 주소를 따라간다
  const qTerm = params.get("term");
  useEffect(() => setTerm(qTerm), [qTerm]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetchNews(tab === "all" ? null : tab, term).then(
      (r) => alive && setData(r),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [tab, term, retry]);

  const go = (t: Tab, k: string | null) => {
    setTab(t);
    setTerm(k);
    const q = new URLSearchParams();
    if (t !== "all") q.set("category", t);
    if (k) q.set("term", k);
    router.replace(q.size ? `/news?${q}` : "/news", { scroll: false });
  };

  const labels: Record<Tab, string> = {
    all: "전체",
    food: `음식 뉴스${data ? ` ${data.counts.food}` : ""}`,
    culture: `문화 뉴스${data ? ` ${data.counts.culture}` : ""}`,
  };
  const hotTerms = data?.rising.slice(0, 8) ?? [];

  return (
    <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar />
      <div className="space-y-1">
        <Eyebrow>World Table · 함께</Eyebrow>
        <h1 className="text-h1 font-bold text-ink">음식 뉴스</h1>
        <p className="text-sm text-ink-soft">음식·식문화 소식을 30분마다 자동으로 모아요. 어떤 음식이 뜨는지 한눈에.</p>
      </div>

      <SegTabs tabs={TABS} value={tab} onChange={(t) => go(t, null)} label="뉴스 카테고리" labels={labels} />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <aside className="mb-5 space-y-3 lg:sticky lg:top-8 lg:order-last lg:mb-0">
          <TrendingFoods
            items={data ? data.rising : null}
            title={tab === "culture" ? "문화 뉴스에서 뜨는 음식" : tab === "food" ? "음식 뉴스에서 뜨는 음식" : "뉴스에서 뜨는 음식"}
            caption="최근 48시간 기사 vs 이전 7일"
          />
          {data && data.provider !== "none" && (
            <p className="flex items-start gap-1.5 px-1 text-caption text-muted">
              <Icon name="replay" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {data.updated_at ? `${timeAgo(data.updated_at)} 업데이트` : "첫 수집 중"} · 30분마다 자동 수집
                <br />
                출처: {PROVIDER_LABEL[data.provider]} · 제목과 링크만 보여 주고 기사는 원문에서 읽어요
              </span>
            </p>
          )}
        </aside>

        <section className="space-y-3" aria-label="기사 목록">
          {hotTerms.length > 0 && (
            <div className="snap-row -mx-5 flex gap-2 px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="급상승 키워드로 보기">
              {hotTerms.map((r) => {
                const on = term != null && norm(term) === norm(r.term);
                return (
                  <button key={r.term} type="button" onClick={() => go(tab, on ? null : r.term)} aria-pressed={on} className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition ${on ? "border-diet-no bg-diet-no text-white" : "border-line bg-surface text-ink hover:border-diet-no/40"}`}>
                    <span className={on ? "text-white" : "text-diet-no"}>{r.rank}</span>
                    {r.term}
                    {r.badge === "new" && <span className={`text-[10px] font-black ${on ? "text-white" : "text-diet-no"}`}>N</span>}
                  </button>
                );
              })}
            </div>
          )}
          {term && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <Icon name="search" className="size-4 text-leaf" />‘{term}’ 들어간 기사만 보는 중
              <button type="button" onClick={() => go(tab, null)} className="font-semibold text-leaf">
                전체 보기
              </button>
            </p>
          )}

          {error ? (
            <div className="card space-y-3 rounded-3xl p-5 text-center">
              <p className="text-sm text-ink-soft">{error}</p>
              <button type="button" className={btn("outline", "sm")} onClick={() => setRetry((n) => n + 1)}>
                다시 시도
              </button>
            </div>
          ) : !data ? (
            <div className="space-y-2" aria-busy>
              <p className="text-caption text-muted">뉴스를 모으는 중… (처음엔 10초쯤 걸려요)</p>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-3xl bg-sunken/70" />
              ))}
            </div>
          ) : data.provider === "none" ? (
            <div className="card space-y-2 rounded-3xl p-5 text-sm text-ink-soft">
              <p className="font-semibold text-ink">뉴스 수집 키가 아직 없어요</p>
              <p>네이버 개발자센터에서 &lsquo;검색&rsquo; API 애플리케이션을 만들고 NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 을 서버 환경변수에 넣으면 30분마다 자동으로 모여요.</p>
            </div>
          ) : data.articles.length === 0 ? (
            <div className="card rounded-3xl p-6 text-center text-sm text-ink-soft">{term ? `‘${term}’ 기사가 아직 없어요.` : "아직 모인 기사가 없어요. 잠시 뒤 다시 열어 주세요."}</div>
          ) : (
            <ul className="space-y-2.5">
              {data.articles.map((a) => (
                <li key={a.id}>
                  <article className={`card rounded-3xl p-4 ${a.hot ? "border-diet-no/30" : ""}`}>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${a.category === "food" ? "bg-lime-soft text-leaf" : "bg-sunken text-ink-soft"}`}>{CAT_LABEL[a.category]}</span>
                      {a.hot && (
                        <span className="inline-flex items-center gap-0.5 font-bold text-diet-no">
                          <Icon name="flame" className="size-3.5" strokeWidth={2.2} />
                          급상승
                        </span>
                      )}
                      {a.source && <span className="font-medium text-ink-soft">{a.source}</span>}
                      <span>{timeAgo(a.published_at)}</span>
                    </p>
                    <a href={a.url} target="_blank" rel="noreferrer noopener" className="mt-1.5 block text-[15px] font-semibold leading-snug text-ink hover:underline">
                      {a.title}
                      <Icon name="external" className="ml-1 inline size-3.5 align-[-2px] text-muted" />
                    </a>
                    {a.snippet && <p className="mt-1 line-clamp-2 text-caption text-ink-soft">{a.snippet}</p>}
                    {a.terms.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.terms.map((t) => (
                          <button key={t} type="button" onClick={() => go(tab, t)} className="inline-flex h-7 items-center rounded-full bg-sunken px-2.5 text-[12px] font-medium text-ink-soft hover:text-ink">
                            #{t}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
