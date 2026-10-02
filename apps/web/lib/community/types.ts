// 커뮤니티 데이터 모양 — 저장소(store) 행 · API 입력 검증(zod) · 화면용 뷰. 서버·클라이언트 공용 (서버 전용 import 금지)
import { z } from "zod";
import { CATEGORY_KEYS, type CategoryKey } from "./categories";

export const LIMITS = { title: 60, body: 2000, place: 60, comment: 500, photos: 4, pollOptions: 5, pollOption: 30, pollQuestion: 60, capacity: 20 } as const;
/** 사진 1장 상한 (브라우저가 1280px JPEG 로 줄여서 보낸다) */
export const PHOTO_MAX_BYTES = 1.5 * 1024 * 1024;

export type Photo = { url: string; credit?: string | null };
export type Poll = { question: string | null; options: string[] };

/** 저장소 행 (작성자 key 는 서버 안에서만 — 화면으로 내보내지 않는다) */
export type PostRow = {
  id: string;
  /** 모임 안 글이면 모임 id, 게시판 글이면 null */
  club_id: string | null;
  author_key: string;
  author_name: string;
  category: CategoryKey;
  title: string;
  body: string;
  place: string | null;
  meet_at: string | null;
  capacity: number | null;
  photos: Photo[];
  poll: Poll | null;
  food_slugs: string[];
  country_codes: string[];
  like_count: number;
  comment_count: number;
  join_count: number;
  created_at: string;
};

export type CommentRow = { id: string; post_id: string; author_key: string; author_name: string; body: string; created_at: string };

/** 이 글에 대한 보는 사람의 상태 */
export type ViewerState = { liked: boolean; joined: boolean; vote: number | null };

export type TagLink = { slug: string; name_ko: string };

/** 화면용 글 — 피드·상세 공용 */
export type PostView = Omit<PostRow, "author_key" | "food_slugs"> & {
  foods: TagLink[];
  poll_counts: number[] | null;
  mine: boolean;
  viewer: ViewerState;
  /** AI 맞춤 피드에서 이 글을 올린 이유 ("자주 보는 할랄 모임" 등). 최신·인기 순에서는 null */
  reason: string | null;
};
export type CommentView = Omit<CommentRow, "author_key"> & { mine: boolean };

export const SIGNAL_KINDS = ["tap", "view", "like", "comment", "vote", "join", "post", "share"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];
export type Signal = { kind: SignalKind; category: CategoryKey | null; post_id: string | null; at: string };

// ── API 입력
const oneLine = (max: number) => z.string().trim().min(1).max(max).transform((s) => s.replace(/\s+/g, " "));

export const NewPostInput = z
  .object({
    category: z.enum(CATEGORY_KEYS),
    club_id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional(),
    title: z.string().trim().min(2, "제목은 2자 이상").max(LIMITS.title),
    body: z.string().trim().min(1, "내용을 적어 주세요").max(LIMITS.body),
    place: oneLine(LIMITS.place).optional(),
    meet_at: z.iso.datetime({ offset: true }).optional(),
    capacity: z.number().int().min(1).max(LIMITS.capacity).optional(),
    // data: 접두사 없는 base64 JPEG/PNG/WebP
    photos: z
      .array(z.object({ media_type: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().min(16).max(Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 8) }))
      .max(LIMITS.photos)
      .default([]),
    poll: z
      .object({
        question: oneLine(LIMITS.pollQuestion).optional(),
        options: z.array(oneLine(LIMITS.pollOption)).min(2, "투표 선택지는 2개 이상").max(LIMITS.pollOptions),
      })
      .optional(),
  })
  .refine((p) => !p.poll || new Set(p.poll.options).size === p.poll.options.length, { message: "투표 선택지가 겹쳐요", path: ["poll", "options"] })
  // 만날 시각·인원: 밥친구 글 또는 모임 안 글(정모)에서만
  .refine((p) => p.category === "buddy" || p.club_id !== undefined || (p.meet_at === undefined && p.capacity === undefined), { message: "만날 시각·인원은 밥친구·모임 글에서만", path: ["meet_at"] });
export type NewPostInput = z.infer<typeof NewPostInput>;

export const PostAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("like") }),
  z.object({ action: z.literal("join") }),
  z.object({ action: z.literal("vote"), option: z.number().int().min(0).max(LIMITS.pollOptions - 1) }),
  z.object({ action: z.literal("report"), reason: z.string().trim().max(200).optional() }),
]);
export type PostAction = z.infer<typeof PostAction>;

export const NewCommentInput = z.object({ body: z.string().trim().min(1, "댓글을 적어 주세요").max(LIMITS.comment) });

export const SORTS = ["foryou", "latest", "popular"] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABEL: Record<Sort, string> = { foryou: "AI 맞춤", latest: "최신", popular: "인기" };

/** 밥친구 글·모임 정모(만날 시각이 있는 모임 글)의 모집 상태 */
export function buddyState(p: Pick<PostRow, "category" | "meet_at" | "capacity" | "join_count"> & { club_id?: string | null }, now = Date.now()): "open" | "full" | "past" | null {
  if (p.category !== "buddy" && !(p.club_id && p.meet_at)) return null;
  if (p.meet_at && new Date(p.meet_at).getTime() < now - 60 * 60_000) return "past";
  if (p.capacity != null && p.join_count >= p.capacity) return "full";
  return "open";
}

// ── 모임 (카페형): 만들고 → 가입하고 → 안에서 글쓰기
export type ClubRow = {
  id: string;
  name: string;
  topic: CategoryKey;
  description: string;
  cover: Photo | null;
  owner_key: string;
  owner_name: string;
  member_count: number;
  post_count: number;
  last_post_at: string | null;
  created_at: string;
};
export type ClubView = Omit<ClubRow, "owner_key"> & { mine: boolean; joined: boolean; rising: boolean; recent: number };

export const CLUB_LIMITS = { name: 30, description: 300 } as const;

export const NewClubInput = z.object({
  name: z.string().trim().min(2, "모임 이름은 2자 이상").max(CLUB_LIMITS.name).transform((s) => s.replace(/\s+/g, " ")),
  topic: z.enum(CATEGORY_KEYS).refine((k) => k !== "buddy", "모임 주제를 골라 주세요"),
  description: z.string().trim().min(1, "모임 소개를 적어 주세요").max(CLUB_LIMITS.description),
  cover: z.object({ media_type: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().min(16).max(Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 8) }).optional(),
});
export type NewClubInput = z.infer<typeof NewClubInput>;
