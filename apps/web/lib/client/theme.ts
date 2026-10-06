// 라이트/다크 테마: <html data-theme> 하나로 모든 토큰이 바뀐다 (app/globals.css).
// 첫 방문은 다크(v3 "Neon Night" 가 기본 얼굴 — docs/design/17), 새싹 토글을 누르면 그 선택을 이 기기에 기억한다.
// 그리기 전 깜빡임을 막는 초기화는 layout.tsx 의 THEME_SCRIPT 가 한다. (서버 레이아웃도 import 하므로 react 를 쓰지 않는다 — 훅은 ThemeToggle.tsx)

export type Theme = "light" | "dark";

const KEY = "foodis:theme";
/** 브라우저 상단 바 색 = 바탕색 (globals.css canvas 와 같은 값) */
export const THEME_COLOR: Record<Theme, string> = { light: "#F5F9F2", dark: "#050806" };

/** <head> 에 그대로 넣는 초기화 스크립트 — 저장된 선택 → 없으면 다크 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,t;try{t=localStorage.getItem("${KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){t="dark"}d.dataset.theme=t;document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",t==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}")})})()`;

const listeners = new Set<() => void>();
export const readTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function setTheme(next: Theme) {
  const apply = () => {
    document.documentElement.dataset.theme = next;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[next]));
    listeners.forEach((l) => l());
  };
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* 저장소 막힘 → 이번 방문에만 적용 */
  }
  // 바뀌는 순간을 부드럽게 (지원 브라우저 · 움직임 줄이기 아닐 때만)
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (vt && document.visibilityState === "visible" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const t = vt.call(document, apply) as { finished?: Promise<unknown>; ready?: Promise<unknown> } | undefined;
    // 빠르게 연타하거나 탭이 가려지면 전환이 건너뛰어진다 (AbortError) — 테마는 이미 바뀌었으니 조용히 넘긴다
    t?.ready?.catch(() => {});
    t?.finished?.catch(() => {});
  } else apply();
}

export function subscribeTheme(cb: () => void) {
  listeners.add(cb);
  // setTheme 을 거치지 않고 data-theme 이 바뀌어도(개발자 도구·테스트) 토글 그림이 따라가게
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    listeners.delete(cb);
    mo.disconnect();
  };
}
