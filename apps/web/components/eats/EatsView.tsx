"use client";
// 맛집탐방 (/eats): 음식 고르기 → 나이트 HUD 지도에서 반경(3~10km) 원 안의 음식점 → 핀을 누르면 왼쪽 리퀴드 글라스 패널 + 그 가게로 확대.
// 기준 위치: '내 근처'(GPS, 거절 시 서울시청) 또는 '다른 곳에서 보기'(대한민국 지도에서 아무 곳이나 눌러 정함).
// 위치는 주변 검색에만 쓰고 저장하지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMap, type MapHandle, type MapProvider } from "@/lib/client/map-provider";
import { FOOD_CATS, type ExploreFood, type FoodCat } from "@/lib/places/food-cats";
import { boundsAround, DEFAULT_CENTER, formatDistance, formatEta, inKorea, type LatLng } from "@/lib/places/geo";
import type { PlacesSetup } from "@/lib/places/server";
import type { NearbyResponse, RankedPlace } from "@/lib/places/types";
import { Icon } from "../icons";
import { PlaceCard } from "../taste/PlaceCard";
import { TopBar } from "../TopBar";
import { Eyebrow } from "../ui";

type Mode = "near" | "pick";
type Sort = "best" | "distance" | "reviews" | "rating";
type Stat = { rating: number | null; count: number };

const SORTS: [Sort, string][] = [
  ["best", "추천순"],
  ["reviews", "리뷰 많은 순"],
  ["rating", "별점 높은 순"],
  ["distance", "가까운 순"],
];
const PANEL_W = 380;
const MATCH_W = { confirmed: 1, dish: 0.6, cuisine: 0 } as const;

const coord = (p: LatLng) => `${Math.abs(p.lat).toFixed(4)}°${p.lat >= 0 ? "N" : "S"} ${Math.abs(p.lng).toFixed(4)}°${p.lng >= 0 ? "E" : "W"}`;

/** 추천순: 메뉴 근거(이름으로 찾음 > 나라 음식점) + 카카오 별점(리뷰 수로 보정) − 거리 */
function recommendScore(p: RankedPlace, s: Stat | undefined, radiusM: number) {
  const count = s?.count ?? 0;
  const bayes = ((s?.rating ?? 0) * count + 3.8 * 5) / (count + 5);
  return MATCH_W[p.match] + (bayes / 5) * 1.2 - (p.distance / radiusM) * 0.6;
}

