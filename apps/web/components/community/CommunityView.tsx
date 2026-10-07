"use client";
// /community — World Table. 맨 위 '지금 뜨는 음식'(급상승 순위) → 게시판 | 푸랜드 | 모임 (카페처럼 나눔).
//  게시판: 전체 · 밥친구 · 주제 칩 + 정렬(AI 맞춤 · 최신 · 인기), 데스크톱은 피드 | 오른쪽(푸디 브리핑) 두 칸
//  푸랜드: 켜 둔 사람끼리 지도에서 서로 보고 바로 1:1 대화 (BuddyTab, docs/design/16)
//  모임: 만들고 가입해서 안에서 글을 쓰는 모임 목록 (ClubDirectory). 탭은 주소 ?tab=buddy|clubs 로 기억
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { MapProvider } from "@/lib/client/map-provider";
import { bump, fetchBriefing, fetchFeed, useTopInterests, type BriefingPage } from "@/lib/client/community";
import { CATEGORY, CATEGORIES, isCategory, type CategoryKey, type FeedFilter } from "@/lib/community/categories";
import { SORT_LABEL, SORTS, type PostView, type Sort } from "@/lib/community/types";
import { PreviewBanner } from "../bits";
import { Icon } from "../icons";
import { TopBar } from "../TopBar";
import { btn, chip, Eyebrow, SegTabs } from "../ui";
import { TrendingFoodsLive } from "../trending/TrendingFoods";
import { Briefing } from "./Briefing";
import { BuddyTab } from "./buddy/BuddyTab";
import { ClubDirectory } from "./ClubDirectory";
import { LoginPrompt } from "./parts";
import { PostCard } from "./PostCard";
import { ScrollRow } from "../ScrollRow";

type Tab = "board" | "buddy" | "clubs";
const TABS: Tab[] = ["board", "buddy", "clubs"];
const TAB_LABEL: Record<Tab, string> = { board: "게시판", buddy: "푸랜드", clubs: "모임" };
const parseTab = (v: string | null): Tab => (v === "clubs" || v === "buddy" ? v : "board");

const parseFilter = (v: string | null): FeedFilter => (v === "all" || isCategory(v) ? (v as FeedFilter) : "all");

