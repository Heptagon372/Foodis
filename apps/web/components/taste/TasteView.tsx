"use client";
// 한국에서 맛보기 (docs/design/12): 이 음식을 한국 어디서 먹을 수 있는지 — 지도 + 목록.
// 위치: '내 주변'을 눌렀을 때만 브라우저 GPS 를 묻는다. 좌표는 우리 서버를 거쳐 카카오 검색에만 쓰이고 저장되지 않는다.
// 기본은 서울시청 기준(화면에 알림) · 지역 검색으로 바꿀 수 있다.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapProvider } from "@/lib/client/map-provider";
import { DEFAULT_CENTER, DEFAULT_RADIUS, inKorea, RADIUS_STEPS } from "@/lib/places/geo";
import type { FilterKey, NearbyResponse } from "@/lib/places/types";
import type { PlacesSetup } from "@/lib/places/server";
import { useFoodi } from "../FoodiSheet";
import { Icon } from "../icons";
import { BackLink, btn, chip, IconTile, SegTabs } from "../ui";
import { PlaceCard } from "./PlaceCard";
import { TasteMap } from "./TasteMap";

type Loc = { lat: number; lng: number; label: string | null; kind: "default" | "gps" | "area" };
type FoodRef = { id: string; slug: string; name_ko: string; flag: string; country_name: string };

const FILTERS: [FilterKey, string][] = [
  ["takeout", "포장"],
  ["group_buy", "공동구매"],
  ["coupon", "쿠폰"],
  ["event", "이벤트"],
];

