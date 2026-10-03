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

export interface MapHandle {
  setCenter(p: MapPoint): void;
  setMe(p: MapPoint | null): void;
  setPins(pins: MapPin[], onPick: (id: string) => void): void;
  /** 그릇 크기를 다시 재고, 점들이 다 보이게 확대·이동 (점이 하나면 그 점으로 이동만) */
  fit(points: MapPoint[]): void;
  destroy(): void;
}

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
// 위치 로고(물방울) 모양: 둥근 머리 + 아래로 뾰족한 꼬리. 바닥 끝(핀 아래 중앙)이 좌표 지점이다.
const pinHtml = (p: MapPin) => {
  const fill = p.selected ? "#d84a3a" : "#1f5f46";
  const scale = p.selected ? 1.15 : 1;
  const label = p.label.length > 2 ? "•" : p.label;
  return `<button type="button" data-pin="${p.id}" aria-label="${p.label.replace(/"/g, "&quot;")}" style="all:unset;cursor:pointer;display:block;width:30px;height:40px;transform:scale(${scale});transform-origin:50% 100%;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));">
    <svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true" style="display:block;overflow:visible">
      <path d="M15 1 C7.3 1 1.5 6.7 1.5 14.3 C1.5 23.2 14 38 15 39 C16 38 28.5 23.2 28.5 14.3 C28.5 6.7 22.7 1 15 1 Z" fill="${fill}" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="14" r="6.5" fill="#fff"/>
      <text x="15" y="17.5" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="9.5" font-weight="700" fill="${fill}">${label}</text>
    </svg>
  </button>`;
};
// 내 위치 — 중앙 점은 그대로, 바깥 고리는 2초마다 깜박깜박 퍼져 나간다 (prefers-reduced-motion 이면 멈춤)
const meHtml = `<span aria-label="내 위치" style="position:relative;display:block;width:16px;height:16px">
  <style>@keyframes foodis-me-ping{0%{transform:scale(1);opacity:.65}100%{transform:scale(2.6);opacity:0}}@media (prefers-reduced-motion:reduce){.foodis-me-ping{animation:none!important;opacity:.3!important}}</style>
  <span class="foodis-me-ping" style="position:absolute;inset:-6px;border-radius:50%;background:#2f80ed;animation:foodis-me-ping 1.8s cubic-bezier(0,0,.2,1) infinite"></span>
  <span style="position:absolute;inset:0;border-radius:50%;background:#2f80ed;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></span>
</span>`;
const el = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild as HTMLElement;
};

// ── 카카오 (필요한 만큼만 타입을 적는다)
type KLatLng = object;
type KOverlay = { setMap(m: KMap | null): void };
type KMap = { setCenter(c: KLatLng): void; relayout(): void; setBounds(b: KBounds): void };
type KBounds = { extend(p: KLatLng): void };
type KakaoNS = {
  maps: {
    load(cb: () => void): void;
    LatLng: new (lat: number, lng: number) => KLatLng;
    LatLngBounds: new () => KBounds;
    Map: new (el: HTMLElement, o: { center: KLatLng; level: number }) => KMap;
    CustomOverlay: new (o: { position: KLatLng; content: HTMLElement; xAnchor?: number; yAnchor?: number; zIndex?: number; clickable?: boolean }) => KOverlay;
    MarkerClusterer?: new (o: { map: KMap; averageCenter: boolean; minLevel: number }) => { addMarkers(m: KOverlay[]): void; clear(): void };
  };
};

