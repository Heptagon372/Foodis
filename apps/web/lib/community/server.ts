// 커뮤니티 라우트 공용 (서버 전용): 저장소 고르기 · 보는 사람 확인 · 화면용 글 만들기 · 트렌드/브리핑 캐시 · 신호 기록
import "server-only";
import { getContent, hasSupabaseKeys } from "@/lib/content";
import { supabaseAdmin, supabaseForRequest } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/foodi/deps";
import { getLLM, llmReady } from "@/lib/providers";
import { makeBriefing, briefingKey, type Briefing, type HotFood } from "./briefing";
import type { CategoryKey } from "./categories";
import { previewSeed } from "./seed";
import { displayName, memoryStore, type CommunityStore } from "./store";
import { supabaseStore } from "./supabase-store";
import type { TagVocab } from "./tags";
import { computeTrends, TREND_WINDOW_MS, type Trend } from "./trends";
import type { CommentRow, CommentView, PostRow, PostView, SignalKind, TagLink } from "./types";

// ── 저장소: 키 + 0006 테이블이 있으면 Supabase, 아니면 메모리(샘플 글). 1분마다 다시 확인
let checked: { at: number; live: boolean; reason: string } | null = null;
// 미리보기 메모리는 globalThis 에 하나만: next dev 는 라우트·페이지마다 모듈을 따로 올려서, 모듈 변수면 글쓰기 라우트와 상세 화면이 서로 다른 저장소를 본다
type TrendCache = { at: number; mode: string; trends: Trend[]; hotFoods: HotFood[]; recent: PostRow[] };
type Shared = { store?: CommunityStore; photos: Map<string, { media_type: string; data: string }>; trends?: TrendCache | null };
const g = globalThis as typeof globalThis & { __foodisCommunity?: Shared };
const mem: Shared = (g.__foodisCommunity ??= { photos: new Map() });
const photos = mem.photos;

export async function communityStatus(): Promise<{ live: boolean; reason: string }> {
  if (!hasSupabaseKeys()) return { live: false, reason: "Supabase 키 없음" };
  if (checked && Date.now() - checked.at < 60_000) return checked;
  const { error } = await supabaseAdmin().from("community_posts").select("id").limit(1);
  checked = { at: Date.now(), live: !error, reason: error ? (error.code === "PGRST205" || error.code === "42P01" ? "0006_community 마이그레이션 전" : `DB 오류: ${error.message}`) : "DB 연결됨" };
  return checked;
}

export async function getStore(): Promise<CommunityStore> {
  if ((await communityStatus()).live) return supabaseStore(supabaseAdmin());
  if (!mem.store) {
    const foods = await (await getContent()).listFoods();
    const img = new Map(foods.filter((f) => f.image_url).map((f) => [f.slug, { url: f.image_url!, credit: f.image_credit }]));
    mem.store = memoryStore({
      seed: previewSeed((slug) => img.get(slug) ?? null),
      // 미리보기 사진은 서버 메모리에 두고 /api/community/photos/:id 로 보여 준다 (피드 JSON 에 base64 를 싣지 않게)
      savePhoto: (p) => {
        const id = crypto.randomUUID();
        photos.set(id, p);
        if (photos.size > 200) photos.delete(photos.keys().next().value!);
        return `/api/community/photos/${id}`;
      },
    });
  }
  return mem.store;
}

export const previewPhoto = (id: string) => photos.get(id) ?? null;

// ── 보는 사람. 운영: 로그인 사용자만 쓰기 가능 / 미리보기: 브라우저 anon id 로도 쓰기 가능(데모용)
export type Viewer = { key: string | null; userId: string | null; anonId: string | null; name: string; canWrite: boolean };

const ANON = /^[A-Za-z0-9-]{8,64}$/;

export async function getViewer(req: Request, live: boolean): Promise<Viewer> {
  const anonRaw = req.headers.get("x-foodis-anon");
  const anonId = anonRaw && ANON.test(anonRaw) ? anonRaw : null;
  let user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null = null;
  if (env.supabaseUrl && env.supabaseAnonKey) user = (await (await supabaseForRequest()).auth.getUser().catch(() => null))?.data.user ?? null;
  if (user) {
    const m = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    return { key: user.id, userId: user.id, anonId, name: displayName({ name: m.nickname ?? m.full_name ?? m.name, email: user.email }), canWrite: true };
  }
  if (!live && anonId) return { key: `anon:${anonId}`, userId: null, anonId, name: `게스트 ${anonId.slice(0, 4)}`, canWrite: true };
  return { key: null, userId: null, anonId, name: "게스트", canWrite: false };
}

