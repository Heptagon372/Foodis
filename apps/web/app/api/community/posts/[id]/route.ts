// GET    /api/community/posts/:id — 글 + 댓글 + 내 상태(따봉·참여·투표)
// POST   /api/community/posts/:id — {action: like | join | vote(option) | report(reason)} (운영: 로그인 필요)
// DELETE /api/community/posts/:id — 내 글 지우기
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { getStore, getViewer, recordSignal, toCommentView, toViews } from "@/lib/community/server";
import { NotFound } from "@/lib/community/store";
import { buddyState, PostAction, type SignalKind } from "@/lib/community/types";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const ID = /^[A-Za-z0-9-]{1,64}$/;

export async function GET(req: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!ID.test(id)) return jsonError(400, "invalid_id", "글 id 가 올바르지 않아요.");
  try {
    const store = await getStore();
    const viewer = await getViewer(req, store.mode === "live");
    const row = await store.getPost(id);
    if (!row) return jsonError(404, "post_not_found", "글을 찾을 수 없어요. 지워졌거나 숨겨진 글이에요.");
    const [[post], comments] = await Promise.all([toViews(store, [row], viewer), store.listComments(id)]);
    return Response.json({ post, comments: comments.map((c) => toCommentView(c, viewer)), mode: store.mode, can_write: viewer.canWrite }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(500, "post_failed", (e as Error).message);
  }
}

const LOGIN_MSG: Record<PostAction["action"], string> = {
  like: "따봉은 로그인한 뒤에 누를 수 있어요.",
  join: "밥친구 참여는 로그인한 뒤에 할 수 있어요.",
  vote: "투표는 로그인한 뒤에 할 수 있어요.",
  report: "신고는 로그인한 뒤에 할 수 있어요.",
};

export async function POST(req: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!ID.test(id)) return jsonError(400, "invalid_id", "글 id 가 올바르지 않아요.");
  const body = await parseBody(req, PostAction);
  if (!body.ok) return body.res;
  const a = body.data;
  const store = await getStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.canWrite || !viewer.key) return jsonError(401, "login_required", LOGIN_MSG[a.action]);
  const rl = rateLimit(clientKey(req, viewer.userId ?? viewer.anonId) + ":community-act", 40, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    const post = await store.getPost(id);
    if (!post) return jsonError(404, "post_not_found", "글을 찾을 수 없어요.");
    let signal: SignalKind | null = null;
    let out: Record<string, unknown>;
    if (a.action === "like") {
      const r = await store.toggleLike(id, viewer.key);
      out = { liked: r.on, like_count: r.count };
      if (r.on) signal = "like";
    } else if (a.action === "join") {
      if (!buddyState(post)) return jsonError(400, "not_buddy", "밥친구 글·모임 정모에서만 참여할 수 있어요.");
      if (post.author_key === viewer.key) return jsonError(400, "own_post", "내가 쓴 글에는 참여 버튼 대신 댓글로 소식을 전해요.");
      const r = await store.toggleJoin(id, viewer.key);
      if (r === "full") return jsonError(409, "full", "자리가 다 찼거나 약속 시간이 지났어요.");
      out = { joined: r.on, join_count: r.count };
      if (r.on) signal = "join";
    } else if (a.action === "vote") {
      const counts = await store.vote(id, viewer.key, a.option);
      out = { vote: a.option, poll_counts: counts };
      signal = "vote";
    } else {
      if (post.author_key === viewer.key) return jsonError(400, "own_post", "내 글은 신고 대신 지울 수 있어요.");
      const r = await store.report(id, viewer.key, a.reason ?? null);
      out = { reported: true, hidden: r.hidden };
    }
    if (signal) await recordSignal(store, viewer, signal, post.category, id);
    return Response.json(out);
  } catch (e) {
    if (e instanceof NotFound) return jsonError(404, "post_not_found", "글을 찾을 수 없어요.");
    if (e instanceof RangeError) return jsonError(400, "invalid_option", "없는 선택지예요.");
    return jsonError(500, "action_failed", (e as Error).message);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!ID.test(id)) return jsonError(400, "invalid_id", "글 id 가 올바르지 않아요.");
  const store = await getStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.key) return jsonError(401, "login_required", "로그인이 필요해요.");
  try {
    const ok = await store.deletePost(id, viewer.key);
    return ok ? Response.json({ ok: true }) : jsonError(404, "post_not_found", "내 글이 아니거나 이미 지워졌어요.");
  } catch (e) {
    return jsonError(500, "delete_failed", (e as Error).message);
  }
}
