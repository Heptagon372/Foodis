"use client";
// 서비스 워커는 프로덕션 빌드에서만 등록한다. 개발 서버(next dev)는 파일이 계속 바뀌어 캐시가 오히려 방해가 된다.
import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
