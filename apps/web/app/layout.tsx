import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { FlagPolyfill } from "@/components/FlagPolyfill";
import { FoodiProvider } from "@/components/FoodiSheet";
import { TabBar } from "@/components/TabBar";
import "./globals.css";

// 워드마크·H1: Fraunces (여행·문화 톤 세리프) / 본문: Pretendard (한글), 영문 fallback Inter — 05 문서 §7
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["600", "700"], style: ["normal", "italic"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FOODIS — Different Cultures, One Table",
  description: "푸디에게 물어보세요. 세계 음식 문화를 음성으로 탐험하는 플랫폼.",
};

export const viewport: Viewport = { themeColor: "#FBF8F1", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${fraunces.variable} ${inter.variable}`}>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="antialiased">
        <FlagPolyfill />
        <FoodiProvider>
          <div className="mx-auto min-h-dvh max-w-md pb-28">{children}</div>
          <TabBar />
        </FoodiProvider>
      </body>
    </html>
  );
}
