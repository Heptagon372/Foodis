"use client";
// 로그인 세션을 지켜보고 Passport 를 계정과 맞춘다 (lib/client/account.ts). 화면에는 아무것도 그리지 않는다.
import { useEffect } from "react";
import { startAccount } from "@/lib/client/account";

export function AccountSync() {
  useEffect(() => startAccount(), []);
  return null;
}