export function EatsView({ foods, setup, mapKey }: { foods: ExploreFood[]; setup: PlacesSetup; mapKey: string | null }) {
  // ── 음식 고르기
  const [cat, setCat] = useState<FoodCat | "all">("all");
  const [q, setQ] = useState("");
  const [food, setFood] = useState<ExploreFood | null>(null);
  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () => foods.filter((f) => (cat === "all" || f.cats.includes(cat)) && (!needle || f.name_ko.toLowerCase().includes(needle) || f.name_en.toLowerCase().includes(needle))),
    [foods, cat, needle],
  );

  // ── 기준 위치·반경
  const [mode, setMode] = useState<Mode>("near");
  const [gps, setGps] = useState<{ state: "idle" | "asking" | "ok" | "denied" | "outside" | "failed"; p: LatLng | null }>({ state: "idle", p: null });
  const [picked, setPicked] = useState<LatLng | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [radiusM, setRadiusM] = useState(5000);
  const anchor: LatLng | null = mode === "near" ? (gps.p ?? DEFAULT_CENTER) : picked;
  const anchorKey = anchor ? `${anchor.lat},${anchor.lng}` : "";

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return setGps({ state: "failed", p: null });
    setGps((g) => ({ ...g, state: "asking" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGps(inKorea(p) ? { state: "ok", p } : { state: "outside", p: null });
      },
      (err) => setGps({ state: err.code === 1 ? "denied" : "failed", p: null }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);
  useEffect(() => {
    locate();
  }, [locate]);

  // 반경 슬라이더: 원은 끄는 대로, 검색은 멈춘 뒤에
  useEffect(() => {
    const t = setTimeout(() => setRadiusM(radiusKm * 1000), 350);
    return () => clearTimeout(t);
  }, [radiusKm]);

  // ── 검색
  const [data, setData] = useState<NearbyResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("best");
  const [stats, setStats] = useState<Record<string, Stat>>({});

  useEffect(() => {
    if (!food || !anchorKey) return;
    const [lat, lng] = anchorKey.split(",");
    const ctl = new AbortController();
    setStatus("loading");
    setSelected(null);
    fetch(`/api/places/nearby?${new URLSearchParams({ food: food.slug, sort: "distance", radius: String(radiusM), lat, lng })}`, { signal: ctl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 429 ? "너무 자주 찾았어요. 잠시 뒤에 다시 해주세요." : (body?.error?.message ?? "음식점을 찾지 못했어요."));
        setData(body as NearbyResponse);
        setStatus("ok");
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e.message);
        setStatus("error");
      });
    return () => ctl.abort();
  }, [food, anchorKey, radiusM]);

  // 정렬용 카카오 별점·리뷰 수 (라우트가 10분 캐시 + 브라우저 캐시)
  useEffect(() => {
    if (!data || data.example) return;
    let alive = true;
    for (const p of data.places)
      fetch(`/api/places/${p.id}/kakao-reviews`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setStats((s) => ({ ...s, [p.id]: { rating: d.rating ?? null, count: d.reviewCount ?? 0 } })))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [data]);

  const places = useMemo(() => {
    const list = status === "ok" && data ? [...data.places] : [];
    const st = (p: RankedPlace) => stats[p.id];
    if (sort === "distance") list.sort((a, b) => a.distance - b.distance);
    else if (sort === "reviews") list.sort((a, b) => (st(b)?.count ?? 0) - (st(a)?.count ?? 0) || a.distance - b.distance);
    else if (sort === "rating") list.sort((a, b) => (st(b)?.rating ?? 0) - (st(a)?.rating ?? 0) || (st(b)?.count ?? 0) - (st(a)?.count ?? 0));
    else list.sort((a, b) => recommendScore(b, st(b), radiusM) - recommendScore(a, st(a), radiusM));
    return list;
  }, [status, data, stats, sort, radiusM]);
  const sel = places.find((p) => p.id === selected) ?? null;
  const selIndex = sel ? places.indexOf(sel) : -1;

  // ── 지도
  const showMap = Boolean(mapKey && setup.mapKey);
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");
  const [mapMsg, setMapMsg] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!showMap) return;
    let alive = true;
    const mount = document.createElement("div");
    mount.style.cssText = "position:absolute;inset:0";
    box.current!.appendChild(mount);
    createMap(setup.mapProvider as MapProvider, mapKey!, mount, DEFAULT_CENTER)
      .then((h) => {
        if (!alive) return h.destroy();
        handle.current = h;
        setMapState("ready");
      })
      .catch((e: Error) => alive && (setMapState("error"), setMapMsg(e.message)));
    return () => {
      alive = false;
      handle.current?.destroy();
      handle.current = null;
      mount.remove();
    };
  }, [showMap, setup.mapProvider, mapKey]);

  const ready = mapState === "ready";
  const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
  const inset = useCallback((panel: boolean) => {
    const h = stage.current?.clientHeight ?? 600;
    if (wide()) return { left: panel ? PANEL_W + 16 : 0, bottom: 150 };
    return { bottom: panel ? Math.round(h * 0.58) : 150 };
  }, []);

  useEffect(() => {
    if (ready) handle.current?.setMe(gps.p);
  }, [ready, gps.p]);
  useEffect(() => {
    if (ready) handle.current?.setCircle(anchor, radiusKm * 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchor 는 anchorKey 로 본다
  }, [ready, anchorKey, radiusKm]);
  // 기준 위치·반경이 바뀌면 원이 다 보이게. '다른 곳'인데 아직 안 골랐으면 대한민국 전체
  useEffect(() => {
    if (!ready) return;
    if (!anchor) return handle.current?.showKorea();
    const b = boundsAround(anchor, radiusM);
    handle.current?.fit([{ lat: b.minLat, lng: b.minLng }, { lat: b.maxLat, lng: b.maxLng }], food ? inset(false) : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchor 는 anchorKey 로 본다
  }, [ready, anchorKey, radiusM, mode]);
  useEffect(() => {
    if (!ready) return;
    handle.current?.setPins(
      places.map((p, i) => ({ id: p.id, lat: p.lat, lng: p.lng, label: String(i + 1), selected: p.id === selected })),
      (id) => setSelected(id),
    );
  }, [ready, places, selected]);
  // 핀을 고르면 그 가게로 확대 — 패널이 가린 칸을 피해서
  useEffect(() => {
    if (ready && sel) handle.current?.focus(sel, inset(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 고른 가게가 바뀔 때만
  }, [ready, sel?.id]);
  useEffect(() => {
    if (!ready) return;
    handle.current?.onClick(
      mode === "pick"
        ? (p) => {
            if (!inKorea(p)) return setToast("대한민국 안을 눌러 주세요");
            setPicked(p);
            setSelected(null);
          }
        : null,
    );
  }, [ready, mode]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const chooseFood = (f: ExploreFood) => {
    setFood(f);
    setData(null);
    setStats({});
    stage.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setSelected(null);
    setData(null);
    setStatus("idle");
    if (m === "near" && gps.state !== "ok") locate();
  };

  const fromLabel = mode === "near" ? (gps.p ? null : DEFAULT_CENTER.label) : "고른 위치";
  const example = Boolean(data?.example);
  const pct = ((radiusKm - 3) / 7) * 100;

  return (
    <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 lg:pt-8 lg:pb-10">
      <TopBar />

      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <Eyebrow>Taste Radar</Eyebrow>
          <h1 className="flex items-center gap-2.5 text-h1 font-bold text-ink">
            <span className="grid size-10 place-items-center rounded-2xl bg-[#071210] text-[#5ef2c0] shadow-[0_0_24px_-4px_#5ef2c0]">
              <Icon name="map-pinned" className="size-5" />
            </span>
            맛집탐방
          </h1>
          <p className="text-caption text-muted">먹고 싶은 음식을 고르면, 고른 반경 안에서 그 음식을 파는 곳을 지도에 띄워 드려요.</p>
        </div>
      </header>

      {/* 음식 고르기: 검색 + 분류 + 음식 줄 */}
      <section className="glass space-y-3 rounded-[28px] p-3.5" aria-label="음식 고르기">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (matches[0]) chooseFood(matches[0]);
          }}
          className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-brand"
        >
          <Icon name="search" className="size-5 shrink-0 text-leaf" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={40}
            placeholder="어떤 음식이 먹고 싶어요? (예: 떡볶이, 짜장면, 스시, 팔라펠)"
            aria-label="음식 검색"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">Enter</kbd>
        </form>
        <div className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 [scrollbar-width:none]" role="group" aria-label="음식 분류">
          {FOOD_CATS.map(([k, name]) => (
            <button
              key={k}
              type="button"
              aria-pressed={cat === k}
              onClick={() => setCat(k)}
              className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition ${cat === k ? "bg-[#071210] text-[#5ef2c0] shadow-[0_0_0_1px_#5ef2c0,0_0_18px_-6px_#5ef2c0]" : "border border-line bg-surface text-ink-soft hover:text-ink"}`}
            >
              {name}
            </button>
          ))}
        </div>
        {matches.length ? (
          <ul className="snap-row -mx-3.5 px-3.5 pb-1" aria-label="음식">
            {matches.slice(0, 40).map((f) => {
              const on = food?.slug === f.slug;
              return (
                <li key={f.slug}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => chooseFood(f)}
                    className={`group flex w-36 flex-col overflow-hidden rounded-2xl border text-left transition active:scale-[0.97] ${on ? "border-transparent shadow-[0_0_0_2px_#5ef2c0,0_10px_30px_-10px_#5ef2c0]" : "border-line hover:border-brand"}`}
                  >
                    <span className="relative block h-20 bg-sunken bg-cover bg-center" style={f.image_url ? { backgroundImage: `url(${JSON.stringify(f.image_url)})` } : undefined}>
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-black/45 px-1.5 text-sm backdrop-blur">{f.flag}</span>
                    </span>
                    <span className="block bg-surface px-2.5 py-2">
                      <span className="block truncate text-sm font-semibold text-ink">{f.name_ko}</span>
                      <span className="block truncate text-[11px] text-muted">{f.name_en}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-1 py-3 text-sm text-muted">맞는 음식이 없어요. 다른 이름이나 분류로 찾아보세요.</p>
        )}
      </section>

      {/* 지도 무대 */}
      <div className="rounded-[34px] bg-gradient-to-br from-[#5ef2c0]/70 via-white/10 to-[#c8f06a]/50 p-px shadow-[0_30px_80px_-30px_rgb(6_40_30/0.8)]">
        <div ref={stage} className="hud relative h-[78dvh] min-h-[560px] scroll-mt-4 overflow-hidden rounded-[33px] lg:h-[calc(100dvh-7rem)] lg:min-h-[640px]">
          {showMap ? (
            <div ref={box} className={`eats-map absolute inset-0 isolate z-0 ${mode === "pick" ? "[&_*]:cursor-crosshair" : ""}`} />
          ) : (
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted">지도 키(NEXT_PUBLIC_KAKAO_MAP_JS_KEY)가 없어 지도를 띄울 수 없어요.</p>
          )}
          <div className="hud-grid absolute inset-0" aria-hidden />
          {showMap && mapState !== "ready" && (
            <p className="absolute inset-0 grid place-items-center px-6 text-center font-mono text-sm text-muted">{mapState === "loading" ? "INITIALIZING MAP…" : `지도를 띄우지 못했어요. ${mapMsg}`}</p>
          )}

          {/* 위: 기준 위치 · 반경 */}
          <div className={`absolute left-3 right-3 top-3 flex flex-wrap items-start gap-2 transition-[padding] md:right-auto ${sel ? "md:pl-[396px]" : ""}`}>
            <div className="liquid flex items-center gap-1 rounded-full p-1" role="tablist" aria-label="기준 위치">
              {(
                [
                  ["near", "locate", "내 근처"],
                  ["pick", "map", "다른 곳에서 보기"],
                ] as const
              ).map(([m, icon, label]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition ${mode === m ? "bg-[#5ef2c0] text-[#04201a] shadow-[0_0_18px_-4px_#5ef2c0]" : "text-ink-soft hover:text-ink"}`}
                >
                  <Icon name={icon} className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <label className="liquid flex h-11 items-center gap-3 rounded-full px-4">
              <span className="font-mono text-[11px] tracking-widest text-muted">RADIUS</span>
              <input
                type="range"
                min={3}
                max={10}
                step={1}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                aria-label="검색 반경 (km)"
                className="hud-range w-28 sm:w-36"
                style={{ ["--p" as string]: `${pct}%` }}
              />
              <span className="w-12 text-right font-mono text-sm font-bold tabular-nums text-[#5ef2c0]">{radiusKm}km</span>
            </label>
          </div>

          {/* 오른쪽 위: 좌표 판독 */}
          <div className="liquid absolute right-3 top-3 hidden rounded-2xl px-3.5 py-2 text-right font-mono text-[11px] leading-relaxed text-ink-soft lg:block" aria-live="polite">
            <p className="flex items-center justify-end gap-1.5 text-[#5ef2c0]">
              <span className={`size-1.5 rounded-full bg-[#5ef2c0] ${status === "loading" ? "animate-pulse" : ""}`} />
              {status === "loading" ? "SCANNING" : status === "ok" ? `${places.length} TARGETS` : "STANDBY"}
            </p>
            <p>{anchor ? coord(anchor) : "— 위치를 고르세요 —"}</p>
            <p className="text-muted">{mode === "near" ? (gps.p ? "GPS · 내 위치" : "기본 · 서울시청") : "수동 · 고른 위치"}</p>
          </div>

          {/* 찾는 중: 레이더 */}
          {status === "loading" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
              <div className="radar size-[min(60vh,60vw)] max-h-[520px] max-w-[520px]" />
            </div>
          )}

          {/* 안내 */}
          {mode === "pick" && !picked && ready && (
            <p className="liquid hud-up pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-5 py-3.5 text-center text-sm font-semibold">
              <Icon name="pin" className="mx-auto mb-1 size-5 text-[#5ef2c0]" />
              대한민국 지도에서 찾고 싶은 곳을 눌러 주세요
            </p>
          )}
          {mode === "near" && (gps.state === "denied" || gps.state === "outside" || gps.state === "failed") && (
            <p className="liquid absolute left-3 top-[4.25rem] rounded-full px-3.5 py-1.5 text-caption text-diet-warn-ink">
              {gps.state === "denied" ? "위치 권한이 없어 서울시청 기준이에요" : gps.state === "outside" ? "지금 위치가 한국 밖이라 서울시청 기준이에요" : "위치를 잡지 못해 서울시청 기준이에요"}
            </p>
          )}
          {toast && <p className="liquid hud-up absolute left-1/2 top-20 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold text-diet-warn-ink">{toast}</p>}

          {/* 왼쪽: 고른 가게 (리퀴드 글라스) — 좁은 화면은 아래 시트 */}
          {sel && food && data && (
            <aside
              key={sel.id}
              aria-label={`${sel.name} 정보`}
              className="liquid hud-in absolute inset-x-2 bottom-2 z-10 flex max-h-[58%] flex-col overflow-hidden rounded-[28px] md:inset-x-auto md:bottom-3 md:left-3 md:top-3 md:max-h-none md:w-[380px]"
            >
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <span className="grid size-7 place-items-center rounded-full bg-[#5ef2c0] font-mono text-sm font-extrabold text-[#04201a] shadow-[0_0_14px_-2px_#5ef2c0]">{selIndex + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-wider text-muted">{coord(sel)}</span>
                <button type="button" onClick={() => setSelected(null)} aria-label="닫기" className="grid size-8 place-items-center rounded-full text-ink-soft transition hover:bg-white/10 hover:text-ink">
                  <Icon name="close" className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin]">
                <PlaceCard bare initialOpen="menu" place={sel} index={selIndex} foodName={food.name_ko} foodSlug={food.slug} countryName={data.food.country_name} fromLabel={fromLabel} example={example} selected onSelect={() => {}} />
              </div>
            </aside>
          )}

          {/* 아래: 결과 카드 줄 + 정렬 */}
          {food && (
            <div className={`absolute bottom-3 left-3 right-3 space-y-2 transition-[padding] ${sel ? "hidden md:block md:pl-[396px]" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="liquid flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold">
                  {food.flag} {food.name_ko}
                  <span className="font-mono text-[#5ef2c0]">{status === "ok" ? `· ${places.length}곳` : status === "loading" ? "· 찾는 중" : ""}</span>
                </span>
                {status === "ok" && places.length > 1 && (
                  <div className="liquid flex rounded-full p-1" role="tablist" aria-label="정렬">
                    {SORTS.map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={sort === k}
                        onClick={() => setSort(k)}
                        className={`h-7 rounded-full px-3 text-xs font-semibold transition ${sort === k ? "bg-white/90 text-[#04201a]" : "text-ink-soft hover:text-ink"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {status === "error" && <p className="liquid rounded-2xl px-4 py-3 text-sm text-diet-no">{error}</p>}
              {status === "ok" && !places.length && (
                <p className="liquid rounded-2xl px-4 py-3 text-sm">
                  반경 {radiusKm}km 안에서 {food.name_ko} 파는 곳을 못 찾았어요. {radiusKm < 10 ? "반경을 넓혀 보세요." : "다른 곳에서 찾아보세요."}
                </p>
              )}
              {places.length > 0 && (
                <ul className="snap-row gap-2! pb-1" aria-label="찾은 음식점">
                  {places.map((p, i) => {
                    const on = p.id === selected;
                    const s = stats[p.id];
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(p.id)}
                          aria-pressed={on}
                          className={`liquid hud-up flex w-60 items-start gap-2.5 rounded-2xl p-3 text-left transition hover:-translate-y-0.5 ${on ? "shadow-[0_0_0_2px_#c8f06a,0_0_30px_-8px_#c8f06a]!" : ""}`}
                          style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                        >
                          <span className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs font-extrabold ${on ? "bg-[#c8f06a] text-[#0e2a22]" : "border border-[#5ef2c0] text-[#5ef2c0]"}`}>{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{p.name}</span>
                            <span className="block truncate text-[11px] text-ink-soft">
                              {formatDistance(p.distance)} · {formatEta(p.distance)}
                            </span>
                            <span className="mt-1 flex items-center gap-1.5 text-[11px]">
                              {s?.rating != null ? (
                                <>
                                  <Icon name="star" className="size-3 text-amber-400" fill="currentColor" />
                                  <span className="font-semibold tabular-nums">{s.rating.toFixed(1)}</span>
                                  <span className="text-muted">리뷰 {s.count.toLocaleString("ko-KR")}</span>
                                </>
                              ) : (
                                <span className="text-muted">{p.category?.split(">").pop()?.trim() ?? ""}</span>
                              )}
                              {p.match === "cuisine" && <span className="ml-auto rounded-full bg-diet-warn/20 px-1.5 text-diet-warn-ink">메뉴 확인</span>}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {!food && ready && (
            <p className="liquid hud-up pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold">위에서 음식을 고르면 레이더가 돌아가요</p>
          )}
        </div>
      </div>

      <footer className="space-y-0.5 text-caption text-muted">
        {example && <p className="font-semibold text-diet-warn-ink">예시 데이터 — 개발 미리보기 전용이에요. 실제 음식점이 아니에요.</p>}
        <p>음식점: 카카오 로컬 API · 메뉴판·영업시간·별점: 카카오맵 공개 정보 · 시간은 직선거리 어림이에요. 메뉴·영업 여부는 가게에 꼭 확인해 주세요.</p>
        <p>위치는 주변 검색에만 쓰고 저장하지 않아요.</p>
      </footer>
    </main>
  );
}