async function kakaoMap(key: string, box: HTMLElement, center: MapPoint): Promise<MapHandle> {
  await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=clusterer`);
  const kakao = (window as unknown as { kakao?: KakaoNS }).kakao;
  if (!kakao?.maps) throw new Error("카카오 지도가 응답하지 않아요 (JavaScript 키·도메인 등록 확인)");
  await new Promise<void>((r) => kakao.maps.load(r));
  const k = kakao.maps;
  const map = new k.Map(box, { center: new k.LatLng(center.lat, center.lng), level: 5 });
  const cluster = k.MarkerClusterer ? new k.MarkerClusterer({ map, averageCenter: true, minLevel: 10 }) : null;
  let pins: KOverlay[] = [];
  let me: KOverlay | null = null;
  return {
    setCenter: (p) => map.setCenter(new k.LatLng(p.lat, p.lng)),
    setMe(p) {
      me?.setMap(null);
      me = p ? new k.CustomOverlay({ position: new k.LatLng(p.lat, p.lng), content: el(meHtml), zIndex: 1 }) : null;
      me?.setMap(map);
    },
    setPins(list, onPick) {
      cluster?.clear();
      pins.forEach((o) => o.setMap(null));
      pins = list.map((p) => {
        const node = el(pinHtml(p));
        node.addEventListener("click", () => onPick(p.id));
        return new k.CustomOverlay({ position: new k.LatLng(p.lat, p.lng), content: node, yAnchor: 1, xAnchor: 0.5, zIndex: p.selected ? 3 : 2, clickable: true });
      });
      if (cluster) cluster.addMarkers(pins);
      else pins.forEach((o) => o.setMap(map));
    },
    fit(points) {
      map.relayout();
      if (points.length === 1) return map.setCenter(new k.LatLng(points[0].lat, points[0].lng));
      if (!points.length) return;
      const b = new k.LatLngBounds();
      points.forEach((p) => b.extend(new k.LatLng(p.lat, p.lng)));
      map.setBounds(b);
    },
    destroy() {
      cluster?.clear();
      pins.forEach((o) => o.setMap(null));
      me?.setMap(null);
      box.innerHTML = "";
    },
  };
}

// ── 네이버 (마커 표시까지)
type NMarker = { setMap(m: NMap | null): void };
type NMap = { setCenter(c: object): void; fitBounds(b: object): void; autoResize?: () => void; destroy?: () => void };
type NaverNS = {
  maps: {
    LatLng: new (lat: number, lng: number) => object;
    Point: new (x: number, y: number) => object;
    LatLngBounds: new (sw: object, ne: object) => object;
    Map: new (el: HTMLElement, o: { center: object; zoom: number }) => NMap;
    Marker: new (o: { position: object; map: NMap; icon: { content: string; anchor: object }; zIndex?: number }) => NMarker;
    Event: { addListener(t: NMarker, ev: string, fn: () => void): void };
  };
};

async function naverMap(clientId: string, box: HTMLElement, center: MapPoint): Promise<MapHandle> {
  await loadScript(`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`);
  const naver = (window as unknown as { naver?: NaverNS }).naver;
  if (!naver?.maps) throw new Error("네이버 지도가 응답하지 않아요 (Client ID·서비스 URL 등록 확인)");
  const n = naver.maps;
  const map = new n.Map(box, { center: new n.LatLng(center.lat, center.lng), zoom: 15 });
  let pins: NMarker[] = [];
  let me: NMarker | null = null;
  return {
    setCenter: (p) => map.setCenter(new n.LatLng(p.lat, p.lng)),
    setMe(p) {
      me?.setMap(null);
      me = p ? new n.Marker({ position: new n.LatLng(p.lat, p.lng), map, icon: { content: meHtml, anchor: new n.Point(8, 8) }, zIndex: 1 }) : null;
    },
    setPins(list, onPick) {
      pins.forEach((m) => m.setMap(null));
      pins = list.map((p) => {
        const m = new n.Marker({ position: new n.LatLng(p.lat, p.lng), map, icon: { content: pinHtml(p), anchor: new n.Point(15, 40) }, zIndex: p.selected ? 3 : 2 });
        n.Event.addListener(m, "click", () => onPick(p.id));
        return m;
      });
    },
    fit(points) {
      map.autoResize?.();
      if (points.length === 1) return map.setCenter(new n.LatLng(points[0].lat, points[0].lng));
      if (!points.length) return;
      const lats = points.map((p) => p.lat);
      const lngs = points.map((p) => p.lng);
      map.fitBounds(new n.LatLngBounds(new n.LatLng(Math.min(...lats), Math.min(...lngs)), new n.LatLng(Math.max(...lats), Math.max(...lngs))));
    },
    destroy() {
      pins.forEach((m) => m.setMap(null));
      me?.setMap(null);
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
