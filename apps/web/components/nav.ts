// 메뉴 카테고리 한 곳에서 정의 — 데스크톱 상단 내비·푸터·모바일 하단 탭·홈 바로가기가 모두 이 표를 쓴다 (따로 놀지 않게)
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; /** 이 경로들 아래에 있어도 이 메뉴가 켜진다 */ also?: string[] };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "탐험",
    items: [
      { href: "/", label: "홈", icon: "home", also: ["/food", "/journey", "/taste", "/ingredient"] },
      { href: "/map", label: "세계 지도", icon: "map", also: ["/country"] },
      { href: "/eats", label: "맛집탐방", icon: "map-pinned" },
      { href: "/radio", label: "라디오", icon: "headphones" },
    ],
  },
  {
    title: "함께",
    items: [
      { href: "/community", label: "커뮤니티", icon: "users" },
      { href: "/news", label: "음식 뉴스", icon: "newspaper" },
    ],
  },
  {
    title: "내 기록",
    items: [
      { href: "/passport", label: "Passport", icon: "passport" },
      { href: "/passport/table", label: "My Table", icon: "table" },
      { href: "/quests", label: "퀘스트", icon: "quest" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "설정", icon: "settings" };

/** 데스크톱 상단 메뉴 알약: 탐험 + 함께 */
export const DESK_PRIMARY: NavItem[] = NAV_GROUPS.filter((g) => g.title !== "내 기록").flatMap((g) => g.items);
/** 데스크톱 계정 알약 드롭다운: 내 기록 + 취향·식단 바로 가기 */
export const ACCOUNT_ITEMS: NavItem[] = [
  ...NAV_GROUPS.find((g) => g.title === "내 기록")!.items,
  { href: "/passport#taste", label: "내 취향", icon: "sparkle" },
  { href: "/settings#diet", label: "식단 설정", icon: "salad" },
];
/** 이 화면들에 있으면 계정 알약이 켜진다 */
export const ACCOUNT_ACTIVE = ["/passport", "/passport/table", "/quests", "/settings"];
/** 사이트 푸터 링크 열 — 실제 있는 경로만 (/demo · /admin · /onboarding 은 넣지 않는다) */
export const FOOTER_COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  { title: "탐험", links: [{ href: "/", label: "홈" }, { href: "/map", label: "세계 지도" }, { href: "/eats", label: "맛집탐방" }, { href: "/radio", label: "라디오" }, { href: "/journey/mandu", label: "음식의 여정" }] },
  { title: "함께", links: [{ href: "/community", label: "커뮤니티" }, { href: "/community?tab=buddy", label: "푸랜드 밥친구" }, { href: "/community?tab=clubs", label: "모임" }, { href: "/news", label: "음식 뉴스" }] },
  { title: "내 기록", links: [{ href: "/passport", label: "Passport" }, { href: "/passport/table", label: "My Table" }, { href: "/quests", label: "퀘스트" }, { href: "/settings", label: "설정" }, { href: "/login", label: "로그인" }] },
  {
    title: "출처 · 크레딧",
    links: [
      { href: "https://www.wikidata.org", label: "Wikidata", external: true },
      { href: "https://ko.wikipedia.org", label: "Wikipedia", external: true },
      { href: "https://commons.wikimedia.org", label: "Wikimedia Commons", external: true },
      { href: "https://openverse.org", label: "Openverse", external: true },
    ],
  },
];

const ALL = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

/** 지금 경로에 켜질 메뉴 하나 — 가장 길게 맞는 경로가 이긴다 (/passport/table 은 Passport 가 아니라 My Table) */
export function activeHref(path: string, items: NavItem[] = ALL): string | null {
  let best: { href: string; len: number } | null = null;
  for (const it of items) {
    for (const p of [it.href, ...(it.also ?? [])]) {
      const hit = p === "/" ? path === "/" : path === p || path.startsWith(`${p}/`);
      if (hit && (!best || p.length > best.len)) best = { href: it.href, len: p.length };
    }
  }
  return best?.href ?? null;
}

/** 셸(상단 내비·푸터·탭 바)을 숨기는 화면 — 첫 진입 흐름과 어드민 */
export const isBareRoute = (path: string) => ["/onboarding", "/intro", "/admin", "/login"].some((p) => path.startsWith(p));
