import Link from "next/link";

// 404 — "지도에 없는 곳"도 다음 탐험으로 (막다른 화면 금지 원칙)
export default function NotFound() {
  return (
    <main className="flex min-h-[80dvh] flex-col items-center justify-center gap-6 px-8 text-center">
      <span className="text-6xl" aria-hidden>
        🗺️
      </span>
      <div className="space-y-2">
        <h1 className="font-display text-h1 font-semibold">이곳은 아직 지도에 없어요</h1>
        <p className="text-sm text-muted">주소가 바뀌었거나, 아직 검수되지 않은 음식일 수 있어요.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className="rounded-full bg-green-800 px-5 py-3 font-semibold text-ivory">
          홈에서 다시 떠나기
        </Link>
        <Link href="/passport" className="rounded-full border border-line bg-surface px-5 py-3 font-semibold">
          내 Passport
        </Link>
      </div>
    </main>
  );
}