export function CommunityView({ mapProvider, mapKey }: { mapProvider: MapProvider; mapKey: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => parseTab(params.get("tab")));
  const [filter, setFilter] = useState<FeedFilter>(() => parseFilter(params.get("c")));
  const [sort, setSort] = useState<Sort>("foryou");
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [mode, setMode] = useState<"live" | "preview" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefingPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const top = useTopInterests(3);

  useEffect(() => {
    if (tab !== "board") return;
    let alive = true;
    setPosts(null);
    setError(null);
    fetchFeed(filter, sort)
      .then((r) => {
        if (!alive) return;
        setPosts(r.posts);
        setNext(r.next);
        setMode(r.mode);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [tab, filter, sort, retry]);

  useEffect(() => {
    fetchBriefing().then(setBrief, () => {});
  }, []);

  const pick = useCallback(
    (f: FeedFilter) => {
      setFilter(f);
      // 주소에도 남겨 뒤로 가기·공유가 같은 화면으로
      router.replace(f === "all" ? "/community" : `/community?c=${f}`, { scroll: false });
      if (isCategory(f)) bump(f, "tap");
    },
    [router],
  );

  const more = async () => {
    if (next == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetchFeed(filter, sort, next);
      setPosts((p) => [...(p ?? []), ...r.posts.filter((x) => !p?.some((y) => y.id === x.id))]);
      setNext(r.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    router.replace(t !== "board" ? `/community?tab=${t}` : filter === "all" ? "/community" : `/community?c=${filter}`, { scroll: false });
  };
  const writeHref = tab === "clubs" ? "/community/clubs/new" : tab === "buddy" ? "/community/write?category=buddy" : `/community/write${isCategory(filter) ? `?category=${filter}` : ""}`;
  const writeLabel = tab === "clubs" ? "모임 만들기" : tab === "buddy" ? "밥친구 글쓰기" : "글쓰기";

  return (
    <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar>
        <div className="lg:hidden">
          <Link href={writeHref} className={btn("lime", "sm")}>
            <Icon name={tab === "clubs" ? "plus" : "edit"} className="size-4" />
            {writeLabel}
          </Link>
        </div>
      </TopBar>

      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <Eyebrow>World Table</Eyebrow>
          <h1 className="text-h1 font-bold text-ink">커뮤니티</h1>
          <p className="text-sm text-ink-soft">같이 먹을 친구를 찾고, 취향이 맞는 모임에서 이야기해요.</p>
        </div>
        {/* btn() 에 inline-flex 가 들어 있어 hidden 과 섞지 않고 바깥에서 숨긴다 */}
        <div className="hidden shrink-0 lg:block">
          <Link href={writeHref} className={btn("lime")}>
            <Icon name={tab === "clubs" ? "plus" : "edit"} className="size-5" />
            {writeLabel}
          </Link>
        </div>
      </div>

      {mode === "preview" && <PreviewBanner />}

      {/* 급상승: 어느 탭에서든 맨 위에 크게 */}
      <TrendingFoodsLive />
      {/* 모바일엔 상단 메뉴가 없어 음식 뉴스로 가는 길을 여기 둔다 */}
      <Link href="/news" className="card flex items-center gap-3 rounded-2xl px-4 py-3 transition hover:border-leaf/40 lg:hidden">
        <Icon name="newspaper" className="size-5 text-leaf" />
        <span className="flex-1 text-sm font-semibold text-ink">음식 뉴스 · 문화 뉴스</span>
        <span className="text-caption text-muted">30분마다 업데이트</span>
        <Icon name="next" className="size-4 text-muted" />
      </Link>

      <SegTabs tabs={TABS} value={tab} onChange={switchTab} label="게시판 · 푸랜드 · 모임" labels={TAB_LABEL} />

      {tab === "clubs" ? (
        <ClubDirectory />
      ) : tab === "buddy" ? (
        <BuddyTab provider={mapProvider} mapKey={mapKey} />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
          <div className="space-y-4">
            <ScrollRow label="게시판" className="snap-row -mx-5 flex gap-2 px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="게시판 고르기">
              <button type="button" className={chip(filter === "all")} onClick={() => pick("all")} aria-pressed={filter === "all"}>
                전체
              </button>
              {CATEGORIES.map((c) => {
                const hot = brief?.trends.find((t) => t.category === c.key)?.rising;
                return (
                  <button key={c.key} type="button" className={chip(filter === c.key)} onClick={() => pick(c.key)} aria-pressed={filter === c.key}>
                    <Icon name={c.icon} className="size-4" />
                    {c.label}
                    {hot && (
                      <span className="inline-flex items-center text-diet-no" aria-label="급상승">
                        <Icon name="flame" className="size-3.5" strokeWidth={2.2} />
                      </span>
                    )}
                  </button>
                );
              })}
            </ScrollRow>

            {isCategory(filter) && (
              <p className="flex items-center gap-2 text-caption text-muted">
                <Icon name={CATEGORY[filter].icon} className="size-4 text-leaf" />
                {CATEGORY[filter].blurb}
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1" role="tablist" aria-label="정렬">
                {SORTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={sort === s}
                    onClick={() => setSort(s)}
                    className={`inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition ${sort === s ? "bg-ink text-canvas" : "text-ink-soft hover:bg-ink/5"}`}
                  >
                    {s === "foryou" && <Icon name="sparkle" className="size-3.5" />}
                    {SORT_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            {sort === "foryou" && (
              <p className="-mt-2 text-caption text-muted">{top.length ? `자주 보는 ${top.map(([k]) => CATEGORY[k].label).join("·")} 글과 요즘 뜨는 모임을 먼저 보여 줘요.` : "모임을 둘러볼수록 내 취향에 맞춰 순서가 바뀌어요."}</p>
            )}

            {login && <LoginPrompt message={login} onClose={() => setLogin(null)} />}

            {error ? (
              <div className="card space-y-3 rounded-3xl p-5 text-center">
                <p className="text-sm text-ink-soft">{error}</p>
                <button type="button" className={btn("outline", "sm")} onClick={() => setRetry((n) => n + 1)}>
                  다시 시도
                </button>
              </div>
            ) : !posts ? (
              <div className="space-y-3" aria-busy>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-40 animate-pulse rounded-3xl bg-sunken/70" />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="card space-y-3 rounded-3xl p-6 text-center">
                <Icon name="utensils" className="mx-auto size-8 text-leaf" />
                <p className="text-sm text-ink-soft">{isCategory(filter) ? `${CATEGORY[filter].label} 첫 글을 남겨 보세요.` : "아직 글이 없어요. 첫 이야기를 시작해 보세요."}</p>
                <Link href={writeHref} className={btn("primary", "sm")}>
                  글쓰기
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {posts.map((p) => (
                  <li key={p.id}>
                    <PostCard post={p} onLoginNeeded={setLogin} />
                  </li>
                ))}
              </ul>
            )}
            {next != null && posts && (
              <button type="button" onClick={more} disabled={loadingMore} className={`${btn("outline", "sm")} w-full`}>
                {loadingMore ? "불러오는 중…" : "더 보기"}
              </button>
            )}
          </div>

          <aside className="mt-6 space-y-4 lg:sticky lg:top-(--desk-sticky) lg:mt-0">
            <Briefing data={brief} onPick={(k: CategoryKey) => pick(k)} />
            {top.length > 0 && (
              // 모바일은 정렬 안내 문장이 같은 정보를 보여 줘서 숨긴다 (피드가 너무 밀리지 않게)
              <div className="card hidden space-y-2.5 rounded-3xl p-4 lg:block">
                <p className="text-sm font-semibold text-ink">내가 자주 보는 주제</p>
                <div className="flex flex-wrap gap-1.5">
                  {top.map(([k]) => (
                    <button key={k} type="button" className={chip(filter === k)} onClick={() => pick(k)}>
                      <Icon name={CATEGORY[k].icon} className="size-4" />
                      {CATEGORY[k].label}
                    </button>
                  ))}
                </div>
                <p className="text-caption text-muted">이 기록은 이 기기에만 저장돼요.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
