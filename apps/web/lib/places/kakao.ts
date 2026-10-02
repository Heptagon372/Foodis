// 카카오 로컬 API — 키워드로 장소 검색 · 주소 검색 (서버 전용 REST 키).
// 공식 문서: https://developers.kakao.com/docs/ko/local/dev-guide (확인일 2026-10-02)
// 저장 규정: DB 에는 장소 id·place_url 만 (운영정책 제5조 제20항, https://devtalk.kakao.com/t/topic/151720) — nearby.ts 참고
//   GET https://dapi.kakao.com/v2/local/search/keyword.json  헤더 Authorization: KakaoAK {REST_API_KEY}
//   query · category_group_code(FD6 음식점, CE7 카페) · x(경도) · y(위도) · radius(0~20000m) · page(1~45) · size(1~15) · sort(accuracy|distance)
//   GET https://dapi.kakao.com/v2/local/search/address.json  query · page · size  → documents[].x, y
// 장소 페이지·후기는 긁지 않는다(약관). 여기서 받는 건 API 응답 필드뿐이다.
// fetch 를 주입받아 테스트에서 가짜 응답으로 돌린다 — 실제 호출 없음.
import type { LatLng } from "./geo";
import type { MatchLevel } from "./types";

export const KAKAO_BASE = "https://dapi.kakao.com/v2/local";
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type KakaoDeps = { key: string; fetch?: FetchLike };

export type KakaoDoc = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string; // 경도
  y: string; // 위도
  place_url: string;
  distance: string; // x,y 를 보냈을 때만 (m)
};

export class KakaoError extends Error {
  constructor(
    public status: number,
    public code: "auth" | "quota" | "upstream",
    message: string,
  ) {
    super(message);
  }
}

// 나라 → 카카오 분류에 실제로 쓰이는 요리 이름 ("음식점 > 아시아음식 > 베트남음식"). 없으면 "{나라} 음식"
const CUISINE: Record<string, string> = {
  KR: "한식", JP: "일식", CN: "중식", TW: "대만음식", VN: "베트남음식", TH: "태국음식", IN: "인도음식", NP: "네팔음식",
  ID: "인도네시아음식", MY: "말레이시아음식", PH: "필리핀음식", IT: "이탈리안", FR: "프랑스음식", ES: "스페인음식",
  GR: "그리스음식", TR: "터키음식", MX: "멕시칸", US: "아메리칸", DE: "독일음식", GB: "영국음식", RU: "러시아음식",
  UZ: "우즈베키스탄음식", GE: "조지아음식", LB: "레바논음식", MA: "모로코음식", BR: "브라질음식", PE: "페루음식", MN: "몽골음식",
};

export type FoodQueryInput = { name_ko: string; name_en: string; country_code: string; country_name: string; course_type?: string | null };
export type PlannedQuery = { query: string; match: Exclude<MatchLevel, "confirmed">; category: "FD6" | "CE7" };

/**
 * 검색어 전략: ① 한국어 음식 이름 → ② 영어 이름(라틴 문자일 때) → ③ 그 나라 요리 음식점.
 * ③은 "이 음식을 판다"가 아니라 "그 나라 음식점"이라 match=cuisine 으로 표시하고 화면에서 "메뉴 확인 필요"라고 말한다.
 * 음료(커피 등)는 카페(CE7)에서 찾는다.
 */
