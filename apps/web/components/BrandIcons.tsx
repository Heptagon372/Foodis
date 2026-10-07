// 로그인 제공자 표시 (카카오 · Google · Instagram) — 로그인 버튼과 "연결된 계정" 목록이 같이 쓴다.
// 브랜드 가이드 색이라 테마 토큰을 쓰지 않는다 (카카오 노랑 · Google 4색 · 인스타 그라데이션은 라이트/다크 공통)
import type { LinkProvider } from "@/lib/auth/links";

/** 인스타그램 브랜드 그라데이션 (버튼·타일 바탕) */
export const INSTAGRAM_GRADIENT = "bg-[linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)]";

export function KakaoGlyph({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#000"
        d="M12 3.5c-5.25 0-9.5 3.3-9.5 7.36 0 2.62 1.75 4.92 4.4 6.22-.15.52-.94 3.3-.97 3.52 0 0-.02.16.09.22.1.06.23.01.23.01.3-.04 3.48-2.28 4.03-2.67.56.08 1.13.12 1.72.12 5.25 0 9.5-3.3 9.5-7.4S17.25 3.5 12 3.5Z"
        opacity=".9"
      />
    </svg>
  );
}

export function GoogleGlyph({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

/** 인스타그램 표시 — 둥근 네모 카메라 선 그림. 색은 글자색(currentColor)을 따른다 */
export function InstagramGlyph({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5.2" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.3" cy="6.7" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 목록용 정사각 타일 36px */
export function BrandTile({ provider }: { provider: LinkProvider }) {
  const tile = "grid size-9 shrink-0 place-items-center rounded-xl";
  if (provider === "kakao")
    return (
      <span className={`${tile} bg-[#FEE500]`} aria-hidden>
        <KakaoGlyph />
      </span>
    );
  if (provider === "google")
    return (
      <span className={`${tile} border border-[#dadce0] bg-white`} aria-hidden>
        <GoogleGlyph className="size-[18px]" />
      </span>
    );
  return (
    <span className={`${tile} ${INSTAGRAM_GRADIENT} text-white`} aria-hidden>
      <InstagramGlyph />
    </span>
  );
}
