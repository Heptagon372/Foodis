"use client";
// 목소리 목록(+ 서버 키 준비 여부) — /api/foodi/voices 를 한 번만 받아 같이 쓴다 (설정 화면 · 라디오 진행자 이름).
import { useEffect, useState } from "react";
import type { VoicesResponse } from "@/lib/voice/catalog";

let pending: Promise<VoicesResponse | null> | null = null;

export function loadVoices(): Promise<VoicesResponse | null> {
  pending ??= fetch("/api/foodi/voices")
    .then((r) => (r.ok ? (r.json() as Promise<VoicesResponse>) : null))
    .catch(() => null)
    .then((v) => {
      if (!v) pending = null; // 실패는 기억하지 않는다 — 다음에 다시
      return v;
    });
  return pending;
}

/** undefined = 받는 중, null = 못 받음 */
export function useVoices(): VoicesResponse | null | undefined {
  const [v, setV] = useState<VoicesResponse | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadVoices().then((x) => alive && setV(x));
    return () => {
      alive = false;
    };
  }, []);
  return v;
}
