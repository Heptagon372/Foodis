// PWA 매니페스트 (/manifest.webmanifest) — 홈 화면에 추가하면 앱처럼 전체 화면으로 열린다. 오프라인은 public/sw.js (11 문서 §1)
// 아이콘: public/icons (지구 + 연두 궤도, 로고 색) · 마스커블은 안전 영역(가운데 80%) 안에 그림 · iOS 는 app/apple-icon.png
import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/client/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FOODIS — Different Cultures, One Table",
    short_name: "FOODIS",
    description: "푸디에게 물어보세요. 세계 음식 문화를 음성으로 탐험하는 플랫폼.",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    categories: ["food", "education", "travel"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