export function TasteView({ food, setup, mapKey, dev }: { food: FoodRef; setup: PlacesSetup; mapKey: string | null; dev: boolean }) {
  const { open } = useFoodi();
  const [loc, setLoc] = useState<Loc>({ lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, label: DEFAULT_CENTER.label, kind: "default" });
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const [sort, setSort] = useState<"distance" | "best">("distance");
  const [filters, setFilters] = useState<FilterKey[]>([]);
  const [indieOnly, setIndieOnly] = useState(false);
  const [data, setData] = useState<NearbyResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  const [gps, setGps] = useState<"idle" | "asking" | "denied" | "unsupported" | "outside">("idle");
  const [area, setArea] = useState("");
  const [areaMsg, setAreaMsg] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const canSearch = setup.kakaoRest || setup.example;

  useEffect(() => {
    if (!canSearch) return;
    const ctl = new AbortController();
    const qs = new URLSearchParams({ food: food.slug, sort, radius: String(radius) });
    // 기본 위치(서울시청)는 좌표를 보내지 않는다 — 서버가 기본값을 쓰고 "서울시청 기준"이라고 알린다
    if (loc.kind !== "default") {
      qs.set("lat", String(loc.lat));
      qs.set("lng", String(loc.lng));
    }
    if (filters.length) qs.set("filters", filters.join(","));
    if (indieOnly) qs.set("franchise", "no");
    setStatus("loading");
    fetch(`/api/places/nearby?${qs}`, { signal: ctl.signal })
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
  }, [canSearch, food.slug, loc, radius, sort, filters, indieOnly]);

  const nearMe = useCallback(() => {
    if (!("geolocation" in navigator)) return setGps("unsupported");
    setGps("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!inKorea(p)) return setGps("outside");
        setGps("idle");
        setLoc({ ...p, label: null, kind: "gps" });
      },
      () => setGps("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const searchArea = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = area.trim();
    if (q.length < 2) return;
    setAreaMsg("찾는 중…");
    const res = await fetch(`/api/places/geocode?q=${encodeURIComponent(q)}`).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setAreaMsg(body?.error?.message ?? "그 지역을 찾지 못했어요.");
    setAreaMsg("");
    setLoc({ lat: body.lat, lng: body.lng, label: body.label ?? q, kind: "area" });
  };

  const toggle = (f: FilterKey) => setFilters((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  const places = useMemo(() => data?.places ?? [], [data]);
  const pins = useMemo(() => places.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })), [places]);
  const center = useMemo(() => ({ lat: data?.center.lat ?? loc.lat, lng: data?.center.lng ?? loc.lng }), [data, loc]);
  const me = useMemo(() => (loc.kind === "gps" ? { lat: loc.lat, lng: loc.lng } : null), [loc]);
  const nextRadius = RADIUS_STEPS.find((r) => r > radius);
  const example = Boolean(data?.example);
  // Google 평점이 든 목록은 카카오·네이버 지도와 함께 보여주지 않는다 (Google 약관 §14.2)
  const googleList = Boolean(data?.sources.google);
  const showMap = Boolean(mapKey && setup.mapKey && data && !example && !googleList);
  const fromLabel = loc.kind === "gps" ? null : (data?.center.label ?? loc.label);

  return (
    <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="space-y-3">
        <BackLink href={`/food/${food.slug}`} label={`${food.flag} ${food.name_ko}`} />
        <div className="space-y-1.5">
          <h1 className="flex items-center gap-2.5 text-h2 font-bold text-ink">
            <IconTile icon="pin" size="sm" />
            한국에서 {food.name_ko} 맛보기
          </h1>
          <p className="text-caption text-muted">카카오 장소 검색으로 찾은 근처 음식점이에요. 메뉴·영업 여부는 가게에 꼭 확인해 주세요.</p>
        </div>
      </header>

      {(!setup.kakaoRest || !setup.mapKey) && <SetupPanel setup={setup} dev={dev} />}

      {canSearch && (
        <>
          <section className="card space-y-3 rounded-3xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={nearMe} disabled={gps === "asking"} className={btn("primary", "sm")}>
                <Icon name="locate" className="size-4" />
                {gps === "asking" ? "위치 확인 중…" : "내 주변"}
              </button>
              {/* 좁은 화면에선 검색칸이 다음 줄 전체 폭으로 내려가 placeholder 가 잘리지 않게 */}
              <form onSubmit={searchArea} className="flex min-w-[15rem] flex-1 gap-1.5">
                <input
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  maxLength={60}
                  placeholder="지역·역 이름 (예: 강남역)"
                  aria-label="지역으로 찾기"
                  className="h-10 min-w-0 flex-1 rounded-full border border-line bg-sunken px-4 text-sm text-ink placeholder:text-muted focus:border-brand"
                />
                <button className={`${btn("outline", "sm")} shrink-0 px-3.5`}>
                  <Icon name="search" className="size-4" />
                  찾기
                </button>
              </form>
            </div>
            <p className="text-caption text-ink-soft">
              {loc.kind === "gps" ? "내 위치 기준" : `${fromLabel ?? "선택한 지역"} 기준`} · 반경 {radius >= 1000 ? `${radius / 1000}km` : `${radius}m`}
              {gps === "denied" && " · 위치 권한이 없어 지역 검색이나 서울시청 기준으로 보여드려요"}
              {gps === "unsupported" && " · 이 브라우저는 위치를 지원하지 않아요"}
              {gps === "outside" && " · 지금 위치가 한국 밖이라 서울시청 기준으로 보여드려요"}
              {areaMsg && ` · ${areaMsg}`}
            </p>
            <p className="text-caption text-muted">위치는 주변 검색에만 쓰고 저장하지 않아요.</p>
          </section>

          <SegTabs
            tabs={["distance", "best"] as const}
            value={sort}
            onChange={setSort}
            label="정렬"
            labels={{ distance: "가까운 순", best: "맛있는 순" }}
          />
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {FILTERS.map(([k, label]) => (
              <Chip key={k} on={filters.includes(k)} onClick={() => toggle(k)}>
                {label}
              </Chip>
            ))}
            <Chip on={indieOnly} onClick={() => setIndieOnly((v) => !v)}>
              프랜차이즈 제외
            </Chip>
          </div>
          {indieOnly && !data?.sources.franchiseSyncedAt && !example && <p className="text-caption text-diet-warn-ink">가맹 브랜드 목록을 아직 받지 않아 &lsquo;개인 음식점&rsquo;을 가릴 수 없어요.</p>}

          {example && (
            <p className="flex items-start gap-2 rounded-2xl border-2 border-dashed border-diet-warn bg-diet-warn/10 px-3.5 py-3 text-sm font-semibold text-diet-warn-ink">
              <Icon name="warn" className="mt-0.5 size-4 shrink-0" />
              예시 데이터 — 개발 미리보기 전용이에요. 실제 음식점·평점·혜택이 아니에요.
            </p>
          )}

          {showMap && <TasteMap provider={setup.mapProvider as MapProvider} mapKey={mapKey!} center={center} me={me} pins={pins} selected={selected} onPick={(id) => (setSelected(id), document.getElementById(`place-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }))} />}
          {googleList && (
            <p className="flex items-start gap-2 rounded-2xl bg-sunken px-3.5 py-3 text-caption text-ink-soft">
              <Icon name="info" className="mt-px size-4 shrink-0 text-leaf" />
              <span>Google 평점이 들어간 목록은 Google 정책상 다른 지도와 함께 보여줄 수 없어서 목록으로만 보여드려요. 지도는 &lsquo;가까운 순&rsquo;에서 볼 수 있어요.</span>
            </p>
          )}

          {status === "loading" && !data && <p className="py-8 text-center text-sm text-muted">근처 음식점을 찾는 중…</p>}
          {status === "error" && (
            <p className="flex items-start gap-2 rounded-2xl bg-diet-no/10 px-3.5 py-3 text-sm text-diet-no">
              <Icon name="warn" className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          {data && (
            <section className={`space-y-3 transition-opacity ${status === "loading" ? "opacity-50" : ""}`} aria-busy={status === "loading"}>
              {/* 예시 데이터 안내는 위 점선 배너로 이미 크게 보여준다 */}
              {data.notices.filter((n) => !(example && n.startsWith("예시 데이터"))).map((n) => (
                <p key={n} className="flex items-start gap-1.5 text-caption text-diet-warn-ink">
                  <Icon name="info" className="mt-px size-4 shrink-0" />
                  {n}
                </p>
              ))}
              {places.map((p, i) => (
                <PlaceCard key={p.id} place={p} index={i} foodName={food.name_ko} foodSlug={food.slug} countryName={food.country_name} fromLabel={fromLabel} example={example} selected={selected === p.id} onSelect={() => setSelected(p.id)} />
              ))}
              {!places.length && (
                <div className="card space-y-3 rounded-3xl p-5 text-center">
                  {data.totalBeforeFilter > 0 ? (
                    <>
                      <p className="text-sm text-ink">조건에 맞는 곳이 없어요. 필터를 풀면 {data.totalBeforeFilter}곳이 있어요.</p>
                      <button type="button" onClick={() => (setFilters([]), setIndieOnly(false))} className={btn("outline", "sm")}>
                        필터 모두 풀기
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-ink">근처에서 {food.name_ko} 파는 곳을 찾지 못했어요.</p>
                      {nextRadius && (
                        <button type="button" onClick={() => setRadius(nextRadius)} className={btn("primary", "sm")}>
                          반경 {nextRadius / 1000}km로 넓히기
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => open({ contextFoodId: food.id, contextName: food.name_ko, question: `${food.name_ko}랑 비슷한데 한국에서 먹기 쉬운 음식 추천해 줘` })} className={`${btn("soft", "md")} w-full`}>
                    <Icon name="sparkle" className="size-5" />
                    푸디에게 다른 음식 추천받기
                  </button>
                </div>
              )}
              {places.length > 0 && nextRadius && (
                <button type="button" onClick={() => setRadius(nextRadius)} className={`${btn("glass", "md")} w-full`}>
                  반경 {nextRadius / 1000}km로 넓혀서 더 찾기
                </button>
              )}
              <footer className="space-y-0.5 border-t border-line pt-3 text-caption text-muted">
                <p>음식점 정보: {example ? "예시" : "카카오 로컬 API"}{googleList ? " · 평점·포장: Google Maps" : ""}</p>
                <p>푸디 평점은 로그인한 이용자가 직접 남긴 별점이에요. 쿠폰·이벤트·공동구매는 사장님·푸디팀이 등록하거나 이용자 제보를 확인한 것만 보여드려요.</p>
                {data.sources.franchiseSyncedAt && <p>가맹 브랜드: 공정거래위원회 가맹사업 정보공개 ({new Date(data.sources.franchiseSyncedAt).toLocaleDateString("ko-KR")} 받음)</p>}
              </footer>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`${chip(on)} shrink-0`}>
      {on && <Icon name="check" className="size-4" strokeWidth={2.25} />}
      {children}
    </button>
  );
}

/** 키가 없을 때: 무엇을 어디에 넣어야 하는지 (값은 절대 보여주지 않고 있음/없음만) */
function SetupPanel({ setup, dev }: { setup: PlacesSetup; dev: boolean }) {
  const naver = setup.mapProvider === "naver";
  const rows: [boolean, string, string][] = [
    [setup.kakaoRest, "KAKAO_REST_API_KEY", "음식점 검색 (서버 전용 · 카카오 개발자 콘솔 REST API 키)"],
    naver ? [setup.mapKey, "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "지도 그리기 (NCP Maps Client ID)"] : [setup.mapKey, "NEXT_PUBLIC_KAKAO_MAP_JS_KEY", "지도 그리기 (JavaScript 키 + 사이트 도메인 등록)"],
    [setup.google, "GOOGLE_MAPS_API_KEY", "선택 · 맛있는 순의 Google 평점"],
    [setup.ftc, "FTC_FRANCHISE_API_KEY", "선택 · 가맹 브랜드 동기화 (어드민)"],
  ];
  if (!dev)
    return <p className="card rounded-3xl p-4 text-sm text-ink-soft">{setup.kakaoRest ? "지도를 준비 중이에요. 목록으로 먼저 보여드릴게요." : "음식점 찾기를 준비 중이에요. 조금만 기다려 주세요."}</p>;
  return (
    <section className="space-y-2 rounded-3xl border border-diet-warn/50 bg-diet-warn/10 p-4">
      <p className="flex items-center gap-1.5 font-semibold text-diet-warn-ink">
        <Icon name="key" className="size-4" />
        지도 키 설정 필요
      </p>
      <p className="text-caption text-diet-warn-ink">apps/web/.env.local 에 아래 값을 넣고 개발 서버를 다시 켜세요. 발급 방법: docs/design/12_한국에서_맛보기_지도.md</p>
      <ul className="space-y-1 text-caption text-ink">
        {rows.map(([ok, name, what]) => (
          <li key={name} className="flex gap-2">
            <Icon name={ok ? "check-circle" : "circle"} className={`mt-px size-4 shrink-0 ${ok ? "text-leaf" : "text-muted"}`} />
            <span className="sr-only">{ok ? "설정됨: " : "없음: "}</span>
            <span>
              <code className="font-semibold">{name}</code> — {what}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
