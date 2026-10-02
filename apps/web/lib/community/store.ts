// 커뮤니티 저장소 인터페이스 + 메모리 구현(미리보기·테스트용).
// 운영은 supabase-store.ts (0006_community.sql). 키가 없거나 마이그레이션 전이면 메모리 저장소 + 샘플 글로 같은 화면이 돈다
// (데모에서 빈 커뮤니티가 되지 않게 — 02 문서 "사용자 없는 커뮤니티는 빈 화면" 우려). 메모리는 서버를 다시 켜면 처음으로 돌아간다.
import type { CategoryKey } from "./categories";
import { buddyState, type ClubRow, type CommentRow, type Photo, type PostRow, type Signal, type ViewerState } from "./types";

export type NewPost = Omit<PostRow, "id" | "like_count" | "comment_count" | "join_count" | "created_at" | "photos"> & {
  photos: { media_type: string; data: string }[];
};

export type ToggleResult = { on: boolean; count: number };

export interface CommunityStore {
  readonly mode: "live" | "preview";
  /** 보이는 글, 최신 순. club: null = 게시판 글만 / 모임 id = 그 모임 글만 / "any" = 전부. categories 가 있으면 그 안에서만 */
  listPosts(q: { categories: CategoryKey[] | null; limit: number; club?: string | null | "any" }): Promise<PostRow[]>;
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

  // ── 모임
  /** 보이는 모임 (topic 이 있으면 그 주제만), 회원 많은 순 */
  listClubs(q: { topic: CategoryKey | null; limit: number }): Promise<ClubRow[]>;
  getClub(id: string): Promise<ClubRow | null>;
  /** 이름이 겹치면 "duplicate". 만든 사람은 자동으로 회원(owner) */
  createClub(c: NewClub): Promise<ClubRow | "duplicate">;
  /** 만든 사람만 */
  deleteClub(id: string, ownerKey: string): Promise<boolean>;
  /** 가입/탈퇴 토글. 만든 사람은 탈퇴 불가 → "owner" */
  toggleMember(id: string, key: string): Promise<ToggleResult | "owner">;
  /** 이 사람이 가입한 모임 id (ids 안에서만, ids 가 null 이면 전부) */
  memberOf(key: string | null, ids: string[] | null): Promise<Set<string>>;
  /** 급상승 계산용: 최근 가입·글 (모임 id, 시각) */
  clubActivity(sinceIso: string): Promise<{ club_id: string; at: number; kind: "join" | "post" }[]>;
}

export type NewClub = Omit<ClubRow, "id" | "member_count" | "post_count" | "last_post_at" | "created_at" | "cover"> & { cover: { media_type: string; data: string } | null };

/** 신고 몇 건이면 자동으로 숨기나 (0006 트리거와 같은 값) */
export const HIDE_AFTER_REPORTS = 3;

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

// 글 행(row)과 메모리 전용 상태(누가 눌렀나)를 나눠 둔다 — 밖으로는 row 복사본만 나간다
type MemPost = { row: PostRow; hidden: boolean; likes: Set<string>; joins: Set<string>; votes: Map<string, number>; reports: Set<string> };
const mem = (row: PostRow): MemPost => ({ row, hidden: false, likes: new Set(), joins: new Set(), votes: new Map(), reports: new Set() });

