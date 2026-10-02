"use client";
// 지도 영역: 내 위치 점 + 음식점 번호 핀. 제공자(카카오/네이버)는 lib/client/map-provider.ts 가 감춘다.
import { useEffect, useRef, useState } from "react";
import { createMap, type MapHandle, type MapProvider } from "@/lib/client/map-provider";

type Pin = { id: string; lat: number; lng: number };

export function TasteMap(p: { provider: MapProvider; mapKey: string; center: { lat: number; lng: number }; me: { lat: number; lng: number } | null; pins: Pin[]; selected: string | null; onPick: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState("");
  const pick = useRef(p.onPick);
  useEffect(() => {
    pick.current = p.onPick;
  }, [p.onPick]);

  // 지도는 한 번만 만든다 (제공자·키가 바뀔 때만 다시)
  useEffect(() => {
    let alive = true;
    // 지도마다 자기 그릇을 따로 준다 — 개발 모드(StrictMode)의 마운트→해제→마운트에서
    // 늦게 끝난 첫 지도의 destroy() 가 같은 그릇에 그려진 두 번째 지도까지 지워 버리던 문제
    const mount = document.createElement("div");
    mount.style.cssText = "position:absolute;inset:0";
    box.current!.appendChild(mount);
    createMap(p.provider, p.mapKey, mount, p.center)
      .then((h) => {
        if (!alive) return h.destroy();
        handle.current = h;
        setState("ready");
      })
      .catch((e: Error) => alive && (setState("error"), setMsg(e.message)));
    return () => {
      alive = false;
      handle.current?.destroy();
      handle.current = null;
      mount.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 중심 이동은 아래 effect 가 맡는다
  }, [p.provider, p.mapKey]);

  // 결과(핀)·기준 위치가 바뀔 때만 기준점과 핀이 다 보이게 맞춘다 — 핀 선택만 바뀔 때는 사용자가 옮긴 화면을 건드리지 않는다
  useEffect(() => {
    if (state === "ready") handle.current?.fit([p.me ?? p.center, ...p.pins]);
  }, [state, p.center, p.me, p.pins]);
  useEffect(() => {
    if (state === "ready") handle.current?.setMe(p.me);
  }, [state, p.me]);
  useEffect(() => {
    if (state !== "ready") return;
    handle.current?.setPins(
      p.pins.map((x, i) => ({ ...x, label: String(i + 1), selected: x.id === p.selected })),
      (id) => pick.current(id),
    );
  }, [state, p.pins, p.selected]);

  return (
    <div className="relative h-64 overflow-hidden rounded-3xl border border-line bg-sunken">
      <div ref={box} className="absolute inset-0" />
      {state !== "ready" && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted">{state === "loading" ? "지도를 불러오는 중…" : `지도를 띄우지 못했어요. ${msg}`}</p>
      )}
    </div>
  );
}
