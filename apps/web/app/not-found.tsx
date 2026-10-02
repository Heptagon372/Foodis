import Link from "next/link";
import { btn, IconTile } from "@/components/ui";

// 404 — "지도에 없는 곳"도 다음 탐험으로 (막다른 화면 금지 원칙)
export default function NotFound() {
  return (
    <main className="flex min-h-[80dvh] flex-col items-center justify-center gap-6 px-8 text-center">
      <IconTile icon="compass" tone="soft" size="lg" />
      <div className="space-y-2">
        <h1 className="text-h1 font-bold text-ink">이곳은 아직 지도에 없어요</h1>
        <p className="text-sm text-ink-soft">주소가 바뀌었거나, 아직 검수되지 않은 음식일 수 있어요.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={btn("primary")}>
          홈에서 다시 떠나기
        </Link>
        <Link href="/passport" className={btn("glass")}>
          내 Passport
        </Link>
      </div>
    </main>
  );
}
