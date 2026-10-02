// 사진 출처 표기 (위키미디어 공용 CC BY / BY-SA: 작가·라이선스·원본 링크 필수 — 데이터 소스 레지스트리 wikimedia_commons)
// image_credit 형식: "작가 / 라이선스 / 원본 URL" (foodis-data s07 과 같다)
/** link=false: 카드처럼 이미 링크 안에 있을 때 (a 안에 a 금지) — 원본 링크는 상세 화면에서 */
export function ImageCredit({ credit, className = "", link = true }: { credit: string | null | undefined; className?: string; link?: boolean }) {
  if (!credit) return null;
  const [artist, license, page] = credit.split(" / ").map((s) => s?.trim());
  const text = `사진 ${artist || "작자 미상"}${license ? ` · ${license}` : ""}`;
  const cls = `max-w-[62%] truncate rounded-full bg-shade/50 px-2 py-1 text-[11px] leading-4 text-white backdrop-blur ${className}`;
  return link && page?.startsWith("http") ? (
    <a href={page} target="_blank" rel="noreferrer" className={cls} title={credit} onClick={(e) => e.stopPropagation()}>
      {text}
    </a>
  ) : (
    <span className={cls} title={credit}>
      {text}
    </span>
  );
}