/** 메모리 저장소. photoUrl: 올라온 사진(base64)을 보여 줄 주소로 바꾸는 함수 (미리보기는 /api/community/photos/:id) */
export type MemorySeed = {
  posts: PostRow[];
  comments: CommentRow[];
  signals: Pick<Signal, "kind" | "category" | "at">[];
  /** 샘플 글의 투표 수 (실제 표에 더한다) */
  pollVotes?: Record<string, number[]>;
  clubs?: ClubRow[];
  /** 샘플 모임 회원 (가입 시각 포함 — 급상승 계산용) */
  members?: { club_id: string; key: string; at: string }[];
};

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
  const clubs = new Map<string, ClubRow>((opts.seed?.clubs ?? []).map((c) => [c.id, { ...c }]));
  const members = new Map<string, Map<string, number>>(); // club → key → 가입 시각
  for (const m of opts.seed?.members ?? []) {
    const mm = members.get(m.club_id) ?? new Map<string, number>();
    mm.set(m.key, Date.parse(m.at));
    members.set(m.club_id, mm);
  }
  for (const c of clubs.values()) {
    const mm = members.get(c.id) ?? new Map<string, number>();
    if (!mm.has(c.owner_key)) mm.set(c.owner_key, Date.parse(c.created_at));
    members.set(c.id, mm);
    c.member_count = Math.max(c.member_count, mm.size);
  }
  const clubPosts = (id: string) => [...posts.values()].filter((p) => p.row.club_id === id && !p.hidden);
  const syncClub = (id: string | null) => {
    const c = id ? clubs.get(id) : null;
    if (!c) return;
    const list = clubPosts(c.id);
    c.post_count = list.length;
    c.last_post_at = list.map((p) => p.row.created_at).sort().at(-1) ?? null;
  };
  for (const c of clubs.values()) syncClub(c.id);

  return {
    mode: "preview",
    async listPosts({ categories, limit, club = null }) {
      return [...posts.values()]
        .filter((p) => !p.hidden && (!categories || categories.includes(p.row.category)) && (club === "any" || p.row.club_id === club))
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
      syncClub(m.row.club_id);
      return strip(m);
    },
    async deletePost(id, authorKey) {
      const p = posts.get(id);
      if (!p || p.row.author_key !== authorKey) return false;
      posts.delete(id);
      syncClub(p.row.club_id);
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
    async listClubs({ topic, limit }) {
      return [...clubs.values()]
        .filter((c) => !topic || c.topic === topic)
        .sort((a, b) => b.member_count - a.member_count || b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
        .map((c) => ({ ...c }));
    },
    async getClub(id) {
      const c = clubs.get(id);
      return c ? { ...c } : null;
    },
    async createClub({ cover, ...c }) {
      const key = c.name.replace(/\s+/g, "").toLowerCase();
      if ([...clubs.values()].some((x) => x.name.replace(/\s+/g, "").toLowerCase() === key)) return "duplicate";
      const row: ClubRow = { ...c, id: uid(), cover: cover ? { url: opts.savePhoto ? opts.savePhoto(cover) : `data:${cover.media_type};base64,${cover.data}` } : null, member_count: 1, post_count: 0, last_post_at: null, created_at: new Date().toISOString() };
      clubs.set(row.id, row);
      members.set(row.id, new Map([[c.owner_key, Date.now()]]));
      return { ...row };
    },
    async deleteClub(id, ownerKey) {
      const c = clubs.get(id);
      if (!c || c.owner_key !== ownerKey) return false;
      clubs.delete(id);
      members.delete(id);
      for (const [pid, p] of posts) if (p.row.club_id === id) posts.delete(pid);
      return true;
    },
    async toggleMember(id, key) {
      const c = clubs.get(id);
      if (!c) throw new NotFound();
      const mm = members.get(id) ?? new Map<string, number>();
      members.set(id, mm);
      if (mm.has(key)) {
        if (key === c.owner_key) return "owner";
        mm.delete(key);
      } else mm.set(key, Date.now());
      c.member_count = mm.size;
      return { on: mm.has(key), count: c.member_count };
    },
    async memberOf(key, ids) {
      if (!key) return new Set();
      return new Set([...members].filter(([id, mm]) => (!ids || ids.includes(id)) && mm.has(key)).map(([id]) => id));
    },
    async clubActivity(since) {
      const t = Date.parse(since);
      const joins = [...members].flatMap(([club_id, mm]) => [...mm.values()].filter((at) => at >= t).map((at) => ({ club_id, at, kind: "join" as const })));
      const ps = [...posts.values()].filter((p) => p.row.club_id && Date.parse(p.row.created_at) >= t).map((p) => ({ club_id: p.row.club_id!, at: Date.parse(p.row.created_at), kind: "post" as const }));
      return [...joins, ...ps];
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
