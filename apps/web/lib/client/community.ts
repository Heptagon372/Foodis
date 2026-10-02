"use client";
// 커뮤니티 클라이언트: API 호출 + 내 관심 가중치(브라우저 저장).
// 관심은 이 기기에만 쌓이고, 피드를 받을 때 0~1 숫자로만 서버에 보낸다 (어떤 모임을 자주 보는지 = 식이·종교를 짐작할 수 있는 정보라 서버에 개인별로 남기지 않음).
// 모두의 트렌드용 신호(탭·열람·공유)는 익명 id 로 서버에 모은다 — 추적 거부(DNT·GPC)·데모 모드면 보내지 않는다.
import { useSyncExternalStore } from "react";
import type { Briefing, HotFood } from "@/lib/community/briefing";
import type { CategoryKey, FeedFilter } from "@/lib/community/categories";
import { bumpInterest, encodeInterest, normalizeInterest, type InterestMap, type Trend } from "@/lib/community/trends";
import type { ClubView, CommentView, PostView, SignalKind, Sort } from "@/lib/community/types";
import type { NewsArticle } from "@/lib/news/store";
import type { NewsCategory } from "@/lib/news/sources";
import type { RisingItem } from "@/lib/trends/rising";
import { anonId, trackingAllowed } from "./track";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-foodis-anon", anonId());
  if (init.body) headers.set("content-type", "application/json");
  const res = await fetch(path, { ...init, headers }).catch(() => null);
  if (!res) throw new ApiError(0, "offline", "인터넷 연결을 확인해 주세요.");
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "잠시 후 다시 시도해 주세요.");
  return data as T;
}

export type FeedPage = { posts: PostView[]; next: number | null; mode: "live" | "preview"; can_write: boolean };
export type PostPage = { post: PostView; comments: CommentView[]; mode: "live" | "preview"; can_write: boolean };
export type BriefingPage = { briefing: Briefing; trends: Trend[]; hot_foods: HotFood[]; mode: "live" | "preview" };

export const fetchFeed = (filter: FeedFilter, sort: Sort, offset = 0, club?: string) => {
  const q = new URLSearchParams({ filter, sort, offset: String(offset) });
  if (club) q.set("club", club);
  if (sort === "foryou") {
    const i = encodeInterest(normalizeInterest(getInterest()));
    if (i) q.set("i", i);
  }
  return api<FeedPage>(`/api/community/posts?${q}`);
};
export const fetchPost = (id: string) => api<PostPage>(`/api/community/posts/${encodeURIComponent(id)}`);
export const fetchBriefing = () => api<BriefingPage>("/api/community/briefing");

export type PhotoUpload = { media_type: "image/jpeg"; data: string };
export type Draft = {
  category: CategoryKey;
  club_id?: string;
  title: string;
  body: string;
  place?: string;
  meet_at?: string;
  capacity?: number;
  photos: PhotoUpload[];
  poll?: { question?: string; options: string[] };
};
export async function createPost(d: Draft) {
  const r = await api<{ post: PostView }>("/api/community/posts", { method: "POST", body: JSON.stringify(d) });
  bump(d.category, "post", null, false); // 서버가 'post' 신호를 이미 남겼다
  return r.post;
}
export const deletePost = (id: string) => api<{ ok: true }>(`/api/community/posts/${encodeURIComponent(id)}`, { method: "DELETE" });

type ActionResult = { liked?: boolean; like_count?: number; joined?: boolean; join_count?: number; vote?: number; poll_counts?: number[]; reported?: boolean; hidden?: boolean };
export async function act(post: Pick<PostView, "id" | "category">, a: { action: "like" } | { action: "join" } | { action: "vote"; option: number } | { action: "report"; reason?: string }) {
  const r = await api<ActionResult>(`/api/community/posts/${encodeURIComponent(post.id)}`, { method: "POST", body: JSON.stringify(a) });
  if ((a.action === "like" && r.liked) || (a.action === "join" && r.joined) || a.action === "vote") bump(post.category, a.action, null, false);
  return r;
}

