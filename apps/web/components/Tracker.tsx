"use client";
// 화면 이동마다 KPI 세션을 이어 둔다 (lib/client/track.ts). 새 세션이면 session_start 1건 — 활성 사용자 · D7 계산용
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { keepAlive } from "@/lib/client/track";

export function Tracker() {
  const path = usePathname();
  useEffect(() => keepAlive(), [path]);
  return null;
}
