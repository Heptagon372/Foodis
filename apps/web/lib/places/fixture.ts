// ⚠️ 개발 미리보기 전용 예시 데이터 — 카카오 키가 없을 때 화면 모양만 확인하려고 쓴다.
// 운영(NODE_ENV=production)에서는 절대 내보내지 않는다 (nearby.ts allowExample). 실제 가게·평점·쿠폰이 아니다.
import type { LatLng } from "./geo";
import type { OfferView, Place } from "./types";

const at = (c: LatLng, dLat: number, dLng: number) => ({ lat: Math.round((c.lat + dLat) * 1e6) / 1e6, lng: Math.round((c.lng + dLng) * 1e6) / 1e6 });
const offer = (o: Partial<OfferView> & Pick<OfferView, "kind">): OfferView => ({ state: "active", title: null, starts_at: null, ends_at: null, verified: true, source_label: "예시 · 실제 혜택 아님", ...o });

export function examplePlaces(center: LatLng, foodName: string, now = new Date()): Place[] {
  const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString();
  const base = { phone: null, place_url: null, address: "예시 주소", road_address: null, delivery: null } as const;
  return [
    { ...base, id: "example-1", name: `(예시) ${foodName} 전문점`, category: "음식점 > 예시", ...at(center, 0.002, 0.001), distance: 240, match: "dish", rating: { google: { rating: 4.4, count: 120 }, app: { avg: 4.7, count: 3 } }, takeout: true, franchise: { is: false, brand: null }, offers: [offer({ kind: "coupon", title: "예시 쿠폰", ends_at: in30 })] },
    { ...base, id: "example-2", name: "(예시) 가맹 브랜드 역앞점", category: "음식점 > 예시", ...at(center, -0.004, 0.003), distance: 520, match: "dish", rating: { google: { rating: 4.0, count: 860 }, app: null }, takeout: null, franchise: { is: true, brand: "(예시) 가맹 브랜드" }, offers: [offer({ kind: "event", title: "예시 이벤트", ends_at: in30 }), offer({ kind: "group_buy", title: "예시 공동구매" })] },
    { ...base, id: "example-3", name: "(예시) 동네 세계음식 식당", category: "음식점 > 예시", ...at(center, 0.008, -0.006), distance: 1100, match: "cuisine", rating: { google: null, app: { avg: 5, count: 1 } }, takeout: null, franchise: { is: false, brand: null }, offers: [offer({ kind: "takeout", verified: false, source_label: "이용자 제보 · 확인 전" })] },
    { ...base, id: "example-4", name: "(예시) 평점 없는 새 가게", category: "음식점 > 예시", ...at(center, -0.011, -0.009), distance: 1600, match: "dish", rating: { google: null, app: null }, takeout: null, franchise: { is: null, brand: null }, offers: [] },
  ];
}
