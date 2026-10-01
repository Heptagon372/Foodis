"use client";
// 브라우저용 Supabase 클라이언트 (anon 키 + 세션 쿠키). 어드민 로그인에만 쓴다.
import { createBrowserClient } from "@supabase/ssr";

export const supabaseBrowser = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
