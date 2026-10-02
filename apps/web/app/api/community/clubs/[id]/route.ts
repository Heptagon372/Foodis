// GET    /api/community/clubs/:id — 모임 정보 + 내 가입 여부
// POST   /api/community/clubs/:id — 가입/탈퇴 토글 (운영: 로그인 필요, 만든 사람은 탈퇴 불가)
// DELETE /api/community/clubs/:id — 모임 없애기 (만든 사람만, 안의 글도 함께)
import { jsonError, tooMany } from "@/lib/api/http";
import { getStore, getViewer, invalidateClubHeat, recordSignal, toClubViews } from "@/lib/community/server";
import { NotFound } from "@/lib/community/store";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const ID = /^[A-Za-z0-9-]{1,64}$/;

export async function GET(req: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!ID.test(id)) return jsonError(400, "invalid_id", "모임 id 가 올바르지 않아요.");
  try {
    const store = await getStore();
    const viewer = await getViewer(req, store.mode === "live");
    const row = await store.getClub(id);
    if (!row) return jsonError(404, "club_not_found", "모임을 찾을 수 없어요.");
    const [club] = await toClubViews(store, [row], viewer);
    return Response.json({ club, mode: store.mode, can_write: viewer.canWrite }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(500, "club_failed", (e as Error).message);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!ID.test(id)) return jsonError(400, "invalid_id", "모임 id 가 올바르지 않아요.");
  const store = await getStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.canWrite || !viewer.key) return jsonError(401, "login_required", "모임 가입은 로그인한 뒤에 할 수 있어요.");
  const rl = rateLimit(clientKey(req, viewer.userId ?? viewer.anonId) + ":club-join", 20, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  try {
    const r = await store.toggleMember(id, viewer.key);
    if (r === "owner") return jsonError(400, "owner", "모임을 만든 사람은 탈퇴할 수 없어요. 모임을 없애려면 삭제해 주세요.");
    invalidateClubHeat();
    if (r.on) {
      const club = await store.getClub(id);
      if (club) await recordSignal(store, viewer, "join", club.topic, null);
    }
    return Response.json({ joined: r.on, member_count: r.count });
  } catch (e) {
    if (e instanceof NotFound) return jsonError(404, "club_not_found", "모임을 찾을 수 없어요.");
    return jsonError(500, "club_join_failed", (e as Error).message);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!ID.test(id)) return jsonError(400, "invalid_id", "모임 id 가 올바르지 않아요.");
  const store = await getStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.key) return jsonError(401, "login_required", "로그인이 필요해요.");
  try {
    const ok = await store.deleteClub(id, viewer.key);
    invalidateClubHeat();
    return ok ? Response.json({ ok: true }) : jsonError(404, "club_not_found", "내가 만든 모임이 아니거나 이미 없어졌어요.");
  } catch (e) {
    return jsonError(500, "club_delete_failed", (e as Error).message);
  }
}
