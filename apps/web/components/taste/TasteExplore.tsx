"use client";
// 세계 지도 아래 '맛집탐방': 내 위치 지도 → (음식을 고르면) 근처 음식점 핀·목록 → 분류별 음식 목록.
// 지금은 한국 안 음식점만 찾는다. 위치는 주변 검색에만 쓰고 저장하지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapProvider } from "@/lib/client/map-provider";
import { DEFAULT_CENTER, inKorea } from "@/lib/places/geo";
import type { PlacesSetup } from "@/lib/places/server";
import type { NearbyResponse } from "@/lib/places/types";
import { Icon } from "../icons";
import { btn, chip } from "../ui";
import { PlaceCard } from "./PlaceCard";
import { TasteMap } from "./TasteMap";

export type FoodCat = "korean" | "chinese" | "japanese" | "western" | "veg" | "halal" | "other";
export type ExploreFood = { slug: string; name_ko: string; name_en: string; flag: string; image_url: string | null; cats: FoodCat[] };

const CATS: [FoodCat | "all", string][] = [
  ["all", "전체"],
  ["korean", "한식"],
  ["chinese", "중식"],
  ["japanese", "일식"],
  ["western", "양식"],
  ["veg", "채식"],
  ["halal", "할랄"],
  ["other", "기타"],
];
const RADIUS = 3000;
const SHOW = 24;

type Loc = { lat: number; lng: number; kind: "default" | "gps" };

