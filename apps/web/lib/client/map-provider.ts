"use client";
// 지도 그리기 어댑터 — NEXT_PUBLIC_MAP_PROVIDER=kakao|naver 로 바꾼다 (기본 카카오). 화면은 MapHandle 만 안다.
// 카카오 Maps JavaScript SDK (확인일 2026-10-02) https://apis.map.kakao.com/web/guide/
//   <script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=JS키&autoload=false&libraries=clusterer"> → kakao.maps.load(cb)
//   카카오 개발자 콘솔 [앱 설정 > 플랫폼 키 > JavaScript 키]에 사이트 도메인(예: http://localhost:3000) 등록 + 카카오맵 사용 설정 ON 필요
// 네이버 Maps JavaScript API v3 (NCP) https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html
//   <script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=클라이언트ID"> (구 ncpClientId 는 무료 이용 종료)
// ⚠️ Google 평점이 들어간 목록과 함께 이 지도를 띄우지 않는다 (Google 약관 §14.2) — TasteView 가 막는다.

export type MapProvider = "kakao" | "naver";
export type MapPoint = { lat: number; lng: number };
export type MapPin = MapPoint & { id: string; label: string; selected: boolean };
/** 지도 위에 패널이 덮는 쪽 여백(px) — 맞추기·초점 이동을 남은 칸 기준으로 */
export type MapInset = { left?: number; bottom?: number };

export interface MapHandle {
  setCenter(p: MapPoint): void;
  setMe(p: MapPoint | null): void;
  setPins(pins: MapPin[], onPick: (id: string) => void): void;
  /** 그릇 크기를 다시 재고, 점들이 다 보이게 확대·이동 (점이 하나면 그 점으로 이동만) */
  fit(points: MapPoint[], inset?: MapInset): void;
  /** 검색 반경 원 (아주 옅게) + 기준점 표시. null 이면 지운다 */
  setCircle(center: MapPoint | null, radiusM: number): void;
  /** 지도 빈 곳 클릭 (핀 클릭은 setPins 의 onPick) */
  onClick(cb: ((p: MapPoint) => void) | null): void;
  /** 한 점으로 가까이 확대해 부드럽게 이동 — inset 만큼 가린 칸을 피해 남은 칸 가운데에 */
  focus(p: MapPoint, inset?: MapInset): void;
  /** 대한민국 전체가 보이게 */
  showKorea(): void;
  destroy(): void;
}

const KOREA = { sw: { lat: 33.1, lng: 124.6 }, ne: { lat: 38.6, lng: 131.0 } };

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src))
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => (scripts.delete(src), reject(new Error("지도 스크립트를 불러오지 못했어요")));
        document.head.appendChild(s);
      }),
    );
  return scripts.get(src)!;
}

