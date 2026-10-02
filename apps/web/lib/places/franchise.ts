// 프랜차이즈(가맹 브랜드) 여부 — 공정거래위원회 가맹사업 정보공개서의 브랜드 목록과 음식점 이름을 맞춰 본다.
// 브랜드 목록은 어드민 "가맹 브랜드 동기화"로 franchise_brands 테이블에 받아 두고(ftc.ts), 여기서는 이름 맞추기만 한다(순수 함수).
// 맞으면 "가맹 브랜드 · 공정위 정보", 안 맞으면 "개인 음식점(추정)" — 목록에 없는 신생·미등록 브랜드가 있을 수 있어 '추정'이다.

/** 비교용 정규화: 괄호 내용·공백·기호 제거, 영문 소문자, 전각→반각 */
export function normalizeBrand(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
    .replace(/[\s·・&'’".,\-_/!~+:]/g, "");
}

// 지점 꼬리말: "강남역점", "본점", "2호점", "역삼1호점", "DDP점" … 마지막 토큰이 '점'으로 끝나면 지점명으로 본다
const BRANCH = /점$/;
// '점'으로 끝나도 지점이 아니라 가게 종류인 말 ("○○ 분식점", "○○ 순대국점", "홍콩반점") — 떼면 짧은 브랜드와 잘못 맞는다
const NOT_BRANCH = /(분식|음식|반|주|상|국밥|순대국|국수|만두)점$/;
const isBranch = (t: string) => BRANCH.test(t) && !NOT_BRANCH.test(t);
// 이름 자체가 '점'으로 끝나는 가게가 통째로 지워지지 않게, 토큰이 하나뿐이면 건드리지 않는다

/** "교촌치킨 강남역점" → "교촌치킨", "본죽(역삼점)" → "본죽" */
export function stripBranch(placeName: string): string {
  const noParen = placeName.normalize("NFKC").replace(/\([^)]*\)|\[[^\]]*\]/g, " ").trim();
  const tokens = noParen.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && isBranch(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

export type BrandIndex = Map<string, string>; // normalized → 표시용 브랜드 이름

export function buildBrandIndex(brands: { brand_name: string; normalized?: string | null }[]): BrandIndex {
  const idx: BrandIndex = new Map();
  for (const b of brands) {
    const n = b.normalized || normalizeBrand(b.brand_name);
    if (n.length >= 2 && !idx.has(n)) idx.set(n, b.brand_name);
  }
  return idx;
}

/** 접두어로 맞출 때 최소 길이 — "본가"처럼 짧은 브랜드가 "본가순대국" 같은 개인 가게까지 잡지 않게 */
export const MIN_PREFIX = 3;

/**
 * 음식점 이름(+ 카카오 분류 마지막 칸)이 가맹 브랜드인지.
 * 1) 지점명을 뗀 이름이 브랜드와 정확히 같으면 매칭
 * 2) 띄어쓰기 없이 붙은 지점명("미스터피자역삼점")은 브랜드 접두어 + 나머지가 '점'으로 끝날 때만 매칭
 * 3) 카카오 category_name 의 마지막 칸(체인은 브랜드명이 들어가는 경우가 많다)이 브랜드와 정확히 같으면 매칭
 */
export function matchFranchise(placeName: string, idx: BrandIndex, categoryName?: string | null): string | null {
  if (!idx.size) return null;
  const base = normalizeBrand(stripBranch(placeName));
  if (idx.has(base)) return idx.get(base)!;

  const full = normalizeBrand(placeName);
  for (let len = full.length - 1; len >= MIN_PREFIX; len--) {
    const head = full.slice(0, len);
    const rest = full.slice(len);
    if (idx.has(head) && isBranch(rest)) return idx.get(head)!;
  }

  // "음식점 > 한식 > 국밥"처럼 일반 분류는 3칸까지 — 4칸 이상일 때 마지막 칸만 브랜드 후보로 본다
  const parts = categoryName?.split(">").map((s) => s.trim()) ?? [];
  if (parts.length >= 4) {
    const n = normalizeBrand(parts[parts.length - 1]);
    if (n.length >= MIN_PREFIX && idx.has(n)) return idx.get(n)!;
  }
  return null;
}

/** 브랜드 목록이 비어 있으면(동기화 전) 판단하지 않는다 → null(모름) */
export function franchiseOf(placeName: string, idx: BrandIndex, categoryName?: string | null): { is: boolean | null; brand: string | null } {
  if (!idx.size) return { is: null, brand: null };
  const brand = matchFranchise(placeName, idx, categoryName);
  return { is: Boolean(brand), brand };
}

export const franchiseLabel = (f: { is: boolean | null }) => (f.is === true ? "가맹 브랜드 · 공정위 정보" : f.is === false ? "개인 음식점(추정)" : null);
