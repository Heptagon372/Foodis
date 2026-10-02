// 커뮤니티 저장소 인터페이스 + 메모리 구현(미리보기·테스트용).
// 운영은 supabase-store.ts (0006_community.sql). 키가 없거나 마이그레이션 전이면 메모리 저장소 + 샘플 글로 같은 화면이 돈다
// (데모에서 빈 커뮤니티가 되지 않게 — 02 문서 "사용자 없는 커뮤니티는 빈 화면" 우려). 메모리는 서버를 다시 켜면 처음으로 돌아간다.
import type { CategoryKey } from "./categories";
import { buddyState, type CommentRow, type Photo, type PostRow, type Signal, type ViewerState } from "./types";

export type NewPost = Omit<PostRow, "id" | "like_count" | "comment_count" | "join_count" | "created_at" | "photos"> & {
  photos: { media_type: string; data: string }[];
};

export type ToggleResult = { on: boolean; count: number };

export interface CommunityStore {
  readonly mode: "live" | "preview";
  /** 보이는 글, 최신 순. categories 가 있으면 그 안에서만 */
  listPosts(q: { categories: CategoryKey[] | null; limit: number }): Promise<PostRow[]>;
  getPost(id: string): Promise<PostRow | null>;
  createPost(p: NewPost): Promise<PostRow>;
  /** 글쓴이만. 지웠으면 true */
  deletePost(id: string, authorKey: string): Promise<boolean>;
  viewerStates(ids: string[], viewerKey: string | null): Promise<Map<string, ViewerState>>;
  pollCounts(ids: string[]): Promise<Map<string, number[]>>;
  toggleLike(id: string, key: string): Promise<ToggleResult>;
  /** 밥친구 참여. 자리가 없으면 "full" */
  toggleJoin(id: string, key: string): Promise<ToggleResult | "full">;
  /** 같은 사람이 다시 고르면 바꾼다 */
  vote(id: string, key: string, option: number): Promise<number[]>;
  /** 신고 (1인 1회). 누적으로 숨겨졌으면 hidden=true */
  report(id: string, key: string, reason: string | null): Promise<{ hidden: boolean }>;
  listComments(postId: string): Promise<CommentRow[]>;
  addComment(c: Omit<CommentRow, "id" | "created_at">): Promise<CommentRow>;
  deleteComment(id: string, authorKey: string): Promise<boolean>;
  addSignals(rows: (Omit<Signal, "at"> & { anon_id: string | null; user_id: string | null })[]): Promise<void>;
  recentSignals(sinceIso: string): Promise<Pick<Signal, "kind" | "category" | "at">[]>;
}

/** 신고 몇 건이면 자동으로 숨기나 (0006 트리거와 같은 값) */
export const HIDE_AFTER_REPORTS = 3;

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

// 글 행(row)과 메모리 전용 상태(누가 눌렀나)를 나눠 둔다 — 밖으로는 row 복사본만 나간다
type MemPost = { row: PostRow; hidden: boolean; likes: Set<string>; joins: Set<string>; votes: Map<string, number>; reports: Set<string> };
const mem = (row: PostRow): MemPost => ({ row, hidden: false, likes: new Set(), joins: new Set(), votes: new Map(), reports: new Set() });

/** 메모리 저장소. photoUrl: 올라온 사진(base64)을 보여 줄 주소로 바꾸는 함수 (미리보기는 /api/community/photos/:id) */
export type MemorySeed = { posts: PostRow[]; comments: CommentRow[]; signals: Pick<Signal, "kind" | "category" | "at">[]; /** 샘플 글의 투표 수 (실제 표에 더한다) */ pollVotes?: Record<string, number[]> };