// 핀·내 위치 점은 HTML 오버레이로 — 두 지도에서 같은 모양.
// 위치 로고(물방울) 모양 — 흰 몸통 + 초록 테두리. 바닥 끝(핀 아래 중앙)이 좌표 지점이다. 고른 핀은 연두로 커지고 바닥에 빛 고리.
const GREEN = "#2b8645";
const LIME = "#c8f06a";
const pinHtml = (p: MapPin) => {
  const body = p.selected ? LIME : "#ffffff";
  const ink = p.selected ? "#13301b" : GREEN;
  const glow = p.selected ? "rgba(200,240,106,.95)" : "rgba(43,134,69,.35)";
  const scale = p.selected ? 1.25 : 1;
  const label = p.label.length > 2 ? "•" : p.label;
  return `<button type="button" data-pin="${p.id}" aria-label="${p.label.replace(/"/g, "&quot;")}번 음식점" style="all:unset;cursor:pointer;position:relative;display:block;width:30px;height:40px;transform:scale(${scale});transform-origin:50% 100%;transition:transform .2s cubic-bezier(.2,.9,.25,1.2);filter:drop-shadow(0 0 6px ${glow}) drop-shadow(0 3px 4px rgba(18,38,26,.3));">
    ${p.selected ? `<span style="position:absolute;left:50%;bottom:-5px;width:26px;height:9px;margin-left:-13px;border-radius:50%;background:radial-gradient(closest-side,${glow},transparent);"></span>` : ""}
    <svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true" style="position:relative;display:block;overflow:visible">
      <path d="M15 1 C7.3 1 1.5 6.7 1.5 14.3 C1.5 23.2 14 38 15 39 C16 38 28.5 23.2 28.5 14.3 C28.5 6.7 22.7 1 15 1 Z" fill="${body}" stroke="${GREEN}" stroke-width="${p.selected ? 2 : 1.8}"/>
      <text x="15" y="18.2" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="11" font-weight="800" fill="${ink}">${label}</text>
    </svg>
  </button>`;
};
// 내 위치 — 중앙 점은 그대로, 바깥 고리는 깜박깜박 퍼져 나간다 (prefers-reduced-motion 이면 멈춤)
const meHtml = `<span aria-label="내 위치" style="position:relative;display:block;width:16px;height:16px">
  <style>@keyframes foodis-me-ping{0%{transform:scale(1);opacity:.65}100%{transform:scale(2.6);opacity:0}}@media (prefers-reduced-motion:reduce){.foodis-me-ping{animation:none!important;opacity:.3!important}}</style>
  <span class="foodis-me-ping" style="position:absolute;inset:-6px;border-radius:50%;background:#2f80ed;animation:foodis-me-ping 1.8s cubic-bezier(0,0,.2,1) infinite"></span>
  <span style="position:absolute;inset:0;border-radius:50%;background:#2f80ed;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></span>
</span>`;
// 검색 기준점 — 십자 조준선
const anchorHtml = `<span aria-label="검색 기준 위치" style="position:relative;display:block;width:22px;height:22px;pointer-events:none">
  <span style="position:absolute;inset:0;border:1.5px solid ${GREEN};border-radius:50%;box-shadow:0 0 8px ${GREEN}"></span>
  <span style="position:absolute;left:50%;top:-6px;bottom:-6px;width:1.5px;margin-left:-.75px;background:${GREEN}"></span>
  <span style="position:absolute;top:50%;left:-6px;right:-6px;height:1.5px;margin-top:-.75px;background:${GREEN}"></span>
</span>`;
const CIRCLE = { strokeColor: GREEN, strokeOpacity: 0.5, strokeWeight: 1.5, fillColor: "#c8f06a", fillOpacity: 0.12 };
const el = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild as HTMLElement;
};

// ── 카카오 (필요한 만큼만 타입을 적는다)
type KLatLng = { getLat(): number; getLng(): number };
type KOverlay = { setMap(m: KMap | null): void };
type KMap = {
  setCenter(c: KLatLng): void;
  panTo(c: KLatLng): void;
  panBy(dx: number, dy: number): void;
  setLevel(l: number, o?: { animate?: boolean }): void;
  getLevel(): number;
  relayout(): void;
  setBounds(b: KBounds, top?: number, right?: number, bottom?: number, left?: number): void;
};
type KBounds = { extend(p: KLatLng): void };
type KakaoNS = {
  maps: {
    load(cb: () => void): void;
    LatLng: new (lat: number, lng: number) => KLatLng;
    LatLngBounds: new (sw?: KLatLng, ne?: KLatLng) => KBounds;
    Map: new (el: HTMLElement, o: { center: KLatLng; level: number }) => KMap;
    CustomOverlay: new (o: { position: KLatLng; content: HTMLElement; xAnchor?: number; yAnchor?: number; zIndex?: number; clickable?: boolean }) => KOverlay;
    Circle: new (o: { center: KLatLng; radius: number; strokeWeight: number; strokeColor: string; strokeOpacity: number; strokeStyle?: string; fillColor: string; fillOpacity: number }) => KOverlay;
    MarkerClusterer?: new (o: { map: KMap; averageCenter: boolean; minLevel: number }) => { addMarkers(m: KOverlay[]): void; clear(): void };
    event: { addListener(t: KMap, ev: string, fn: (e: { latLng: KLatLng }) => void): void; removeListener(t: KMap, ev: string, fn: (e: { latLng: KLatLng }) => void): void };
  };
};

