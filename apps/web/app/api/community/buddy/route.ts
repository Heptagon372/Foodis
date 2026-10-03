// GET  /api/community/buddy — 내 푸랜드 상태 + (켜져 있으면) 주변에 켜 둔 사람들 + 내 대화 목록
// POST /api/community/buddy — { action: "on", hours, profile, lat, lng } | { action: "off" } | { action: "locate", lat, lng }
// 켠 사람만 남의 위치를 본다(서로 보이는 사람끼리만). 남의 좌표는 약 110m 로 반올림해서 내보낸다
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { getBuddyStore, toBuddyView, toChatView, toMine } from "@/lib/buddy/server";
import { BuddyAction, isOn, NEARBY_RADIUS_M } from "@/lib/buddy/types";
import { ruleCheck } from "@/lib/community/moderation";
import { getViewer } from "@/lib/community/server";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const store = await getBuddyStore();
    const viewer = await getViewer(req, store.mode === "live");
    if (!viewer.key) return Response.json({ me: toMine(null), buddies: [], chats: [], mode: store.mode, can_use: false, name: viewer.name }, { headers: NO_STORE });
    const mine = await store.getPresence(viewer.key);
    const on = isOn(mine);
    const [rows, chatRows] = await Promise.all([
      on ? store.listActive({ near: mine!, radiusM: NEARBY_RADIUS_M, exclude: viewer.key, limit: 50 }) : Promise.resolve([]),
      store.listChats(viewer.key, 20),
    ]);
    const last = await store.lastMessages(chatRows.map((c) => c.id));
    return Response.json(
      {
        me: toMine(mine),
        buddies: rows.map((p) => toBuddyView(p, mine)),
        chats: chatRows.map((c) => toChatView(c, viewer.key!, last.get(c.id))),
        mode: store.mode,
        can_use: viewer.canWrite,
        name: viewer.name,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    return jsonError(500, "buddy_failed", (e as Error).message);
  }
}

export async function POST(req: Request) {
  const store = await getBuddyStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.canWrite || !viewer.key) return jsonError(401, "login_required", "푸랜드는 로그인한 뒤에 켤 수 있어요.");
  const body = await parseBody(req, BuddyAction);
  if (!body.ok) return body.res;
  const a = body.data;
  // 위치 갱신은 자주(분당 12번), 켜기·끄기는 분당 6번
  const rl = rateLimit(clientKey(req, viewer.userId ?? viewer.anonId) + `:buddy-${a.action === "locate" ? "locate" : "toggle"}`, a.action === "locate" ? 12 : 6, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    if (a.action === "off") {
      await store.setOff(viewer.key);
      return Response.json({ me: toMine(await store.getPresence(viewer.key)) });
    }
    if (a.action === "locate") {
      const row = await store.locate(viewer.key, { lat: a.lat, lng: a.lng });
      if (!row) return jsonError(409, "buddy_off", "푸랜드가 꺼져 있어요.");
      return Response.json({ me: toMine(row) });
    }
    const rule = ruleCheck(a.profile.message);
    if (!rule.ok) return jsonError(422, "moderation_blocked", rule.reason);
    const row = await store.upsertPresence({
      user_key: viewer.key,
      name: viewer.name,
      ...a.profile,
      lat: a.lat,
      lng: a.lng,
      on_until: new Date(Date.now() + a.hours * 3_600_000).toISOString(),
    });
    return Response.json({ me: toMine(row) });
  } catch (e) {
    return jsonError(500, "buddy_failed", (e as Error).message);
  }
}
