// CommunityStore 의 Supabase 구현 (service_role — 라우트가 로그인·권한을 확인한 뒤에만). 스키마: 0006_community.sql
// author_key = auth.users.id (운영은 로그인 사용자만 쓴다). 사진은 Storage 공개 버킷 community/<글 id>/<n>.jpg
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HIDE_AFTER_REPORTS, NotFound, type CommunityStore } from "./store";
import { buddyState, type ClubRow, type CommentRow, type Photo, type PostRow, type Signal } from "./types";

const POST_COLS = "id, club_id, author_id, author_name, category, title, body, place, meet_at, capacity, photos, poll, food_slugs, country_codes, like_count, comment_count, join_count, created_at";
const BUCKET = "community";

type DbPost = Omit<PostRow, "author_key" | "photos"> & { author_id: string; photos: (Photo & { path?: string })[] };
const toRow = ({ author_id, photos, ...p }: DbPost): PostRow => ({ ...p, author_key: author_id, photos: (photos ?? []).map(({ url, credit }) => ({ url, credit: credit ?? null })) });
type DbComment = Omit<CommentRow, "author_key"> & { author_id: string };
const toComment = ({ author_id, ...c }: DbComment): CommentRow => ({ ...c, author_key: author_id });
const CLUB_COLS = "id, name, topic, description, cover, owner_id, owner_name, member_count, post_count, last_post_at, created_at";
type DbClub = Omit<ClubRow, "owner_key" | "cover"> & { owner_id: string; cover: (Photo & { path?: string }) | null };
const toClub = ({ owner_id, cover, ...c }: DbClub): ClubRow => ({ ...c, owner_key: owner_id, cover: cover ? { url: cover.url } : null });

const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};
const isDup = (e: { code?: string } | null) => e?.code === "23505";