async function kakaoMap(key: string, box: HTMLElement, center: MapPoint): Promise<MapHandle> {
  await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=clusterer`);
  const kakao = (window as unknown as { kakao?: KakaoNS }).kakao;
  if (!kakao?.maps) throw new Error("카카오 지도가 응답하지 않아요 (JavaScript 키·도메인 등록 확인)");
  await new Promise<void>((r) => kakao.maps.load(r));
  const k = kakao.maps;
  const ll = (p: MapPoint) => new k.LatLng(p.lat, p.lng);
  const map = new k.Map(box, { center: ll(center), level: 5 });
  const cluster = k.MarkerClusterer ? new k.MarkerClusterer({ map, averageCenter: true, minLevel: 10 }) : null;
  let pins: KOverlay[] = [];
  let me: KOverlay | null = null;
  let circle: KOverlay | null = null;
  let anchor: KOverlay | null = null;
  let click: ((e: { latLng: KLatLng }) => void) | null = null;
  return {
    setCenter: (p) => map.setCenter(ll(p)),
    setMe(p) {
      me?.setMap(null);
      me = p ? new k.CustomOverlay({ position: ll(p), content: el(meHtml), zIndex: 1 }) : null;
      me?.setMap(map);
    },
    setPins(list, onPick) {
      cluster?.clear();
      pins.forEach((o) => o.setMap(null));
      pins = list.map((p) => {
        const node = el(pinHtml(p));
        node.addEventListener("click", () => onPick(p.id));
        return new k.CustomOverlay({ position: ll(p), content: node, yAnchor: 1, xAnchor: 0.5, zIndex: p.selected ? 3 : 2, clickable: true });
      });
      if (cluster) cluster.addMarkers(pins);
      else pins.forEach((o) => o.setMap(map));
    },
    fit(points, inset) {
      map.relayout();
      if (points.length === 1) return map.setCenter(ll(points[0]));
      if (!points.length) return;
      const b = new k.LatLngBounds();
      points.forEach((p) => b.extend(ll(p)));
      map.setBounds(b, 24, 24, 24 + (inset?.bottom ?? 0), 24 + (inset?.left ?? 0));
    },
    setCircle(c, r) {
      circle?.setMap(null);
      anchor?.setMap(null);
      circle = anchor = null;
      if (!c) return;
      circle = new k.Circle({ center: ll(c), radius: r, strokeStyle: "dash", ...CIRCLE });
      circle.setMap(map);
      anchor = new k.CustomOverlay({ position: ll(c), content: el(anchorHtml), zIndex: 0 });
      anchor.setMap(map);
    },
    onClick(cb) {
      if (click) k.event.removeListener(map, "click", click);
      click = cb ? (e) => cb({ lat: e.latLng.getLat(), lng: e.latLng.getLng() }) : null;
      if (click) k.event.addListener(map, "click", click);
    },
    focus(p, inset) {
      map.relayout();
      if (map.getLevel() > 3) map.setLevel(3);
      map.setCenter(ll(p));
      // 가린 칸의 절반만큼 지도를 밀어 점이 남은 칸 가운데에 오게
      const dx = (inset?.left ?? 0) / 2;
      const dy = (inset?.bottom ?? 0) / 2;
      if (dx || dy) map.panBy(-dx, dy);
    },
    showKorea() {
      map.relayout();
      map.setBounds(new k.LatLngBounds(ll(KOREA.sw), ll(KOREA.ne)), 16, 16, 16, 16);
    },
    destroy() {
      if (click) k.event.removeListener(map, "click", click);
      cluster?.clear();
      pins.forEach((o) => o.setMap(null));
      me?.setMap(null);
      circle?.setMap(null);
      anchor?.setMap(null);
      box.innerHTML = "";
    },
  };
}

// ── 네이버
type NLatLng = { lat(): number; lng(): number };
type NMarker = { setMap(m: NMap | null): void };
type NMap = {
  setCenter(c: object): void;
  setZoom(z: number, animate?: boolean): void;
  getZoom(): number;
  panBy(p: object): void;
  fitBounds(b: object, margin?: { top: number; right: number; bottom: number; left: number }): void;
  autoResize?: () => void;
  destroy?: () => void;
};
type NaverNS = {
  maps: {
    LatLng: new (lat: number, lng: number) => object;
    Point: new (x: number, y: number) => object;
    LatLngBounds: new (sw: object, ne: object) => object;
    Map: new (el: HTMLElement, o: { center: object; zoom: number }) => NMap;
    Marker: new (o: { position: object; map: NMap; icon: { content: string; anchor: object }; zIndex?: number; clickable?: boolean }) => NMarker;
    Circle: new (o: { map: NMap; center: object; radius: number; strokeColor: string; strokeOpacity: number; strokeWeight: number; strokeStyle?: string; fillColor: string; fillOpacity: number; clickable?: boolean }) => NMarker;
    Event: { addListener(t: object, ev: string, fn: (e: { coord: NLatLng }) => void): object; removeListener(l: object): void };
  };
};

async function naverMap(clientId: string, box: HTMLElement, center: MapPoint): Promise<MapHandle> {
  await loadScript(`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`);
  const naver = (window as unknown as { naver?: NaverNS }).naver;
  if (!naver?.maps) throw new Error("네이버 지도가 응답하지 않아요 (Client ID·서비스 URL 등록 확인)");
  const n = naver.maps;
  const ll = (p: MapPoint) => new n.LatLng(p.lat, p.lng);
  const map = new n.Map(box, { center: ll(center), zoom: 15 });
  let pins: NMarker[] = [];
  let me: NMarker | null = null;
  let circle: NMarker | null = null;
  let anchor: NMarker | null = null;
  let click: object | null = null;
  return {
    setCenter: (p) => map.setCenter(ll(p)),
    setMe(p) {
      me?.setMap(null);
      me = p ? new n.Marker({ position: ll(p), map, icon: { content: meHtml, anchor: new n.Point(8, 8) }, zIndex: 1 }) : null;
    },
    setPins(list, onPick) {
      pins.forEach((m) => m.setMap(null));
      pins = list.map((p) => {
        const m = new n.Marker({ position: ll(p), map, icon: { content: pinHtml(p), anchor: new n.Point(15, 40) }, zIndex: p.selected ? 3 : 2 });
        n.Event.addListener(m, "click", () => onPick(p.id));
        return m;
      });
    },
    fit(points, inset) {
      map.autoResize?.();
      if (points.length === 1) return map.setCenter(ll(points[0]));
      if (!points.length) return;
      const lats = points.map((p) => p.lat);
      const lngs = points.map((p) => p.lng);
      map.fitBounds(new n.LatLngBounds(new n.LatLng(Math.min(...lats), Math.min(...lngs)), new n.LatLng(Math.max(...lats), Math.max(...lngs))), {
        top: 24,
        right: 24,
        bottom: 24 + (inset?.bottom ?? 0),
        left: 24 + (inset?.left ?? 0),
      });
    },
    setCircle(c, r) {
      circle?.setMap(null);
      anchor?.setMap(null);
      circle = anchor = null;
      if (!c) return;
      circle = new n.Circle({ map, center: ll(c), radius: r, strokeStyle: "shortdash", clickable: false, ...CIRCLE });
      anchor = new n.Marker({ position: ll(c), map, icon: { content: anchorHtml, anchor: new n.Point(11, 11) }, zIndex: 0, clickable: false });
    },
    onClick(cb) {
      if (click) n.Event.removeListener(click);
      click = cb ? n.Event.addListener(map, "click", (e) => cb({ lat: e.coord.lat(), lng: e.coord.lng() })) : null;
    },
    focus(p, inset) {
      map.autoResize?.();
      if (map.getZoom() < 17) map.setZoom(17, false);
      map.setCenter(ll(p));
      const dx = (inset?.left ?? 0) / 2;
      const dy = (inset?.bottom ?? 0) / 2;
      if (dx || dy) map.panBy(new n.Point(-dx, dy));
    },
    showKorea() {
      map.autoResize?.();
      map.fitBounds(new n.LatLngBounds(ll(KOREA.sw), ll(KOREA.ne)), { top: 16, right: 16, bottom: 16, left: 16 });
    },
    destroy() {
      if (click) n.Event.removeListener(click);
      pins.forEach((m) => m.setMap(null));
      me?.setMap(null);
      circle?.setMap(null);
      anchor?.setMap(null);
      map.destroy?.();
      box.innerHTML = "";
    },
  };
}

export function createMap(provider: MapProvider, key: string, box: HTMLElement, center: MapPoint): Promise<MapHandle> {
  return provider === "naver" ? naverMap(key, box, center) : kakaoMap(key, box, center);
}

/** 길찾기 링크: 카카오맵 웹(앱이 있으면 앱으로 넘어감). 장소 id 가 카카오 기준이라 제공자와 무관하게 카카오맵으로 보낸다 */
export const directionsUrl = (p: { name: string; lat: number; lng: number }) => `https://map.kakao.com/link/to/${encodeURIComponent(p.name.replace(/,/g, " "))},${p.lat},${p.lng}`;
/** 카카오맵 앱 스킴 (대중교통) — 앱이 없으면 아무 일도 안 일어나므로 웹 링크와 함께만 쓴다 */
export const directionsAppUrl = (p: { lat: number; lng: number }) => `kakaomap://route?ep=${p.lat},${p.lng}&by=publictransit`;