export function buildQueries(f: FoodQueryInput): PlannedQuery[] {
  const category = f.course_type === "drink" ? "CE7" : "FD6";
  const out: PlannedQuery[] = [];
  const seen = new Set<string>();
  const add = (q: string, match: PlannedQuery["match"]) => {
    const query = q.replace(/\s+/g, " ").trim();
    const k = query.toLowerCase();
    if (query.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push({ query, match, category });
  };
  add(f.name_ko, "dish");
  if (/[a-z]/i.test(f.name_en) && f.name_en.trim().length >= 3) add(f.name_en, "dish");
  if (category === "FD6") add(cuisineQuery(f), "cuisine");
  return out;
}

const cuisineQuery = (f: FoodQueryInput) => CUISINE[f.country_code] ?? `${f.country_name} 음식`;

/**
 * 나라 요리 검색(cuisine)은 카카오 키워드 검색이 느슨해서 엉뚱한 가게가 섞인다 ('베트남음식' → 포차·한식집).
 * 분류(category_name)나 가게 이름에 그 요리·나라 이름이 들어 있는 곳만 남긴다.
 */
export function isCuisineMatch(d: Pick<KakaoDoc, "place_name" | "category_name">, f: FoodQueryInput): boolean {
  const stems = [cuisineQuery(f).replace(/\s*음식$/, ""), f.country_name].filter((s) => s.length >= 2);
  const hay = `${d.category_name} ${d.place_name}`;
  return stems.some((s) => hay.includes(s));
}

async function call<T>(path: string, params: Record<string, string | number>, deps: KakaoDeps): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await (deps.fetch ?? fetch)(`${KAKAO_BASE}${path}?${qs}`, { headers: { Authorization: `KakaoAK ${deps.key}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (res.status === 401 || res.status === 403) throw new KakaoError(res.status, "auth", "카카오 REST 키가 올바르지 않거나 로컬 API 가 꺼져 있어요");
  if (res.status === 429) throw new KakaoError(429, "quota", "카카오 로컬 API 하루 사용량을 넘었어요");
  if (!res.ok) throw new KakaoError(res.status, "upstream", `카카오 로컬 API 오류 (${res.status})`);
  return (await res.json()) as T;
}

export async function keywordSearch(p: { query: string; category: "FD6" | "CE7"; center?: LatLng; radius?: number; size?: number; page?: number }, deps: KakaoDeps): Promise<KakaoDoc[]> {
  const params: Record<string, string | number> = { query: p.query, category_group_code: p.category, size: p.size ?? 15, page: p.page ?? 1 };
  if (p.center) Object.assign(params, { x: p.center.lng, y: p.center.lat, radius: Math.min(20000, Math.max(0, Math.round(p.radius ?? 3000))), sort: "distance" });
  const data = await call<{ documents: KakaoDoc[] }>("/search/keyword.json", params, deps);
  return data.documents ?? [];
}

/** 한 번 검색에서 이만큼 모이면 다음 검색어로 넘어가지 않는다 (요청당 최대 3회 호출) */
export const ENOUGH = 10;

export async function searchNearby(food: FoodQueryInput, center: LatLng, radius: number, deps: KakaoDeps): Promise<{ docs: (KakaoDoc & { match: PlannedQuery["match"] })[]; calls: number }> {
  const byId = new Map<string, KakaoDoc & { match: PlannedQuery["match"] }>();
  let calls = 0;
  for (const q of buildQueries(food)) {
    if (byId.size >= ENOUGH) break;
    calls++;
    for (const d of await keywordSearch({ query: q.query, category: q.category, center, radius }, deps)) {
      if (byId.has(d.id) || (q.match === "cuisine" && !isCuisineMatch(d, food))) continue;
      byId.set(d.id, { ...d, match: q.match });
    }
  }
  return { docs: [...byId.values()], calls };
}

/** 지역 기준점으로 쓰지 않는 가게 업종 — '도쿄역' 이 '도쿄스테이크 ○○역점' 으로 잡히는 걸 막는다 (FD6 음식점 · CE7 카페 · CS2 편의점) */
const NOT_AREA = new Set(["FD6", "CE7", "CS2"]);

/** 주소·지역 이름 → 좌표. 주소 검색이 비면 키워드 검색(역·동네 이름)으로 한 번 더 — 가게는 건너뛴다 */
export async function geocode(q: string, deps: KakaoDeps): Promise<(LatLng & { label: string }) | null> {
  const addr = await call<{ documents: { address_name: string; x: string; y: string }[] }>("/search/address.json", { query: q, size: 1 }, deps);
  const a = addr.documents?.[0];
  if (a) return { lat: Number(a.y), lng: Number(a.x), label: a.address_name };
  const kw = await call<{ documents: KakaoDoc[] }>("/search/keyword.json", { query: q, size: 5 }, deps);
  const k = kw.documents?.find((d) => !NOT_AREA.has(d.category_group_code));
  return k ? { lat: Number(k.y), lng: Number(k.x), label: k.place_name } : null;
}
