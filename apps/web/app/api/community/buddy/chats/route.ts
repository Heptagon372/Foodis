// POST /api/community/buddy/chats — { to: 상대 푸랜드 공개 id } → 바로 1:1 대화 연결 (이미 진행 중이면 그 대화)
// 나도 푸랜드를 켜 둔 상태여야 한다 — 상대도 내가 누군지(음식 취향·한마디·나이·성별) 보고 이야기하게
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { getBuddyStore, profileOf, toChatView } from "@/lib/buddy/server";
import { isOn, StartChatInput } from "@/lib/buddy/types";
import { getViewer } from "@/lib/community/server";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const store = await getBuddyStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.canWrite || !viewer.key) return jsonError(401, "login_required", "대화는 로그인한 뒤에 할 수 있어요.");
  const rl = rateLimit(clientKey(req, viewer.userId ?? viewer.anonId) + ":buddy-chat-start", 20, 3_600_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const body = await parseBody(req, StartChatInput);
  if (!body.ok) return body.res;

  try {
    const [me, them] = await Promise.all([store.getPresence(viewer.key), store.getPresenceById(body.data.to)]);
    if (!isOn(me)) return jsonError(409, "buddy_off", "먼저 푸랜드를 켜 주세요. 상대도 내 정보를 보고 대화할 수 있어요.");
    if (!them || !isOn(them)) return jsonError(404, "buddy_gone", "상대가 푸랜드를 껐어요.");
    if (them.user_key === viewer.key) return jsonError(400, "self", "나와는 대화할 수 없어요.");
    const chat = await store.openChat({ key: viewer.key, name: viewer.name, profile: profileOf(me!) }, { key: them.user_key, name: them.name, profile: profileOf(them) });
    return Response.json({ chat: toChatView(chat, viewer.key, undefined) }, { status: 201 });
  } catch (e) {
    return jsonError(500, "chat_failed", (e as Error).message);
  }
}
