import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** service_role 클라이언트: RLS 우회. 서버 라우트에서 권한 확인 후에만 쓴다 (11 문서 §7). */
let admin: SupabaseClient | undefined;
export function supabaseAdmin(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다 (apps/web/.env.local)");
  return (admin ??= createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } }));
}

/** 공개 콘텐츠 읽기용 anon 클라이언트: RLS 가 verified=true 만 보여준다. */
let anon: SupabaseClient | undefined;
export function supabasePublic(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다");
  return (anon ??= createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } }));
}

/** 요청 사용자 쿠키 기반 클라이언트 (anon 키 + RLS). 로그인 사용자 확인용. */
export async function supabaseForRequest(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Route Handler 밖(서버 컴포넌트)에서는 쿠키 쓰기 불가 — 미들웨어가 세션을 갱신한다
        }
      },
    },
  });
}

/** 게스트 허용 엔드포인트용: 로그인 안 했으면 null */
export async function currentUserId(): Promise<string | null> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const { data } = await (await supabaseForRequest()).auth.getUser();
  return data.user?.id ?? null;
}
