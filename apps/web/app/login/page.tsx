import { LoginView } from "@/components/LoginView";
import { isLive } from "@/lib/content";

export const metadata = { title: "로그인 — FOODIS" };
export const dynamic = "force-dynamic";

// 사용자 로그인 (F-AUTH-01). 선택 사항 — 둘러보기·푸디·Passport 는 로그인 없이 된다 (07 문서)
export default async function LoginPage() {
  return <LoginView live={await isLive().catch(() => false)} />;
}
