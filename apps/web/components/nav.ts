// 메뉴 카테고리 한 곳에서 정의 — 데스크톱 사이드바·모바일 하단 탭·홈 바로가기가 모두 이 표를 쓴다 (따로 놀지 않게)
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; /** 이 경로들 아래에 있어도 이 메뉴가 켜진다 */ also?: string[] };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "탐험",
    items: [
      { href: "/", label: "홈", icon: "home", also: ["/food", "/journey", "/taste", "/ingredient"] },
      { href: "/map", label: "세계 지도", icon: "map", also: ["/country"] },
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

/** 셸(사이드바·탭 바)을 숨기는 화면 — 첫 진입 흐름과 어드민 */
export const isBareRoute = (path: string) => ["/onboarding", "/intro", "/admin", "/login"].some((p) => path.startsWith(p));
