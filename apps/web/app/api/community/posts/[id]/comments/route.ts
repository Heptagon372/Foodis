// POST   /api/community/posts/:id/comments — 댓글 쓰기 (운영: 로그인 필요, 규칙·LLM 사전 필터)
// DELETE /api/community/posts/:id/comments?comment=<id> — 내 댓글 지우기
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { moderate } from "@/lib/community/moderation";
import { getStore, getViewer, recordSignal, toCommentView } from "@/lib/community/server";
import { NotFound } from "@/lib/community/store";
import { NewCommentInput } from "@/lib/community/types";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/foodi/deps";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { getLLM, llmReady } from "@/lib/providers";

type Ctx = { params: Promise<{ id: string }> };
const ID = /^[A-Za-z0-9-]{1,64}$/;

export async function POST(req: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!ID.test(id)) return jsonError(400, "invalid_id", "글 id 가 올바르지 않아요.");
  const store = await getStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.canWrite || !viewer.key) return jsonError(401, "login_required", "댓글은 로그인한 뒤에 쓸 수 있어요.");
  const key = clientKey(req, viewer.userId ?? viewer.anonId);
  const burst = rateLimit(key + ":community-comment", 6, 60_000);
  const daily = rateLimit(key + ":community-comment-day", 100, 86_400_000);
  if (!burst.ok || !daily.ok) return tooMany(burst.ok ? daily.retryAfterSec : burst.retryAfterSec);
  const body = await parseBody(req, NewCommentInput);
  if (!body.ok) return body.res;

  const repo = await getRepo();
  const spent = await repo.usageTodayUsd().catch(() => 0);
  const mod = await moderate(llmReady() && spent < env.dailyBudgetUsd ? getLLM() : null, body.data.body);
  if (mod.usage) await repo.recordUsage([mod.usage], null).catch(() => {});
  if (!mod.result.ok) return jsonError(422, "moderation_blocked", mod.result.reason);

  try {
    const post = await store.getPost(id);
    if (!post) return jsonError(404, "post_not_found", "글을 찾을 수 없어요.");
    const c = await store.addComment({ post_id: id, author_key: viewer.key, author_name: viewer.name, body: body.data.body });
    await recordSignal(store, viewer, "comment", post.category, id);
    return Response.json({ comment: toCommentView(c, viewer) }, { status: 201 });
  } catch (e) {
    if (e instanceof NotFound) return jsonError(404, "post_not_found", "글을 찾을 수 없어요.");
    return jsonError(500, "comment_failed", (e as Error).message);
  }
}

export async function DELETE(req: Request) {
  const cid = new URL(req.url).searchParams.get("comment") ?? "";
  if (!ID.test(cid)) return jsonError(400, "invalid_id", "댓글 id 가 올바르지 않아요.");
  const store = await getStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.key) return jsonError(401, "login_required", "로그인이 필요해요.");
  try {
    return (await store.deleteComment(cid, viewer.key)) ? Response.json({ ok: true }) : jsonError(404, "comment_not_found", "내 댓글이 아니거나 이미 지워졌어요.");
  } catch (e) {
    return jsonError(500, "delete_failed", (e as Error).message);
  }
}
