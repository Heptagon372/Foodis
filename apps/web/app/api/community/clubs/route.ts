// GET  /api/community/clubs?topic=<주제> — 모임 목록 (회원 많은 순) + 급상승 · 내가 가입한 모임
// POST /api/community/clubs — 모임 만들기 (운영: 로그인 필요). 만든 사람은 자동 가입
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { isCategory } from "@/lib/community/categories";
import { moderate } from "@/lib/community/moderation";
import { getStore, getViewer, invalidateClubHeat, toClubViews } from "@/lib/community/server";
import { NewClubInput, type ClubRow } from "@/lib/community/types";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/foodi/deps";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { getLLM, llmReady } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("topic");
  const topic = isCategory(t) && t !== "buddy" ? t : null;
  try {
    const store = await getStore();
    const viewer = await getViewer(req, store.mode === "live");
    const clubs = await toClubViews(store, await store.listClubs({ topic, limit: 100 }), viewer);
    // 내 모임은 주제 필터와 상관없이 따로 (모임 탭 맨 위 줄)
    const mineIds = [...(await store.memberOf(viewer.key, null))].slice(0, 20);
    const mineRows = (await Promise.all(mineIds.map((id) => store.getClub(id)))).filter((c): c is ClubRow => c != null);
    const mine = await toClubViews(store, mineRows, viewer);
    return Response.json({ clubs, mine, mode: store.mode, can_write: viewer.canWrite }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(500, "clubs_failed", (e as Error).message);
  }
}

export async function POST(req: Request) {
  const store = await getStore();
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.canWrite || !viewer.key) return jsonError(401, "login_required", "모임은 로그인한 뒤에 만들 수 있어요.");
  const daily = rateLimit(clientKey(req, viewer.userId ?? viewer.anonId) + ":club-create-day", 3, 86_400_000);
  if (!daily.ok) return tooMany(daily.retryAfterSec);
  const body = await parseBody(req, NewClubInput);
  if (!body.ok) return body.res;
  const c = body.data;

  const repo = await getRepo();
  const spent = await repo.usageTodayUsd().catch(() => 0);
  const mod = await moderate(llmReady() && spent < env.dailyBudgetUsd ? getLLM() : null, `${c.name}\n${c.description}`);
  if (mod.usage) await repo.recordUsage([mod.usage], null).catch(() => {});
  if (!mod.result.ok) return jsonError(422, "moderation_blocked", mod.result.reason);

  try {
    const row = await store.createClub({ name: c.name, topic: c.topic, description: c.description, cover: c.cover ?? null, owner_key: viewer.key, owner_name: viewer.name });
    if (row === "duplicate") return jsonError(409, "duplicate_name", "같은 이름의 모임이 이미 있어요. 다른 이름을 지어 주세요.");
    invalidateClubHeat();
    const [view] = await toClubViews(store, [row], viewer);
    return Response.json({ club: view }, { status: 201 });
  } catch (e) {
    return jsonError(500, "club_failed", (e as Error).message);
  }
}