export function supabaseStore(db: SupabaseClient): CommunityStore {
  const post = async (id: string) => {
    const d = must(await db.from("community_posts").select(POST_COLS).eq("id", id).eq("status", "visible").maybeSingle()) as DbPost | null;
    return d ? toRow(d) : null;
  };
  const counter = async (id: string, col: "like_count" | "join_count") => {
    const d = must(await db.from("community_posts").select(col).eq("id", id).maybeSingle()) as Record<string, number> | null;
    return d?.[col] ?? 0;
  };

  return {
    mode: "live",
    async listPosts({ categories, limit, club = null }) {
      let q = db.from("community_posts").select(POST_COLS).eq("status", "visible").order("created_at", { ascending: false }).limit(limit);
      if (categories) q = q.in("category", categories);
      if (club === null) q = q.is("club_id", null);
      else if (club !== "any") q = q.eq("club_id", club);
      return (must(await q) as DbPost[]).map(toRow);
    },
    getPost: post,
    async createPost({ photos, author_key, ...p }) {
      const id = crypto.randomUUID();
      // 사진 먼저 올리고(실패하면 글도 만들지 않음), 글 행에 공개 주소를 넣는다
      const uploaded: { url: string; path: string }[] = [];
      try {
        for (const [i, ph] of photos.entries()) {
          const ext = ph.media_type === "image/png" ? "png" : ph.media_type === "image/webp" ? "webp" : "jpg";
          const path = `${id}/${i}.${ext}`;
          const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(ph.data, "base64"), { contentType: ph.media_type, upsert: false });
          if (error) throw new Error(`사진 올리기 실패: ${error.message}`);
          uploaded.push({ path, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
        }
        const d = must(await db.from("community_posts").insert({ ...p, id, author_id: author_key, photos: uploaded }).select(POST_COLS).single()) as DbPost;
        return toRow(d);
      } catch (e) {
        if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded.map((u) => u.path)).catch(() => {});
        throw e;
      }
    },
    async deletePost(id, authorKey) {
      const d = must(await db.from("community_posts").delete().eq("id", id).eq("author_id", authorKey).select("photos")) as { photos: { path?: string }[] }[];
      if (!d.length) return false;
      const paths = (d[0].photos ?? []).flatMap((p) => (p.path ? [p.path] : []));
      if (paths.length) await db.storage.from(BUCKET).remove(paths).catch(() => {});
      return true;
    },
    async viewerStates(ids, key) {
      const m = new Map(ids.map((id) => [id, { liked: false, joined: false, vote: null as number | null }]));
      if (!key || !ids.length) return m;
      const [likes, joins, votes] = await Promise.all([
        db.from("community_likes").select("post_id").eq("user_id", key).in("post_id", ids),
        db.from("community_joins").select("post_id").eq("user_id", key).in("post_id", ids),
        db.from("community_votes").select("post_id, option").eq("user_id", key).in("post_id", ids),
      ]);
      for (const r of must(likes) as { post_id: string }[]) m.get(r.post_id)!.liked = true;
      for (const r of must(joins) as { post_id: string }[]) m.get(r.post_id)!.joined = true;
      for (const r of must(votes) as { post_id: string; option: number }[]) m.get(r.post_id)!.vote = r.option;
      return m;
    },
    async pollCounts(ids) {
      const m = new Map<string, number[]>();
      if (!ids.length) return m;
      const rows = must(await db.from("community_poll_counts").select("post_id, option, count").in("post_id", ids)) as { post_id: string; option: number; count: number }[];
      for (const r of rows) {
        const c = m.get(r.post_id) ?? [];
        c[r.option] = r.count;
        m.set(r.post_id, c);
      }
      return m;
    },
    async toggleLike(id, key) {
      if (!(await post(id))) throw new NotFound();
      const ins = await db.from("community_likes").insert({ post_id: id, user_id: key });
      if (ins.error && !isDup(ins.error)) throw new Error(ins.error.message);
      const on = !ins.error;
      if (!on) must(await db.from("community_likes").delete().eq("post_id", id).eq("user_id", key));
      return { on, count: await counter(id, "like_count") };
    },
    async toggleJoin(id, key) {
      const p = await post(id);
      if (!p) throw new NotFound();
      const del = must(await db.from("community_joins").delete().eq("post_id", id).eq("user_id", key).select("post_id")) as unknown[];
      if (del.length) return { on: false, count: await counter(id, "join_count") };
      // 동시에 마지막 자리를 잡으면 1명 넘칠 수 있다 — 베타 규모에선 허용 (글쓴이가 댓글로 조율)
      if (buddyState(p) !== "open") return "full";
      const ins = await db.from("community_joins").insert({ post_id: id, user_id: key });
      if (ins.error && !isDup(ins.error)) throw new Error(ins.error.message);
      return { on: true, count: await counter(id, "join_count") };
    },
    async vote(id, key, option) {
      const p = await post(id);
      if (!p?.poll) throw new NotFound();
      if (option >= p.poll.options.length) throw new RangeError("option");
      must(await db.from("community_votes").upsert({ post_id: id, user_id: key, option, created_at: new Date().toISOString() }, { onConflict: "post_id,user_id" }));
      const c = (await this.pollCounts([id])).get(id) ?? [];
      return p.poll.options.map((_, i) => c[i] ?? 0);
    },
    async report(id, key, reason) {
      const ins = await db.from("community_reports").insert({ post_id: id, user_id: key, reason });
      if (ins.error && !isDup(ins.error)) {
        if (ins.error.code === "23503") throw new NotFound();
        throw new Error(ins.error.message);
      }
      const d = must(await db.from("community_posts").select("status, report_count").eq("id", id).maybeSingle()) as { status: string; report_count: number } | null;
      return { hidden: d ? d.status === "hidden" || d.report_count >= HIDE_AFTER_REPORTS : true };
    },
    async listComments(postId) {
      return (must(await db.from("community_comments").select("id, post_id, author_id, author_name, body, created_at").eq("post_id", postId).order("created_at").limit(300)) as DbComment[]).map(toComment);
    },
    async addComment({ author_key, ...c }) {
      if (!(await post(c.post_id))) throw new NotFound();
      return toComment(must(await db.from("community_comments").insert({ ...c, author_id: author_key }).select("id, post_id, author_id, author_name, body, created_at").single()) as DbComment);
    },
    async deleteComment(id, authorKey) {
      return (must(await db.from("community_comments").delete().eq("id", id).eq("author_id", authorKey).select("id")) as unknown[]).length > 0;
    },
    async addSignals(rows) {
      if (rows.length) must(await db.from("community_signals").insert(rows));
    },
    async listClubs({ topic, limit }) {
      let q = db.from("community_clubs").select(CLUB_COLS).eq("status", "visible").order("member_count", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
      if (topic) q = q.eq("topic", topic);
      return (must(await q) as DbClub[]).map(toClub);
    },
    async getClub(id) {
      const d = must(await db.from("community_clubs").select(CLUB_COLS).eq("id", id).eq("status", "visible").maybeSingle()) as DbClub | null;
      return d ? toClub(d) : null;
    },
    async createClub({ cover, owner_key, ...c }) {
      const id = crypto.randomUUID();
      let stored: { url: string; path: string } | null = null;
      if (cover) {
        const path = `clubs/${id}/cover.${cover.media_type === "image/png" ? "png" : cover.media_type === "image/webp" ? "webp" : "jpg"}`;
        const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(cover.data, "base64"), { contentType: cover.media_type });
        if (error) throw new Error(`사진 올리기 실패: ${error.message}`);
        stored = { path, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
      }
      const ins = await db.from("community_clubs").insert({ ...c, id, owner_id: owner_key, cover: stored }).select(CLUB_COLS).single();
      if (ins.error) {
        if (stored) await db.storage.from(BUCKET).remove([stored.path]).catch(() => {});
        if (isDup(ins.error)) return "duplicate";
        throw new Error(ins.error.message);
      }
      must(await db.from("community_club_members").insert({ club_id: id, user_id: owner_key, role: "owner" }));
      return toClub({ ...(ins.data as DbClub), member_count: 1 });
    },
    async deleteClub(id, ownerKey) {
      const d = must(await db.from("community_clubs").delete().eq("id", id).eq("owner_id", ownerKey).select("cover")) as { cover: { path?: string } | null }[];
      if (!d.length) return false;
      if (d[0].cover?.path) await db.storage.from(BUCKET).remove([d[0].cover.path]).catch(() => {});
      return true;
    },
    async toggleMember(id, key) {
      const club = await this.getClub(id);
      if (!club) throw new NotFound();
      const cur = must(await db.from("community_club_members").select("role").eq("club_id", id).eq("user_id", key).maybeSingle()) as { role: string } | null;
      if (cur?.role === "owner") return "owner";
      if (cur) must(await db.from("community_club_members").delete().eq("club_id", id).eq("user_id", key));
      else {
        const ins = await db.from("community_club_members").insert({ club_id: id, user_id: key });
        if (ins.error && !isDup(ins.error)) throw new Error(ins.error.message);
      }
      const after = must(await db.from("community_clubs").select("member_count").eq("id", id).maybeSingle()) as { member_count: number } | null;
      return { on: !cur, count: after?.member_count ?? club.member_count };
    },
    async memberOf(key, ids) {
      if (!key || (ids && !ids.length)) return new Set();
      let q = db.from("community_club_members").select("club_id").eq("user_id", key).limit(500);
      if (ids) q = q.in("club_id", ids);
      return new Set((must(await q) as { club_id: string }[]).map((r) => r.club_id));
    },
    async clubActivity(since) {
      const [joins, ps] = await Promise.all([
        db.from("community_club_members").select("club_id, joined_at").gte("joined_at", since).limit(5000),
        db.from("community_posts").select("club_id, created_at").not("club_id", "is", null).eq("status", "visible").gte("created_at", since).limit(5000),
      ]);
      return [
        ...(must(joins) as { club_id: string; joined_at: string }[]).map((r) => ({ club_id: r.club_id, at: Date.parse(r.joined_at), kind: "join" as const })),
        ...(must(ps) as { club_id: string; created_at: string }[]).map((r) => ({ club_id: r.club_id, at: Date.parse(r.created_at), kind: "post" as const })),
      ];
    },
    async recentSignals(since) {
      // 2주 창 · 최대 2만 줄 (1,000줄씩). 베타 규모 넘어가면 SQL 집계 뷰로 옮긴다
      const out: Pick<Signal, "kind" | "category" | "at">[] = [];
      for (let from = 0; from < 20_000; from += 1000) {
        const page = must(await db.from("community_signals").select("kind, category, at").gte("at", since).order("at", { ascending: false }).range(from, from + 999)) as typeof out;
        out.push(...page);
        if (page.length < 1000) break;
      }
      return out;
    },
  };
}
