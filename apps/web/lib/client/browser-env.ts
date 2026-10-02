"use client";
// 마이크가 안 될 때 "어디서 뭘 눌러야 하는지"를 알려 주려면 지금 어떤 브라우저인지 알아야 한다.
// 공유 링크는 대부분 카카오톡·인스타그램 인앱 브라우저로 처음 열린다 (07 문서 성장 루프) — 이 경우 마이크가 막혀 있는 일이 많다.

export type InApp = "kakaotalk" | "instagram" | "facebook" | "naver" | "line" | "band" | "everytime";
export type BrowserEnv = { os: "ios" | "android" | "other"; inApp: InApp | null; secure: boolean };

const IN_APP: [RegExp, InApp][] = [
  [/KAKAOTALK/i, "kakaotalk"],
  [/Instagram/i, "instagram"],
  [/FBAN|FBAV|FB_IAB/i, "facebook"],
  [/NAVER\(inapp/i, "naver"],
  [/\bLine\//i, "line"],
  [/BAND\//i, "band"],
  [/everytimeApp/i, "everytime"],
];

export const IN_APP_LABEL: Record<InApp, string> = {
  kakaotalk: "카카오톡",
  instagram: "인스타그램",
  facebook: "페이스북",
  naver: "네이버 앱",
  line: "라인",
  band: "밴드",
  everytime: "에브리타임",
};

export function detectEnv(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): BrowserEnv {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  const os = ios ? "ios" : /Android/i.test(ua) ? "android" : "other";
  const inApp = IN_APP.find(([re]) => re.test(ua))?.[1] ?? null;
  // getUserMedia 는 https(또는 localhost)에서만 — 같은 와이파이 휴대폰으로 http://192.168.x.x 를 열면 여기서 막힌다
  const secure = typeof window === "undefined" ? true : window.isSecureContext;
  return { os, inApp, secure };
}

/** 외부 브라우저로 여는 링크. 안 되는 환경이면 null → 링크 복사로 안내 */
export function externalOpenUrl(env: BrowserEnv, url: string): string | null {
  if (env.inApp === "kakaotalk") return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  if (env.os === "android" && env.inApp) {
    const u = new URL(url);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;end`;
  }
  return null;
}

/** 지금 환경에서 마이크 권한을 다시 켜는 순서 (짧게, 3단계 이내).
 *  기호·이모지 아이콘 대신 말로 — 화면 읽기 프로그램도 읽고, 기기마다 다른 아이콘 모양에 기대지 않게 */
export function micSteps(env: BrowserEnv): string[] {
  if (!env.secure) return ["이 주소(http)에서는 브라우저가 마이크를 막아요", "https 주소나 이 컴퓨터의 localhost 로 열어 주세요"];
  if (env.inApp) {
    return env.os === "ios"
      ? [`${IN_APP_LABEL[env.inApp]} 화면 오른쪽 아래(또는 위) 점 세 개(더보기) 버튼`, "‘Safari로 열기’ 또는 ‘기본 브라우저로 열기’", "Safari 에서 마이크 버튼을 누르고 ‘허용’"]
      : [`${IN_APP_LABEL[env.inApp]} 화면 오른쪽 위 세로 점 세 개(더보기) 버튼`, "‘다른 브라우저로 열기’ → Chrome", "Chrome 에서 마이크 버튼을 누르고 ‘허용’"];
  }
  if (env.os === "ios") return ["주소창 왼쪽 ‘가가’(또는 ‘aA’) 버튼", "‘웹 사이트 설정’ → 마이크 → ‘허용’", "돌아와서 마이크 버튼 다시 누르기"];
  if (env.os === "android") return ["주소창 왼쪽 자물쇠(또는 설정 톱니바퀴) 버튼", "‘권한’ → 마이크 → ‘허용’", "돌아와서 마이크 버튼 다시 누르기"];
  return ["주소창 왼쪽 자물쇠(사이트 정보) 버튼", "마이크 → ‘허용’", "새로고침 후 마이크 버튼 다시 누르기"];
}
