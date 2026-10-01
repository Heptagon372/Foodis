// GET /api/me — 로그인 여부 · 프로필 / DELETE /api/me — 회원 탈퇴 (계정과 Passport·식이·Food DNA 전부 삭제)
// user 테이블은 모두 auth.users on delete cascade 라서 계정만 지우면 기록이 함께 지워진다. 신고(reports)는 user_id 만 비워진다.
import { jsonError } from "@/lib/api/http";
import { currentUserId, supabaseAdmin, supabaseForRequest } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";

export async function GET() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return Response.json({ user: null });
  const { data } = await (await supabaseForRequest()).auth.getUser();
  const u = data.user;
  return Response.json({ user: u ? { id: u.id, email: u.email ?? null, provider: u.app_metadata?.provider ?? "email" } : null });
}

export async function DELETE() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return jsonError(401, "unauthorized", "로그인이 필요해요");
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
  if (error) return jsonError(500, "delete_failed", error.message);
  await (await supabaseForRequest()).auth.signOut().catch(() => {});
  return Response.json({ ok: true });
}
