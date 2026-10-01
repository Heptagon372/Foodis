"use client";
// Windows 는 국기 이모지 글꼴이 없어 🇰🇷 가 "KR" 글자로 보인다 → 국기가 디자인의 중심인 앱이라 필수.
// 국기를 지원하지 않는 브라우저에서만 Twemoji 국기 글꼴(자체 호스팅, 국기 코드 포인트만)을 주입한다.
import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill";
import { useEffect } from "react";

export function FlagPolyfill() {
  useEffect(() => {
    polyfillCountryFlagEmojis("Twemoji Country Flags", "/fonts/TwemojiCountryFlags.woff2");
  }, []);
  return null;
}