// ── 음식 이름 사전 (글 → 음식 연결 · 화면 링크 이름). 5분 캐시
let vocab: { at: number; v: TagVocab; names: Map<string, string> } | null = null;
export async function tagVocab(): Promise<{ v: TagVocab; names: Map<string, string> }> {
  if (vocab && Date.now() - vocab.at < 300_000) return vocab;
  const content = await getContent();
  const [foods, countries] = await Promise.all([content.listFoods(), content.listCountries()]);
  const v: TagVocab = { foods: foods.map((f) => ({ slug: f.slug, name_ko: f.name_ko, name_en: f.name_en })), countries: countries.map((c) => ({ code: c.code, name_ko: c.name_ko })) };
  vocab = { at: Date.now(), v, names: new Map(foods.map((f) => [f.slug, f.name_ko])) };
  return vocab;
}

// ── 화면용 변환
export async function toViews(store: CommunityStore, rows: PostRow[], viewer: Viewer, reasons?: Map<string, string | null>): Promise<PostView[]> {
  const ids = rows.map((r) => r.id);
  const pollIds = rows.filter((r) => r.poll).map((r) => r.id);
  const [states, polls, { names }] = await Promise.all([store.viewerStates(ids, viewer.key), store.pollCounts(pollIds), tagVocab()]);
  return rows.map(({ author_key, food_slugs, ...r }) => ({
    ...r,
    foods: food_slugs.flatMap((slug): TagLink[] => (names.has(slug) ? [{ slug, name_ko: names.get(slug)! }] : [])),
    poll_counts: r.poll ? r.poll.options.map((_, i) => polls.get(r.id)?.[i] ?? 0) : null,
    mine: Boolean(viewer.key && author_key === viewer.key),
    viewer: states.get(r.id) ?? { liked: false, joined: false, vote: null },
    reason: reasons?.get(r.id) ?? null,
  }));
}

export const toCommentView = ({ author_key, ...c }: CommentRow, viewer: Viewer): CommentView => ({ ...c, mine: Boolean(viewer.key && author_key === viewer.key) });

// ── 신호 기록 (실패해도 본 동작은 막지 않는다)
export async function recordSignal(store: CommunityStore, viewer: Viewer, kind: SignalKind, category: CategoryKey | null, postId: string | null) {
  await store.addSignals([{ kind, category, post_id: postId?.startsWith("seed-") ? null : postId, anon_id: viewer.anonId, user_id: viewer.userId }]).catch(() => {});
  mem.trends = null;
}

// ── 트렌드 (2분 캐시) · 브리핑 (같은 트렌드 모양이면 30분 재사용)
export async function trendsOf(store: CommunityStore) {
  const hit = mem.trends;
  if (hit && hit.mode === store.mode && Date.now() - hit.at < 120_000) return hit;
  const since = new Date(Date.now() - TREND_WINDOW_MS).toISOString();
  const [signals, recent, { names }] = await Promise.all([store.recentSignals(since), store.listPosts({ categories: null, limit: 200 }), tagVocab()]);
  const fresh = recent.filter((p) => p.created_at >= since);
  const counts = new Map<string, number>();
  for (const p of fresh) for (const s of p.food_slugs) counts.set(s, (counts.get(s) ?? 0) + 1 + Math.min(p.like_count, 20) / 10);
  const hotFoods = [...counts.entries()]
    .filter(([s]) => names.has(s))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([slug, c]) => ({ slug, name_ko: names.get(slug)!, count: Math.round(c) }));
  return (mem.trends = { at: Date.now(), mode: store.mode, trends: computeTrends(signals, fresh), hotFoods, recent });
}

const briefings = new Map<string, { at: number; b: Briefing }>();

export async function briefingOf(store: CommunityStore): Promise<{ briefing: Briefing; trends: Trend[]; hotFoods: HotFood[] }> {
  const t = await trendsOf(store);
  const top = new Set(t.trends.slice(0, 3).map((x) => x.category));
  const input = { trends: t.trends, hotFoods: t.hotFoods, titles: t.recent.filter((p) => top.has(p.category)).slice(0, 8).map((p) => ({ category: p.category, title: p.title })) };
  const key = `${store.mode}:${briefingKey(input)}`;
  const hit = briefings.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return { briefing: hit.b, trends: t.trends, hotFoods: t.hotFoods };

  // 예산 초과면 템플릿 (푸디 대화와 같은 하루 예산을 쓴다)
  const repo = await getRepo();
  const spent = await repo.usageTodayUsd().catch(() => 0);
  const llm = llmReady() && spent < env.dailyBudgetUsd ? getLLM() : null;
  const { briefing, usage } = await makeBriefing(llm, input);
  if (usage) await repo.recordUsage([usage], null).catch(() => {});
  briefings.set(key, { at: Date.now(), b: briefing });
  if (briefings.size > 50) briefings.delete(briefings.keys().next().value!);
  return { briefing, trends: t.trends, hotFoods: t.hotFoods };
}
