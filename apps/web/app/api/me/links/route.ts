// GET /api/me/links — 내 소셜 연결(social_links) 목록 + 인스타 로그인이 켜져 있는지 / DELETE ?provider=instagram — 연결 해제 (06 문서 §7)
// 카카오·Google 은 Supabase 신원(auth.identities)이라 브라우저가 linkIdentity/unlinkIdentity 로 직접 한다. 여기는 Supabase 밖의 인스타그램만
// 본인 확인은 세션 쿠키, 읽기·지우기는 service_role 로 user_id 를 고정해서
import { jsonError, tooMany } from "@/lib/api/http";
import { instagramConfigured } from "@/lib/auth/instagram";
import { canUnlink, retiredEmail, syntheticEmail, UNLINK_BLOCKED } from "@/lib/auth/links";
import { currentUserId, supabaseAdmin, supabaseForRequest } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/guard/ratelimit";

export async function GET() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return jsonError(401, "unauthorized", "로그인이 필요해요");
  if (!env.supabaseServiceKey) return Response.json({ instagram: false, links: [] });
  const { data, error } = await supabaseAdmin().from("social_links").select("provider, username, avatar_url, created_at").eq("user_id", userId);
  // 0013 을 아직 안 돌렸으면(표 없음) 인스타 연결은 숨긴다 — 눌러도 콜백에서 실패하니까
  if (error) return Response.json({ instagram: false, links: [] });
  return Response.json({ instagram: instagramConfigured(env), links: data ?? [] });
}

export async function DELETE(req: Request) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return jsonError(401, "unauthorized", "로그인이 필요해요");
  const user = (await (await supabaseForRequest()).auth.getUser().catch(() => null))?.data.user;
  if (!user) return jsonError(401, "unauthorized", "로그인이 필요해요");
  const limit = rateLimit(user.id + ":links", 10, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec);
  if (new URL(req.url).searchParams.get("provider") !== "instagram") return jsonError(400, "unsupported_provider", "카카오·Google 연결 해제는 브라우저에서 해요");

  const db = supabaseAdmin();
  const { data: rows, error } = await db.from("social_links").select("provider_uid").eq("user_id", user.id).eq("provider", "instagram");
  if (error) return jsonError(500, "links_read_failed", error.message);
  if (!rows?.length) return Response.json({ ok: true });

  // 마지막 로그인 방법은 못 지운다 (인스타로만 가입하고 다른 방법을 안 붙인 회원)
  const verdict = canUnlink("instagram", { identities: (user.identities ?? []).map((i) => i.provider), instagram: true, email: user.email ?? null });
  if (!verdict.ok) return jsonError(409, verdict.reason, UNLINK_BLOCKED[verdict.reason]);

  const del = await db.from("social_links").delete().eq("user_id", user.id).eq("provider", "instagram");
  if (del.error) return jsonError(500, "unlink_failed", del.error.message);
  // 이 인스타로 만든 계정이면 가짜 메일을 비켜 둔다 — 같은 인스타로 다시 로그인했을 때 해제한 이 계정으로 들어오지 않게
  const email = user.email?.toLowerCase();
  if (email && rows.some((r) => email === syntheticEmail("instagram", r.provider_uid))) await db.auth.admin.updateUserById(user.id, { email: retiredEmail(user.id), email_confirm: true });
  return Response.json({ ok: true });
}
