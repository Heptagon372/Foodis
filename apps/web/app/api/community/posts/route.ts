// GET  /api/community/posts?filter=all|club|<카테고리>&sort=foryou|latest|popular&offset=0&i=halal:1,korean:0.4
//      피드. sort=foryou 는 i(브라우저가 쌓은 내 관심, 0~1) + 모두의 트렌드로 순서를 정하고 "왜 이 글?" 이유를 붙인다.
// POST /api/community/posts — 글쓰기 (운영: 로그인 필요). 사진·투표·위치 포함. 사전 필터 → 음식 태그 → 저장 → 신호 기록
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { filterCategories, isCategory, type FeedFilter } from "@/lib/community/categories";
import { moderate } from "@/lib/community/moderation";
import { getStore, getViewer, recordSignal, tagVocab, toViews, trendsOf } from "@/lib/community/server";
import { matchTags } from "@/lib/community/tags";
import { decodeInterest, popularity, rankForYou } from "@/lib/community/trends";
import { NewPostInput, SORTS, type Sort } from "@/lib/community/types";
import { getRepo } from "@/lib/foodi/deps";
import { env } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { getLLM, llmReady } from "@/lib/providers";

export const dynamic = "force-dynamic";

const PAGE = 20;
const POOL = 200; // 순서를 매길 후보: 최근 글 200개

export async function GET(req: Request) {
  const url = new URL(req.url);
  const f = url.searchParams.get("filter") ?? "all";
  const filter: FeedFilter = f === "all" || f === "club" || isCategory(f) ? (f as FeedFilter) : "all";
  const s = url.searchParams.get("sort") as Sort | null;
  const sort: Sort = s && (SORTS as readonly string[]).includes(s) ? s : "foryou";
  const offset = Math.max(0, Math.min(Number(url.searchParams.get("offset")) || 0, POOL));

  try {
    const store = await getStore();
    const viewer = await getViewer(req, store.mode === "live");
    const pool = await store.listPosts({ categories: filterCategories(filter), limit: POOL });
    let rows = pool;
    let reasons: Map<string, string | null> | undefined;
    if (sort === "foryou") {
      const ranked = rankForYou(pool, decodeInterest(url.searchParams.get("i")), (await trendsOf(store)).trends);
      rows = ranked.map((r) => r.post);
      reasons = new Map(ranked.map((r) => [r.post.id, r.reason]));
    } else if (sort === "popular") {
      const now = Date.now();
      rows = [...pool].sort((a, b) => popularity(b, now) - popularity(a, now));
    }
    const page = rows.slice(offset, offset + PAGE);
    return Response.json(
      { posts: await toViews(store, page, viewer, reasons), next: offset + PAGE < rows.length ? offset + PAGE : null, mode: store.mode, can_write: viewer.canWrite },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return jsonError(500, "feed_failed", (e as Error).message);
  }
}

export async function POST(req: Request) {
  const store = await getStore().catch(() => null);
  if (!store) return jsonError(503, "community_unavailable", "커뮤니티를 잠시 쓸 수 없어요.");
  const viewer = await getViewer(req, store.mode === "live");
  if (!viewer.canWrite || !viewer.key) return jsonError(401, "login_required", "글은 로그인한 뒤에 쓸 수 있어요.");
  const key = clientKey(req, viewer.userId ?? viewer.anonId);
  const burst = rateLimit(key + ":community-post", 3, 60_000);
  const daily = rateLimit(key + ":community-post-day", 20, 86_400_000);
  if (!burst.ok || !daily.ok) return tooMany(burst.ok ? daily.retryAfterSec : burst.retryAfterSec);
  const body = await parseBody(req, NewPostInput);
  if (!body.ok) return body.res;
  const p = body.data;
  if (p.meet_at && new Date(p.meet_at).getTime() < Date.now() - 10 * 60_000) return jsonError(400, "meet_in_past", "만날 시각이 이미 지났어요.");

  const text = [p.title, p.body, p.place, p.poll?.question, ...(p.poll?.options ?? [])].filter(Boolean).join("\n");
  const repo = await getRepo();
  const spent = await repo.usageTodayUsd().catch(() => 0);
  const mod = await moderate(llmReady() && spent < env.dailyBudgetUsd ? getLLM() : null, text);
  if (mod.usage) await repo.recordUsage([mod.usage], null).catch(() => {});
  if (!mod.result.ok) return jsonError(422, "moderation_blocked", mod.result.reason);

  try {
    const tags = matchTags(`${p.title}\n${p.body}`, (await tagVocab()).v);
    const row = await store.createPost({
      author_key: viewer.key,
      author_name: viewer.name,
      category: p.category,
      title: p.title,
      body: p.body,
      place: p.place ?? null,
      meet_at: p.meet_at ? new Date(p.meet_at).toISOString() : null,
      capacity: p.capacity ?? null,
      photos: p.photos,
      poll: p.poll ? { question: p.poll.question ?? null, options: p.poll.options } : null,
      ...tags,
    });
    await recordSignal(store, viewer, "post", row.category, row.id);
    const [view] = await toViews(store, [row], viewer);
    return Response.json({ post: view }, { status: 201 });
  } catch (e) {
    return jsonError(500, "post_failed", (e as Error).message);
  }
}
