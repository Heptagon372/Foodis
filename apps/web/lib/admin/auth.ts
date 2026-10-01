// 어드민 권한 (07 문서 F-ADM, 거버넌스 "작성자와 검수자 분리").
// 역할: editor(입력·수정) < reviewer(검수 승인) < admin(전체 + 예외 승인).
// ADMIN_EMAILS(쉼표 구분)에 있는 메일은 admin_roles 와 무관하게 admin — 팀 초기 설정용.
import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { supabaseAdmin, supabaseForRequest } from "@/lib/db/supabase-server";

export type AdminRole = "editor" | "reviewer" | "admin";
export type AdminSession = { userId: string; email: string; role: AdminRole | null };

const RANK: Record<AdminRole, number> = { editor: 1, reviewer: 2, admin: 3 };
export const hasRole = (s: AdminSession | null, min: AdminRole) => Boolean(s?.role && RANK[s.role] >= RANK[min]);

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function getAdminSession(): Promise<AdminSession | null> {
  const { data } = await (await supabaseForRequest()).auth.getUser();
  const user = data.user;
  if (!user?.email) return null;
  if (adminEmails().includes(user.email.toLowerCase())) return { userId: user.id, email: user.email, role: "admin" };
  const { data: row } = await supabaseAdmin().from("admin_roles").select("role").eq("user_id", user.id).maybeSingle();
  return { userId: user.id, email: user.email, role: (row?.role as AdminRole) ?? null };
}

/** 서버 컴포넌트용: 로그인 안 했으면 로그인 화면으로, 권한 없으면 안내 */
export async function requirePage(min: AdminRole = "editor"): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (!hasRole(s, min)) redirect("/admin/login?denied=1");
  return s;
}

/** 라우트 핸들러용: 실패하면 Response 를 돌려준다 */
export async function requireApi(min: AdminRole): Promise<AdminSession | NextResponse> {
  const s = await getAdminSession().catch(() => null);
  if (!s) return NextResponse.json({ error: { code: "unauthorized", message: "로그인이 필요해요" } }, { status: 401 });
  if (!hasRole(s, min)) return NextResponse.json({ error: { code: "forbidden", message: `${min} 이상 권한이 필요해요` } }, { status: 403 });
  return s;
}