export function memoryStore(opts: { seed?: MemorySeed; savePhoto?: (p: { media_type: string; data: string }) => string } = {}): CommunityStore {
  const posts = new Map<string, MemPost>();
  const comments: CommentRow[] = [...(opts.seed?.comments ?? [])];
  const signals: Pick<Signal, "kind" | "category" | "at">[] = [...(opts.seed?.signals ?? [])];
  for (const p of opts.seed?.posts ?? []) posts.set(p.id, mem({ ...p }));

  const strip = (p: MemPost): PostRow => ({ ...p.row });
  const visible = (id: string) => {
    const p = posts.get(id);
    return p && !p.hidden ? p : null;
  };
  const counts = (p: MemPost, base: number[] | undefined) => {
    const n = p.row.poll?.options.length ?? 0;
    const c = Array.from({ length: n }, (_, i) => base?.[i] ?? 0);
    for (const o of p.votes.values()) if (o < n) c[o]++;
    return c;
  };
  const seededVotes = new Map(Object.entries(opts.seed?.pollVotes ?? {}));

  return {
    mode: "preview",
    async listPosts({ categories, limit }) {
      return [...posts.values()]
        .filter((p) => !p.hidden && (!categories || categories.includes(p.row.category)))
        .sort((a, b) => b.row.created_at.localeCompare(a.row.created_at))
        .slice(0, limit)
        .map(strip);
    },
    async getPost(id) {
      const p = visible(id);
      return p ? strip(p) : null;
    },
    async createPost({ photos, ...p }) {
      const photoUrls: Photo[] = photos.map((ph) => ({ url: opts.savePhoto ? opts.savePhoto(ph) : `data:${ph.media_type};base64,${ph.data}` }));
      const m = mem({ ...p, id: uid(), photos: photoUrls, like_count: 0, comment_count: 0, join_count: 0, created_at: new Date().toISOString() });
      posts.set(m.row.id, m);
      return strip(m);
    },
    async deletePost(id, authorKey) {
      const p = posts.get(id);
      if (!p || p.row.author_key !== authorKey) return false;
      posts.delete(id);
      return true;
    },
    async viewerStates(ids, key) {
      return new Map(
        ids.map((id) => {
          const p = posts.get(id);
          return [id, { liked: Boolean(key && p?.likes.has(key)), joined: Boolean(key && p?.joins.has(key)), vote: key ? (p?.votes.get(key) ?? null) : null }];
        }),
      );
    },
    async pollCounts(ids) {
      const m = new Map<string, number[]>();
      for (const id of ids) {
        const p = posts.get(id);
        if (p?.row.poll) m.set(id, counts(p, seededVotes.get(id)));
      }
      return m;
    },
    async toggleLike(id, key) {
      const p = visible(id);
      if (!p) throw new NotFound();
      const on = !p.likes.has(key);
      if (on) p.likes.add(key);
      else p.likes.delete(key);
      p.row.like_count = Math.max(0, p.row.like_count + (on ? 1 : -1));
      return { on, count: p.row.like_count };
    },
    async toggleJoin(id, key) {
      const p = visible(id);
      if (!p) throw new NotFound();
      if (p.joins.has(key)) {
        p.joins.delete(key);
        p.row.join_count = Math.max(0, p.row.join_count - 1);
        return { on: false, count: p.row.join_count };
      }
      if (buddyState(p.row) !== "open") return "full";
      p.joins.add(key);
      p.row.join_count++;
      return { on: true, count: p.row.join_count };
    },
    async vote(id, key, option) {
      const p = visible(id);
      if (!p?.row.poll) throw new NotFound();
      if (option >= p.row.poll.options.length) throw new RangeError("option");
      p.votes.set(key, option);
      return counts(p, seededVotes.get(id));
    },
    async report(id, key) {
      const p = posts.get(id);
      if (!p) throw new NotFound();
      p.reports.add(key);
      if (p.reports.size >= HIDE_AFTER_REPORTS) p.hidden = true;
      return { hidden: p.hidden };
    },
    async listComments(postId) {
      return comments.filter((c) => c.post_id === postId).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async addComment(c) {
      const p = visible(c.post_id);
      if (!p) throw new NotFound();
      const row: CommentRow = { ...c, id: uid(), created_at: new Date().toISOString() };
      comments.push(row);
      p.row.comment_count++;
      return row;
    },
    async deleteComment(id, authorKey) {
      const i = comments.findIndex((c) => c.id === id && c.author_key === authorKey);
      if (i < 0) return false;
      const [c] = comments.splice(i, 1);
      const p = posts.get(c.post_id);
      if (p) p.row.comment_count = Math.max(0, p.row.comment_count - 1);
      return true;
    },
    async addSignals(rows) {
      const at = new Date().toISOString();
      signals.push(...rows.map((r) => ({ kind: r.kind, category: r.category, at })));
      if (signals.length > 20_000) signals.splice(0, signals.length - 20_000);
    },
    async recentSignals(since) {
      return signals.filter((s) => s.at >= since);
    },
  };
}

export class NotFound extends Error {
  constructor() {
    super("not_found");
  }
}

/** 화면 이름: 계정 이름 → 이메일 앞 3글자 + ** (전체 이메일은 보이지 않게) */
export function displayName(u: { name?: string | null; email?: string | null } | null): string {
  const n = u?.name?.trim();
  if (n) return n.slice(0, 20);
  const local = u?.email?.split("@")[0];
  return local ? `${local.slice(0, 3)}**` : "푸디 탐험가";
}
