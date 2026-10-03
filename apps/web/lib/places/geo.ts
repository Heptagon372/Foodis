// 좌표 도우미 (docs/design/12 §개인정보). 순수 함수만 — 서버·클라이언트·테스트 공용.
// 사용자 좌표는 검색 대리 호출에만 쓰고 저장하지 않는다. 로그가 꼭 필요하면 roundCoord 로 ~100m 단위까지만 남긴다.

export type LatLng = { lat: number; lng: number };

/** 한국 본토·제주·울릉·독도를 넉넉히 감싼 사각형. 이 밖의 좌표는 카카오 로컬 검색에 보내지 않는다 */
export const KOREA_BBOX = { minLat: 33.0, maxLat: 38.9, minLng: 124.5, maxLng: 132.0 } as const;

/** GPS 를 거절했거나 지원하지 않을 때의 기준점 — 화면에 "서울시청 기준"이라고 꼭 알린다 */
export const DEFAULT_CENTER: LatLng & { label: string } = { lat: 37.5665, lng: 126.978, label: "서울시청" };

export const RADIUS_STEPS = [1000, 3000, 10000, 20000] as const; // 카카오 radius 최대 20,000m
export const DEFAULT_RADIUS = 3000;

export function inKorea(p: LatLng): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= KOREA_BBOX.minLat && p.lat <= KOREA_BBOX.maxLat && p.lng >= KOREA_BBOX.minLng && p.lng <= KOREA_BBOX.maxLng;
}

/** 쿼리 문자열 → 좌표. 없거나 숫자가 아니면 null, 한국 밖이면 "outside" */
export function parseCoords(lat: string | null, lng: string | null): LatLng | null | "outside" {
  if (lat == null || lng == null || lat.trim() === "" || lng.trim() === "") return null;
  const p = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  return inKorea(p) ? p : "outside";
}

/** 소수 셋째 자리(위도 기준 약 111m)로 자른다 — 캐시 키·로그용. 원 좌표는 남기지 않는다 */
export const roundCoord = (p: LatLng, digits = 3): LatLng => {
  const f = 10 ** digits;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
};

/** 두 점 사이 거리(m, 하버사인). 카카오가 distance 를 안 줄 때·DB 음식점용 */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** 반경 r(m) 을 감싸는 위경도 사각형 — DB 에서 확인된 음식점을 고를 때 */
export function boundsAround(p: LatLng, r: number) {
  const dLat = r / 111_320;
  const dLng = r / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { minLat: p.lat - dLat, maxLat: p.lat + dLat, minLng: p.lng - dLng, maxLng: p.lng + dLng };
}

export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)}km`);

/**
 * 거리 → 어림 소요시간. 외부 길찾기 API 를 쓰지 않고 공개 통행 데이터 기준의 보수적 어림이다.
 *  · 도보 5 km/h (83 m/분) — 신호 대기 포함
 *  · 자동차 서울 평균 25 km/h (417 m/분, 서울시 교통정보센터 2024) — 지도 상 직선 거리라 실제보다 짧게 나올 수 있다
 * 실제 경로 거리는 더 길고 신호·교통에 좌우되니 화면에서는 "약 X분"처럼 어림으로만 보여준다.
 */
export function etaMinutes(meters: number): { walk: number; drive: number } {
  const walk = Math.max(1, Math.round(meters / 83));
  const drive = Math.max(1, Math.round(meters / 417));
  return { walk, drive };
}

export const formatEta = (m: number) => {
  const { walk, drive } = etaMinutes(m);
  // 500m 이하는 도보가 자연스러워 도보만, 2km 이상은 차/대중교통만, 중간은 둘 다
  if (m <= 500) return `도보 약 ${walk}분`;
  if (m >= 2000) return `차로 약 ${drive}분`;
  return `도보 ${walk}분 · 차로 ${drive}분`;
};
