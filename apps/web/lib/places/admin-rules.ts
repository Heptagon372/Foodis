// 어드민 음식점·혜택 입력 규칙 (순수 — 테스트 가능). 라우트: /api/admin/places/*
import { z } from "zod";

/** "https://place.map.kakao.com/12345", "http://place.map.kakao.com/12345?x=1", "12345" → "12345" */
export function parseKakaoPlaceId(input: string): string | null {
  const s = input.trim();
  if (/^\d{1,20}$/.test(s)) return s;
  const m = s.match(/^https?:\/\/(?:m\.)?place\.map\.kakao\.com\/(?:m\/)?(\d{1,20})(?:[/?#].*)?$/);
  return m ? m[1] : null;
}

const ymd = z.iso.date();

export const OfferInput = z
  .object({
    place: z.string().min(1),
    kind: z.enum(["coupon", "event", "group_buy", "takeout"]),
    title: z.string().trim().min(1).max(80),
    detail: z.string().trim().max(500).optional(),
    starts_on: ymd.optional(),
    ends_on: ymd.optional(),
    source: z.enum(["owner", "admin"]),
  })
  .superRefine((o, ctx) => {
    if (!parseKakaoPlaceId(o.place)) ctx.addIssue({ code: "custom", path: ["place"], message: "카카오 장소 id 또는 place.map.kakao.com 링크를 넣어 주세요" });
    // 쿠폰·이벤트는 언제까지인지가 핵심 정보 — 마감일 없이 올리면 지난 혜택이 계속 보인다
    if ((o.kind === "coupon" || o.kind === "event") && !o.ends_on) ctx.addIssue({ code: "custom", path: ["ends_on"], message: "쿠폰·이벤트는 마감일이 필요해요" });
    if (o.starts_on && o.ends_on && o.ends_on < o.starts_on) ctx.addIssue({ code: "custom", path: ["ends_on"], message: "마감일이 시작일보다 빨라요" });
  });
export type OfferInput = z.infer<typeof OfferInput>;

/** 사장님·어드민이 직접 받은 음식점 정보 (카카오 응답 복사 금지 — 0005 마이그레이션 주석) */
export const RestaurantInput = z
  .object({
    place: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    address: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(30).optional(),
    lat: z.number().min(33).max(38.9).optional(),
    lng: z.number().min(124.5).max(132).optional(),
    info_source: z.enum(["owner", "admin"]),
    food: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
  })
  .superRefine((r, ctx) => {
    if (!parseKakaoPlaceId(r.place)) ctx.addIssue({ code: "custom", path: ["place"], message: "카카오 장소 id 또는 place.map.kakao.com 링크를 넣어 주세요" });
    if ((r.lat == null) !== (r.lng == null)) ctx.addIssue({ code: "custom", path: ["lat"], message: "위도·경도는 함께 넣어 주세요" });
  });
export type RestaurantInput = z.infer<typeof RestaurantInput>;