export async function addComment(post: Pick<PostView, "id" | "category">, body: string) {
  const r = await api<{ comment: CommentView }>(`/api/community/posts/${encodeURIComponent(post.id)}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  bump(post.category, "comment", null, false);
  return r.comment;
}
export const deleteComment = (postId: string, commentId: string) =>
  api<{ ok: true }>(`/api/community/posts/${encodeURIComponent(postId)}/comments?comment=${encodeURIComponent(commentId)}`, { method: "DELETE" });

// ── 모임
export type ClubsPage = { clubs: ClubView[]; mine: ClubView[]; mode: "live" | "preview"; can_write: boolean };
export const fetchClubs = (topic: CategoryKey | null) => api<ClubsPage>(`/api/community/clubs${topic ? `?topic=${topic}` : ""}`);
export const fetchClub = (id: string) => api<{ club: ClubView; mode: "live" | "preview"; can_write: boolean }>(`/api/community/clubs/${encodeURIComponent(id)}`);
export async function createClub(d: { name: string; topic: CategoryKey; description: string; cover?: PhotoUpload }) {
  return (await api<{ club: ClubView }>("/api/community/clubs", { method: "POST", body: JSON.stringify(d) })).club;
}
export async function toggleClub(club: Pick<ClubView, "id" | "topic">) {
  const r = await api<{ joined: boolean; member_count: number }>(`/api/community/clubs/${encodeURIComponent(club.id)}`, { method: "POST" });
  if (r.joined) bump(club.topic, "join", null, false);
  return r;
}
export const deleteClub = (id: string) => api<{ ok: true }>(`/api/community/clubs/${encodeURIComponent(id)}`, { method: "DELETE" });

// ── 지금 뜨는 음식 · 뉴스
export type TrendingPage = { items: RisingItem[]; counts: { news: number; community: number }; updated_at: string };
export const fetchTrending = () => api<TrendingPage>("/api/trending");
export type NewsItem = NewsArticle & { hot: boolean };
export type NewsPage = {
  articles: NewsItem[];
  rising: RisingItem[];
  counts: Record<NewsCategory, number>;
  provider: "naver" | "google_rss" | "none";
  mode: "live" | "preview";
  updated_at: string | null;
  next_update_at: string | null;
};
export const fetchNews = (category: NewsCategory | null, term: string | null) => {
  const q = new URLSearchParams();
  if (category) q.set("category", category);
  if (term) q.set("term", term);
  return api<NewsPage>(`/api/news${q.size ? `?${q}` : ""}`);
};

// ── 내 관심 (localStorage)
const KEY = "foodis:community";
let interest: InterestMap = {};
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    interest = (JSON.parse(localStorage.getItem(KEY) ?? "{}") as { interest?: InterestMap }).interest ?? {};
  } catch {
    interest = {};
  }
}
export function getInterest(): InterestMap {
  load();
  return interest;
}

/**
 * 행동 1건: 내 관심을 올리고, (send 면) 모두의 트렌드 신호로도 보낸다.
 * 따봉·댓글·투표·참여·글쓰기는 서버 라우트가 신호를 남기므로 send=false 로 관심만 올린다.
 */
export function bump(category: CategoryKey, kind: SignalKind, postId: string | null = null, send = true) {
  load();
  interest = bumpInterest(interest, category, kind);
  try {
    localStorage.setItem(KEY, JSON.stringify({ interest }));
  } catch {
    /* 저장 불가 → 이번 탭 동안만 */
  }
  listeners.forEach((l) => l());
  if (send && (kind === "tap" || kind === "view" || kind === "share") && trackingAllowed()) {
    void api("/api/community/signals", { method: "POST", body: JSON.stringify({ kind, category, ...(postId && !postId.startsWith("seed-") ? { post_id: postId } : {}) }) }).catch(() => {});
  }
}

/** 관심 상위 카테고리 (0~1) — 피드 머리의 "자주 보는 모임" 칩 */
export function useTopInterests(n = 3): [CategoryKey, number][] {
  const snap = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => getInterest(),
    () => EMPTY,
  );
  return Object.entries(normalizeInterest(snap))
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, n) as [CategoryKey, number][];
}
const EMPTY: InterestMap = {};

/** 관심 기록 지우기 (설정 · 개인정보) */
export function clearInterest() {
  interest = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
  listeners.forEach((l) => l());
}

// ── 사진: 긴 변 1280px JPEG 로 줄여 base64 (PhotoAsk 와 같은 방식, 조금 더 크게)
const MAX_EDGE = 1280;
const MAX_BYTES = 1.4 * 1024 * 1024;

export async function shrinkPhoto(file: File): Promise<{ upload: PhotoUpload; preview: string }> {
  const src: ImageBitmap | HTMLImageElement =
    typeof createImageBitmap === "function"
      ? await createImageBitmap(file, { imageOrientation: "from-image" })
      : await new Promise<HTMLImageElement>((ok, fail) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => (URL.revokeObjectURL(url), ok(img));
          img.onerror = () => (URL.revokeObjectURL(url), fail(new Error("decode")));
          img.src = url;
        });
  const scale = Math.min(1, MAX_EDGE / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(src, 0, 0, canvas.width, canvas.height);
  if ("close" in src) src.close();
  for (const q of [0.82, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (((url.length - url.indexOf(",") - 1) * 3) / 4 <= MAX_BYTES) return { upload: { media_type: "image/jpeg", data: url.slice(url.indexOf(",") + 1) }, preview: url };
  }
  throw new Error("too_large");
}

// ── 공유: 휴대폰은 공유 시트, 아니면 링크 복사
export async function sharePost(post: Pick<PostView, "id" | "title" | "category">): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const url = `${location.origin}/community/${post.id}`;
  const data = { title: `${post.title} — FOODIS World Table`, text: post.title, url };
  try {
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      await navigator.share(data);
      bump(post.category, "share", post.id);
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    bump(post.category, "share", post.id);
    return "copied";
  } catch (e) {
    return (e as Error).name === "AbortError" ? "cancelled" : "failed";
  }
}
