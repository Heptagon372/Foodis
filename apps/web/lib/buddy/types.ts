// 푸랜드(밥친구 찾기) 데이터 모양 — 저장소 행 · API 입력 검증(zod) · 화면용 뷰. 서버·클라이언트 공용 (서버 전용 import 금지)
// 흐름: 푸랜드 ON(1~8시간, 내 정보 + 위치) → 켠 사람끼리만 지도에서 서로 보임 → 점을 눌러 정보 보기 → 대화하기(바로 연결) → 대화 종료
import { z } from "zod";

export const CUISINES = ["vegetarian", "korean", "chinese", "japanese"] as const;
export type Cuisine = (typeof CUISINES)[number];
export const CUISINE_LABEL: Record<Cuisine, string> = { vegetarian: "채식", korean: "한식", chinese: "중식", japanese: "일식" };

export const GENDERS = ["male", "female", "none"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<Gender, string> = { male: "남성", female: "여성", none: "비공개" };

export const BUDDY_LIMITS = { message: 60, chat: 500, minAge: 19, maxAge: 99, minHours: 1, maxHours: 8 } as const;
/** 지도에 보여 주는 반경 (m) */
export const NEARBY_RADIUS_M = 10_000;
/** 다른 사람에게 보여 주는 좌표는 소수 셋째 자리(약 110m)로 — 정확한 집 위치가 드러나지 않게 */
export const SHARE_DIGITS = 3;

export type BuddyProfile = { cuisines: Cuisine[]; message: string; age: number; gender: Gender };

/** 저장소 행 — 사용자당 하나. 끄면 on_until 을 지금으로 당긴다 (프로필은 다음에 켤 때 다시 쓴다) */
export type PresenceRow = BuddyProfile & {
  /** 화면에 내보내는 공개 id (user_key 는 서버 안에서만) */
  id: string;
  user_key: string;
  name: string;
  lat: number;
  lng: number;
  on_until: string;
  updated_at: string;
};

export type ChatRow = {
  id: string;
  a_key: string;
  b_key: string;
  a_name: string;
  b_name: string;
  /** 대화를 시작할 때의 프로필 (상대가 푸랜드를 꺼도 누구와 이야기하는지 보이게) */
  a_profile: BuddyProfile;
  b_profile: BuddyProfile;
  created_at: string;
  last_at: string;
  ended_at: string | null;
  ended_by: string | null;
};

export type MessageRow = { id: string; chat_id: string; sender_key: string; body: string; created_at: string };

// ── 화면용
export type BuddyView = BuddyProfile & {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance_m: number | null;
  updated_at: string;
  /** 미리보기 샘플 사용자 */
  sample: boolean;
};
export type MyBuddy = { on: boolean; on_until: string | null; profile: BuddyProfile | null; lat: number | null; lng: number | null };
export type ChatPartner = BuddyProfile & { name: string };
export type ChatView = {
  id: string;
  partner: ChatPartner;
  created_at: string;
  ended_at: string | null;
  ended_by_me: boolean;
  last: { body: string; mine: boolean; at: string } | null;
};
export type MessageView = { id: string; body: string; mine: boolean; created_at: string };

// ── API 입력
const coord = { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) };

export const BuddyProfileInput = z.object({
  cuisines: z
    .array(z.enum(CUISINES))
    .min(1, "원하는 음식 종류를 하나 이상 골라 주세요")
    .max(CUISINES.length)
    .transform((a) => [...new Set(a)]),
  message: z.string().trim().min(1, "한마디를 적어 주세요").max(BUDDY_LIMITS.message).transform((s) => s.replace(/\s+/g, " ")),
  age: z.number().int().min(BUDDY_LIMITS.minAge, `푸랜드는 만 ${BUDDY_LIMITS.minAge}세 이상만 쓸 수 있어요`).max(BUDDY_LIMITS.maxAge),
  gender: z.enum(GENDERS),
});

export const BuddyAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("on"), hours: z.number().int().min(BUDDY_LIMITS.minHours).max(BUDDY_LIMITS.maxHours), profile: BuddyProfileInput, ...coord }),
  z.object({ action: z.literal("off") }),
  z.object({ action: z.literal("locate"), ...coord }),
]);
export type BuddyAction = z.infer<typeof BuddyAction>;

export const StartChatInput = z.object({ to: z.string().regex(/^[A-Za-z0-9:-]{1,64}$/) });

export const ChatAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), body: z.string().trim().min(1, "메시지를 적어 주세요").max(BUDDY_LIMITS.chat) }),
  z.object({ action: z.literal("end") }),
]);
export type ChatAction = z.infer<typeof ChatAction>;

export const isOn = (p: Pick<PresenceRow, "on_until"> | null | undefined, now = Date.now()) => Boolean(p && Date.parse(p.on_until) > now);

/** "2시간 15분 남음" · "40분 남음" */
export function remainLabel(untilIso: string, now = Date.now()): string {
  const m = Math.max(0, Math.ceil((Date.parse(untilIso) - now) / 60_000));
  if (m < 60) return `${m}분 남음`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}시간 ${m % 60}분 남음` : `${h}시간 남음`;
}
