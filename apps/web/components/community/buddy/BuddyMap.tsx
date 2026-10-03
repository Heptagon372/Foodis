"use client";
// 푸랜드 지도: 나(파란 점) + 켜 둔 사람들(점). 점을 누르면 onPick.
// 지도 키(카카오/네이버)가 있으면 실제 지도, 없으면 '레이더'(나를 가운데 두고 거리·방향만) — 미리보기에서도 흐름이 보이게.
// 위치가 바뀌어도 사용자가 옮긴 지도 화면은 건드리지 않는다 (처음 한 번 + '내 위치로' 버튼만 맞춘다)
import { useEffect, useMemo, useRef, useState } from "react";
import { CUISINE_LABEL, type BuddyView } from "@/lib/buddy/types";
import { createMap, type MapHandle, type MapProvider } from "@/lib/client/map-provider";
import { formatDistance } from "@/lib/places/geo";
import { Icon } from "../../icons";

type Me = { lat: number; lng: number };
type Props = { provider: MapProvider; mapKey: string | null; me: Me; buddies: BuddyView[]; selected: string | null; onPick: (id: string) => void };

/** 점 안 글자: 원하는 음식 첫 번째의 첫 글자 (한·중·일·채) */
export const pinLetter = (b: Pick<BuddyView, "cuisines">) => CUISINE_LABEL[b.cuisines[0]]?.[0] ?? "밥";

export function BuddyMap(p: Props) {
  return p.mapKey ? <RealMap {...p} mapKey={p.mapKey} /> : <Radar {...p} />;
}

function RealMap(p: Props & { mapKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState("");
  const pick = useRef(p.onPick);
  const fitted = useRef(false);
  useEffect(() => {
    pick.current = p.onPick;
  }, [p.onPick]);

  useEffect(() => {
    let alive = true;
    const mount = document.createElement("div");
    mount.style.cssText = "position:absolute;inset:0";
    box.current!.appendChild(mount);
    createMap(p.provider, p.mapKey, mount, p.me)
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
      fitted.current = false;
      mount.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 지도는 제공자·키가 바뀔 때만 다시 만든다
  }, [p.provider, p.mapKey]);

  useEffect(() => {
    if (state !== "ready") return;
    handle.current?.setMe(p.me);
    if (!fitted.current) {
      fitted.current = true;
      handle.current?.fit([p.me, ...p.buddies]);
    }
  }, [state, p.me, p.buddies]);
  useEffect(() => {
    if (state !== "ready") return;
    handle.current?.setPins(
      p.buddies.map((b) => ({ id: b.id, lat: b.lat, lng: b.lng, label: pinLetter(b), selected: b.id === p.selected })),
      (id) => pick.current(id),
    );
  }, [state, p.buddies, p.selected]);

  return (
    <div className="relative h-80 overflow-hidden rounded-3xl border border-line bg-sunken lg:h-[26rem]">
      <div ref={box} className="absolute inset-0" />
      {state !== "ready" && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted">{state === "loading" ? "지도를 불러오는 중…" : `지도를 띄우지 못했어요. ${msg}`}</p>
      )}
      {state === "ready" && (
        <button
          type="button"
          onClick={() => handle.current?.setCenter(p.me)}
          className="absolute right-3 bottom-3 z-10 grid size-10 place-items-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line"
          aria-label="내 위치로"
        >
          <Icon name="locate" className="size-5" />
        </button>
      )}
    </div>
  );
}

// ── 레이더: 나를 가운데, 가장 먼 사람이 들어가는 반경까지 링을 그린다
const RINGS = [500, 1000, 2000, 5000, 10_000];
const SIZE = 320;
const R = SIZE / 2 - 18;

function offsetM(me: Me, p: Me) {
  return { x: (p.lng - me.lng) * 111_320 * Math.cos((me.lat * Math.PI) / 180), y: (p.lat - me.lat) * 111_320 };
}

function Radar({ me, buddies, selected, onPick }: Props) {
  const pts = useMemo(() => buddies.map((b) => ({ b, ...offsetM(me, b) })), [me, buddies]);
  const far = Math.max(0, ...pts.map((q) => Math.hypot(q.x, q.y)));
  const outer = RINGS.find((r) => r >= far * 1.1) ?? RINGS.at(-1)!;
  const scale = R / outer;
  const rings = [outer / 2, outer];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-sunken">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block h-80 w-full max-w-md lg:h-[26rem]" role="group" aria-label="내 주변 푸랜드 레이더">
        <g transform={`translate(${SIZE / 2} ${SIZE / 2})`}>
          {rings.map((r) => (
            <g key={r}>
              <circle r={r * scale} className="fill-none stroke-line" strokeWidth={1.5} strokeDasharray={r === outer ? undefined : "4 4"} />
              <text y={-r * scale - 4} textAnchor="middle" className="fill-muted text-[10px]">
                {formatDistance(r)}
              </text>
            </g>
          ))}
          <line x1={-R} x2={R} className="stroke-line" />
          <line y1={-R} y2={R} className="stroke-line" />
          <text y={-R - 4} x={R - 4} textAnchor="end" className="fill-muted text-[10px] font-semibold">
            N
          </text>
          {/* 나 */}
          <circle r={14} className="fill-[#2f80ed]/20 motion-safe:animate-pulse" />
          <circle r={6} fill="#2f80ed" stroke="#fff" strokeWidth={2.5} />
          {pts.map(({ b, x, y }) => {
            const on = b.id === selected;
            return (
              <g
                key={b.id}
                role="button"
                tabIndex={0}
                aria-label={`${b.name} · ${b.distance_m != null ? formatDistance(b.distance_m) : ""}`}
                aria-pressed={on}
                onClick={() => onPick(b.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(b.id))}
                style={{ transform: `translate(${x * scale}px, ${-y * scale}px)`, transition: "transform 1.2s ease" }}
                className="cursor-pointer outline-none"
              >
                <circle r={on ? 17 : 14} className={on ? "fill-diet-no" : "fill-brand"} stroke="#fff" strokeWidth={2.5} />
                <text y={4.5} textAnchor="middle" className="pointer-events-none fill-white text-[12px] font-bold">
                  {pinLetter(b)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <p className="absolute bottom-2 left-3 text-[11px] text-muted">지도 키가 없어 거리·방향만 보여 줘요</p>
    </div>
  );
}
