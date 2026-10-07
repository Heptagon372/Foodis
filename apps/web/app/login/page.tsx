import { LoginView } from "@/components/LoginView";
import { instagramConfigured } from "@/lib/auth/instagram";
import { isLive } from "@/lib/content";
import { env } from "@/lib/env";

export const metadata = { title: "로그인 — FOODIS" };
export const dynamic = "force-dynamic";

// 사용자 로그인 (F-AUTH-01). 선택 사항 — 둘러보기·푸디·Passport 는 로그인 없이 된다 (07 문서)
// 인스타그램 버튼은 서버에 앱 ID·시크릿이 있을 때만 — 켜졌는지(true/false)만 넘기고 값은 넘기지 않는다
export default async function LoginPage() {
  return <LoginView live={await isLive().catch(() => false)} instagram={instagramConfigured(env)} />;
}
