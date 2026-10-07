import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { AccountSync } from "@/components/AccountSync";
import { AppFrame } from "@/components/AppFrame";
import { FoodiProvider } from "@/components/FoodiSheet";
import { QuestToast } from "@/components/QuestToast";
import { RadioMini } from "@/components/RadioMini";
import { SWRegister } from "@/components/SWRegister";
import { TabBar } from "@/components/TabBar";
import { Tracker } from "@/components/Tracker";
import { FLAG_SCRIPT } from "@/lib/client/flags";
import { THEME_COLOR, THEME_SCRIPT } from "@/lib/client/theme";
import "./globals.css";

// 본문: Wanted Sans (한글) → Inter (영문) / 제목: SUIT (font-display) / 워드마크·영문 이탤릭 강조: Fraunces (font-serif) — 디자인 v2 (docs/design/09)
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["600", "700"], style: ["normal", "italic"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FOODIS — Different Cultures, One Table",
  description: "푸디에게 물어보세요. 세계 음식 문화를 음성으로 탐험하는 플랫폼.",
};

// 상단 바 색: 기본은 라이트, 새싹 토글로 고르면 THEME_SCRIPT·setTheme 가 덮어쓴다
export const viewport: Viewport = {
  themeColor: THEME_COLOR.light,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* 그리기 전에 테마를 정해 깜빡임이 없게 (data-theme 은 서버 HTML 에 없으므로 html 의 하이드레이션 경고는 끈다) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* 국기 이모지가 없는 브라우저(Windows)만 국기 글꼴을 그리기 전에 연결 — 첫 화면에 "KR" 글자가 비치지 않게 (lib/client/flags.ts) */}
        <script dangerouslySetInnerHTML={{ __html: FLAG_SCRIPT }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        {/* 본문 Wanted Sans Variable(둥글고 친근) · 제목 SUIT Variable(기하학적·또렷) — 둘 다 한글 서브셋 분할 로드 (docs/design/09 §글꼴 갱신) */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/variable/woff2/SUIT-Variable.css" />
      </head>
      <body className="antialiased">
        <SWRegister />
        <AccountSync />
        <Tracker />
        <FoodiProvider>
          <AppFrame>{children}</AppFrame>
          <RadioMini />
          <QuestToast />
          <TabBar />
        </FoodiProvider>
      </body>
    </html>
  );
}
