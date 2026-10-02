// 쿠폰·이벤트·공동구매·포장 혜택 (docs/design/12 §데이터 출처). 공식 API 가 없어 우리 DB(사장님·어드민 등록 + 이용자 제보)에서만 온다.
// 원칙: 지어내지 않는다 · 출처와 확인 날짜를 붙인다 · 기간이 지난 혜택은 숨긴다.
import type { OfferKind, OfferRow, OfferSource, OfferView } from "./types";

export const OFFER_KINDS: OfferKind[] = ["coupon", "event", "group_buy", "takeout"];
export const OFFER_LABEL: Record<OfferKind | "info", string> = { coupon: "쿠폰", event: "이벤트", group_buy: "공동구매", takeout: "포장 가능", info: "정보 정정" };
const SOURCE_LABEL: Record<OfferSource, string> = { owner: "사장님 등록", admin: "푸디 확인", report: "이용자 제보" };

const KST = "Asia/Seoul";
/** "10월 2일" — 서버(UTC)에서 만들어도 한국 날짜로 */
export const koDate = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric" }).format(new Date(iso));
/** "10/31" — 배지용 짧은 날짜 */
export const shortDate = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: KST, month: "numeric", day: "numeric" }).formatToParts(new Date(iso));
  return `${p.find((x) => x.type === "month")?.value}/${p.find((x) => x.type === "day")?.value}`;
};

/** 어드민이 고른 날짜(YYYY-MM-DD)를 한국 시간 그날 끝(23:59:59)으로 — "10/31까지"는 31일 밤까지 유효 */
export const endOfDayKst = (ymd: string) => new Date(`${ymd}T23:59:59+09:00`).toISOString();
export const startOfDayKst = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`).toISOString();

export function offerState(o: Pick<OfferRow, "starts_at" | "ends_at">, now = new Date()): "active" | "upcoming" | "expired" {
  if (o.ends_at && new Date(o.ends_at).getTime() < now.getTime()) return "expired";
  if (o.starts_at && new Date(o.starts_at).getTime() > now.getTime()) return "upcoming";
  return "active";
}

export function sourceLabel(o: Pick<OfferRow, "source" | "verified" | "verified_at" | "created_at">): string {
  if (!o.verified) return `${SOURCE_LABEL[o.source]} · 확인 전`;
  const when = o.verified_at ?? o.created_at;
  return `${SOURCE_LABEL[o.source]} · ${koDate(when)} 확인`;
}

/**
 * DB 행 → 화면용. 지난 혜택·정보 정정 제보는 빼고, 확인 전 제보는 제목을 지운다.
 * 같은 종류가 여럿이면 확인된 것 → 곧 끝나는 것 순.
 */
export function toOfferViews(rows: OfferRow[], now = new Date()): OfferView[] {
  const out: OfferView[] = [];
  for (const r of rows) {
    if (r.kind === "info") continue;
    const state = offerState(r, now);
    if (state === "expired") continue;
    out.push({ kind: r.kind, state, title: r.verified ? r.title : null, starts_at: r.starts_at, ends_at: r.ends_at, verified: r.verified, source_label: sourceLabel(r) });
  }
  const end = (o: OfferView) => (o.ends_at ? new Date(o.ends_at).getTime() : Infinity);
  return out.sort((a, b) => Number(b.verified) - Number(a.verified) || end(a) - end(b));
}

/** 필터·배지 기준: 지금 유효하고 확인된 혜택만. 확인 전 제보는 "제보 있음"으로만 보여준다 */
export const hasActiveVerified = (offers: OfferView[], kind: OfferKind) => offers.some((o) => o.kind === kind && o.verified && o.state === "active");

/** 배지 문구: "쿠폰 ~10/31", "이벤트 10/5부터", "공동구매" */
export function offerBadge(o: OfferView): string {
  const base = OFFER_LABEL[o.kind];
  if (o.state === "upcoming" && o.starts_at) return `${base} ${shortDate(o.starts_at)}부터`;
  return o.ends_at ? `${base} ~${shortDate(o.ends_at)}` : base;
}
