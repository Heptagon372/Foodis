// GET /api/me — 로그인 여부 · 프로필 / DELETE /api/me — 회원 탈퇴 (계정과 Passport·식이·Food DNA 전부 삭제)
// user 테이블은 모두 auth.users on delete cascade 라서 계정만 지우면 기록이 함께 지워진다. 신고(reports)는 user_id 만 비워진다.
import { jsonError } from "@/lib/api/http";
import { visibleEmail } from "@/lib/auth/links";
import { currentUserId, supabaseAdmin, supabaseForRequest } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";

export async function GET() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return Response.json({ user: null });
  const { data } = await (await supabaseForRequest()).auth.getUser();
  const u = data.user;
  // 인스타로 가입한 회원: 가짜 메일은 내보내지 않고 제공자는 instagram 으로 (06 문서 §7)
  return Response.json({ user: u ? { id: u.id, email: visibleEmail(u.email), provider: u.app_metadata?.foodis_provider === "instagram" ? "instagram" : (u.app_metadata?.provider ?? "email") } : null });
}

export async function DELETE() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return jsonError(401, "unauthorized", "로그인이 필요해요");
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
  if (error) return jsonError(500, "delete_failed", error.message);
  await (await supabaseForRequest()).auth.signOut().catch(() => {});
  return Response.json({ ok: true });
}