export function TasteExplore({ foods, setup, mapKey, lockedName }: { foods: ExploreFood[]; setup: PlacesSetup; mapKey: string | null; lockedName: string | null }) {
  const [loc, setLoc] = useState<Loc>({ lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, kind: "default" });
  const [gps, setGps] = useState<"idle" | "asking" | "denied" | "outside" | "failed">("idle");
  const [cat, setCat] = useState<FoodCat | "all">("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<ExploreFood | null>(null);
  const [data, setData] = useState<NearbyResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return setGps("failed");
    setGps("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!inKorea(p)) return setGps("outside");
        setGps("idle");
        setLoc({ ...p, kind: "gps" });
      },
      (err) => setGps(err.code === 1 ? "denied" : "failed"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  // 처음 열면 내 위치부터 잡는다 (거절하면 서울시청 기준)
  useEffect(() => {
    locate();
  }, [locate]);

  useEffect(() => {
    if (!picked) return;
    const ctl = new AbortController();
    const qs = new URLSearchParams({ food: picked.slug, sort: "distance", radius: String(RADIUS) });
    if (loc.kind === "gps") {
      qs.set("lat", String(loc.lat));
      qs.set("lng", String(loc.lng));
    }
    setStatus("loading");
    fetch(`/api/places/nearby?${qs}`, { signal: ctl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 429 ? "너무 자주 찾았어요. 잠시 뒤에 다시 해주세요." : (body?.error?.message ?? "음식점을 찾지 못했어요."));
        setData(body as NearbyResponse);
        setSelected(null);
        setStatus("ok");
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e.message);
        setStatus("error");
      });
    return () => ctl.abort();
  }, [picked, loc]);

  const pick = (f: ExploreFood) => {
    setPicked((cur) => (cur?.slug === f.slug ? cur : f));
    mapBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () => foods.filter((f) => (cat === "all" || f.cats.includes(cat)) && (!needle || f.name_ko.toLowerCase().includes(needle) || f.name_en.toLowerCase().includes(needle))),
    [foods, cat, needle],
  );
  const places = useMemo(() => (picked && data ? data.places : []), [picked, data]);
  const pins = useMemo(() => places.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })), [places]);
  const center = useMemo(() => ({ lat: loc.lat, lng: loc.lng }), [loc]);
  const me = useMemo(() => (loc.kind === "gps" ? center : null), [loc.kind, center]);
  const example = Boolean(data?.example);
  const showMap = Boolean(mapKey && setup.mapKey);
  const fromLabel = loc.kind === "gps" ? null : DEFAULT_CENTER.label;

  return (
    <section aria-labelledby="taste-explore-h" className="space-y-4 border-t border-line pt-6">
      <div className="space-y-1">
        <h2 id="taste-explore-h" className="flex items-center gap-2 text-h2 font-bold text-ink">
          <Icon name="pin" className="size-5 text-leaf" />
          맛집탐방
        </h2>
        <p className="text-caption text-muted">음식을 누르면 내 근처에서 그 음식을 파는 곳을 지도에 찍어 드려요. 지금은 대한민국에서만 찾을 수 있어요.</p>
      </div>

      {lockedName && (
        <p className="flex items-start gap-2 rounded-2xl bg-sunken px-3.5 py-3 text-caption text-ink-soft">
          <Icon name="key" className="mt-px size-4 shrink-0 text-muted" />
          {lockedName}는 아직 잠겨 있어요. 지금은 대한민국 안의 음식점만 찾을 수 있어요.
        </p>
      )}

      <div ref={mapBox} className="scroll-mt-4 space-y-2">
        {showMap ? (
          <TasteMap
            provider={setup.mapProvider as MapProvider}
            mapKey={mapKey!}
            center={center}
            me={me}
            pins={pins}
            selected={selected}
            onPick={(id) => (setSelected(id), document.getElementById(`place-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }))}
          />
        ) : (
          <p className="card rounded-3xl p-4 text-sm text-ink-soft">지도 키(NEXT_PUBLIC_KAKAO_MAP_JS_KEY)가 없어 지도를 띄울 수 없어요. 목록으로 보여드릴게요.</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-caption text-ink-soft">
          <button type="button" onClick={locate} disabled={gps === "asking"} className={btn("outline", "sm")}>
            <Icon name="locate" className="size-4 text-leaf" />
            {gps === "asking" ? "위치 확인 중…" : "내 위치"}
          </button>
          <span>
            {loc.kind === "gps" ? "내 위치 기준" : "서울시청 기준"} · 반경 3km
            {gps === "denied" && " · 위치 권한이 없어요"}
            {gps === "outside" && " · 지금 위치가 한국 밖이에요"}
            {gps === "failed" && " · 위치를 잡지 못했어요"}
          </span>
        </div>
      </div>

      {picked && (
        <div className="space-y-3" aria-busy={status === "loading"}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-title font-bold text-ink">
              {picked.flag} {picked.name_ko} 파는 곳{status === "ok" ? ` ${places.length}곳` : ""}
            </h3>
            <button type="button" onClick={() => (setPicked(null), setData(null), setStatus("idle"))} className="text-caption text-muted hover:text-ink">
              닫기
            </button>
          </div>
          {status === "loading" && <p className="py-4 text-center text-sm text-muted">근처 음식점을 찾는 중…</p>}
          {status === "error" && <p className="rounded-2xl bg-diet-no/10 px-3.5 py-3 text-sm text-diet-no">{error}</p>}
          {status === "ok" && data && (
            <>
              {example && <p className="rounded-2xl border-2 border-dashed border-diet-warn px-3.5 py-2 text-caption font-semibold text-diet-warn-ink">예시 데이터 — 실제 음식점이 아니에요.</p>}
              {places.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {places.map((p, i) => (
                    <PlaceCard key={p.id} place={p} index={i} foodName={picked.name_ko} foodSlug={picked.slug} countryName={data.food.country_name} fromLabel={fromLabel} example={example} selected={selected === p.id} onSelect={() => setSelected(p.id)} />
                  ))}
                </div>
              ) : (
                <p className="card rounded-2xl p-4 text-center text-sm text-ink-soft">반경 3km 안에서 {picked.name_ko} 파는 곳을 찾지 못했어요.</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="음식 분류">
          {CATS.map(([k, name]) => (
            <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} className={`${chip(cat === k)} shrink-0`}>
              {name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-sunken px-3.5">
          <Icon name="search" className="size-4 shrink-0 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={40}
            placeholder="음식 이름으로 찾기 (예: 떡볶이, 짜장면, 스시)"
            aria-label="음식 검색"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        {list.length === 0 ? (
          <p className="card rounded-2xl p-4 text-center text-sm text-muted">맞는 음식이 없어요.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {list.slice(0, SHOW).map((f) => {
              const on = picked?.slug === f.slug;
              return (
                <li key={f.slug}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(f)}
                    className={`flex h-full w-full items-center gap-3 rounded-2xl border bg-surface p-2.5 text-left transition hover:border-brand active:scale-[0.98] ${on ? "border-brand ring-2 ring-brand" : "border-line"}`}
                  >
                    <span className="size-12 shrink-0 rounded-xl border border-line bg-sunken bg-cover bg-center" style={f.image_url ? { backgroundImage: `url(${JSON.stringify(f.image_url)})` } : undefined} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{f.name_ko}</span>
                      <span className="block truncate text-caption text-muted">
                        {f.flag} {f.name_en}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > SHOW && <p className="text-caption text-muted">{list.length - SHOW}개 더 있어요. 검색으로 좁혀 보세요.</p>}
      </div>
    </section>
  );
}
