// 공정거래위원회 가맹정보 — 브랜드 목록 OpenAPI (공공데이터포털). 어드민 "가맹 브랜드 동기화"에서만 부른다.
// 데이터셋: https://www.data.go.kr/data/15125467/openapi.do  "공정거래위원회_가맹정보_브랜드 목록 정보 제공 서비스" (확인일 2026-10-02)
//   GET https://apis.data.go.kr/1130000/FftcBrandRlsInfo2_Service/getBrandinfo
//   필수 파라미터: serviceKey · pageNo · numOfRows · resultType(json) · jngBizCrtraYr(가맹사업 기준년도)
//   응답 item: brandNm(브랜드명) · indutyLclasNm(업종 대분류: 외식/도소매/서비스) · indutyMlsfcNm(중분류) · jngBizCrtraYr · corpNm(법인명, 2024-12 추가 공지)
//   이용허락범위 제한 없음 · 개발계정 하루 10,000건
// 대표자 이름(jnghdqrtrsRprsvNm) 같은 개인 정보는 받아도 저장하지 않는다.
import { normalizeBrand } from "./franchise";
import type { FetchLike } from "./kakao";

export const FTC_BRAND_URL = "https://apis.data.go.kr/1130000/FftcBrandRlsInfo2_Service/getBrandinfo";
const ROWS = 1000;
const MAX_PAGES = 40; // 안전장치: 전 업종 브랜드가 1만여 개라 1,000줄씩이면 충분

type FtcItem = { brandNm?: string; indutyLclasNm?: string; indutyMlsfcNm?: string; corpNm?: string; jngBizCrtraYr?: string | number };
export type FranchiseBrandRow = { normalized: string; brand_name: string; company: string | null; industry: string | null; source_updated_at: string };

/** data.go.kr 응답은 { response: { body } } 로 감싸거나 바로 오기도 하고, item 이 1개면 배열이 아닐 수 있다 */
export function parseFtcPage(json: unknown): { items: FtcItem[]; total: number; resultCode: string | null } {
  const j = json as Record<string, unknown>;
  const body = ((j?.response as Record<string, unknown>)?.body ?? j) as Record<string, unknown>;
  const header = ((j?.response as Record<string, unknown>)?.header ?? j) as Record<string, unknown>;
  const raw = (body?.items as { item?: unknown } | unknown[] | undefined) ?? [];
  const item = Array.isArray(raw) ? raw : (raw as { item?: unknown }).item;
  const items = (Array.isArray(item) ? item : item ? [item] : []) as FtcItem[];
  return { items, total: Number(body?.totalCount ?? 0), resultCode: (header?.resultCode as string) ?? null };
}

/** 외식 업종만, 정규화 이름 기준 중복 제거 */
export function toBrandRows(items: FtcItem[], year: string): FranchiseBrandRow[] {
  const out = new Map<string, FranchiseBrandRow>();
  for (const it of items) {
    const name = it.brandNm?.trim();
    if (!name || (it.indutyLclasNm && it.indutyLclasNm.trim() !== "외식")) continue;
    const normalized = normalizeBrand(name);
    if (normalized.length < 2 || out.has(normalized)) continue;
    out.set(normalized, { normalized, brand_name: name, company: it.corpNm?.trim() || null, industry: it.indutyMlsfcNm?.trim() || null, source_updated_at: String(it.jngBizCrtraYr ?? year) });
  }
  return [...out.values()];
}

/** 기준년도 하나를 전부 받아온다. 공정위 공개는 해를 넘겨 이뤄져서 보통 작년·재작년 자료가 최신이다 */
export async function fetchFtcBrands(year: string, deps: { key: string; fetch?: FetchLike }): Promise<{ rows: FranchiseBrandRow[]; total: number; pages: number }> {
  const all: FtcItem[] = [];
  let total = 0;
  let pages = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({ serviceKey: deps.key, pageNo: String(page), numOfRows: String(ROWS), resultType: "json", jngBizCrtraYr: year });
    const res = await (deps.fetch ?? fetch)(`${FTC_BRAND_URL}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`공정위 가맹정보 API 오류 (${res.status})`);
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // 서비스키 오류는 JSON 이 아니라 XML(OpenAPI_ServiceResponse)로 온다
      throw new Error(/SERVICE_KEY|SERVICE KEY/i.test(text) ? "공정위 API 서비스키가 등록되지 않았거나 올바르지 않아요 (공공데이터포털 '일반 인증키(Decoding)' 사용)" : "공정위 API 응답을 읽지 못했어요");
    }
    const p = parseFtcPage(json);
    if (p.resultCode && !["00", "0", "000"].includes(String(p.resultCode))) throw new Error(`공정위 API 결과 코드 ${p.resultCode}`);
    pages++;
    total = p.total;
    all.push(...p.items);
    if (!p.items.length || all.length >= total) break;
  }
  return { rows: toBrandRows(all, year), total, pages };
}
