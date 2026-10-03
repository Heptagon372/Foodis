// GET  /api/community/buddy/chats/:id?after=<ISO> — 대화 정보 + 그 뒤 메시지 (화면이 몇 초마다 묻는다)
// POST /api/community/buddy/chats/:id — { action: "send", body } | { action: "end" } (대화 종료: 둘 다 더는 보낼 수 없다)
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { getBuddyStore, isMember, toChatView, toMessageView } from "@/lib/buddy/server";
import { ChatAction } from "@/lib/buddy/types";
import { getViewer } from "@/lib/community/server";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const ID = /^[A-Za-z0-9-]{1,64}$/;

export async function GET(req: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!ID.test(id)) return jsonError(404, "not_found", "대화를 찾을 수 없어요.");
  const after = new URL(req.url).searchParams.get("after");
  const afterIso = after && !Number.isNaN(Date.parse(after)) ? after : null;
  try {
    const store = await getBuddyStore();
    const viewer = await getViewer(req, store.mode === "live");
    const chat = await store.getChat(id);
    if (!chat || !viewer.key || !isMember(chat, viewer.key)) return jsonError(404, "not_found", "대화를 찾을 수 없어요.");
    const [messages, last] = await Promise.all([store.listMessages(id, afterIso, 200), store.lastMessages([id])]);
    return Response.json(
      { chat: toChatView(chat, viewer.key, last.get(id)), messages: messages.map((m) => toMessageView(m, viewer.key!)), mode: store.mode },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return jsonError(500, "chat_failed", (e as Error).message);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!ID.test(id)) return jsonError(404, "not_found", "대화를 찾을 수 없어요.");
  const store = await getBuddyStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.canWrite || !viewer.key) return jsonError(401, "login_required", "대화는 로그인한 뒤에 할 수 있어요.");
  const body = await parseBody(req, ChatAction);
  if (!body.ok) return body.res;

  try {
    const chat = await store.getChat(id);
    if (!chat || !isMember(chat, viewer.key)) return jsonError(404, "not_found", "대화를 찾을 수 없어요.");
    if (body.data.action === "end") {
      const c = await store.endChat(id, viewer.key);
      return Response.json({ chat: toChatView(c!, viewer.key, undefined) });
    }
    const rl = rateLimit(clientKey(req, viewer.userId ?? viewer.anonId) + ":buddy-send", 30, 60_000);
    if (!rl.ok) return tooMany(rl.retryAfterSec);
    const m = await store.addMessage({ chat_id: id, sender_key: viewer.key, body: body.data.body });
    if (m === "ended") return jsonError(409, "chat_ended", "종료된 대화예요.");
    return Response.json({ message: toMessageView(m, viewer.key) }, { status: 201 });
  } catch (e) {
    return jsonError(500, "chat_failed", (e as Error).message);
  }
}
