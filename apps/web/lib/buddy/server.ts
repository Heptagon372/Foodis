// 푸랜드 라우트 공용 (서버 전용): 저장소 고르기 · 화면용 변환. 보는 사람 확인은 커뮤니티와 같은 getViewer 를 쓴다
import "server-only";
import { hasSupabaseKeys } from "@/lib/content";
import { supabaseAdmin } from "@/lib/db/supabase-server";
import { distanceM, roundCoord, type LatLng } from "@/lib/places/geo";
import { memoryBuddyStore, type BuddyStore } from "./store";
import { supabaseBuddyStore } from "./supabase-store";
import { SHARE_DIGITS, type BuddyProfile, type BuddyView, type ChatRow, type ChatView, type MessageRow, type MessageView, type MyBuddy, type PresenceRow, isOn } from "./types";

// 키 + 0008 테이블이 있으면 Supabase, 아니면 메모리(샘플 푸랜드). 1분마다 다시 확인
let checked: { at: number; live: boolean } | null = null;
const g = globalThis as typeof globalThis & { __foodisBuddy?: BuddyStore };

async function live(): Promise<boolean> {
  if (!hasSupabaseKeys()) return false;
  if (checked && Date.now() - checked.at < 60_000) return checked.live;
  const { error } = await supabaseAdmin().from("buddy_presence").select("id").limit(1);
  checked = { at: Date.now(), live: !error };
  return checked.live;
}

export async function getBuddyStore(): Promise<BuddyStore> {
  if (await live()) return supabaseBuddyStore(supabaseAdmin());
  return (g.__foodisBuddy ??= memoryBuddyStore({ samples: true }));
}

export const profileOf = (p: PresenceRow): BuddyProfile => ({ cuisines: p.cuisines, message: p.message, age: p.age, gender: p.gender });

export function toMine(p: PresenceRow | null): MyBuddy {
  return { on: isOn(p), on_until: isOn(p) ? p!.on_until : null, profile: p ? profileOf(p) : null, lat: isOn(p) ? p!.lat : null, lng: isOn(p) ? p!.lng : null };
}

/** 남에게 보여 줄 때는 좌표를 반올림한다 (약 110m) */
export function toBuddyView(p: PresenceRow, me: LatLng | null): BuddyView {
  const at = roundCoord(p, SHARE_DIGITS);
  return { ...profileOf(p), id: p.id, name: p.name, ...at, distance_m: me ? distanceM(me, at) : null, updated_at: p.updated_at, sample: p.user_key.startsWith("sample:") };
}

export function toChatView(c: ChatRow, me: string, last: MessageRow | undefined): ChatView {
  const a = c.a_key === me;
  return {
    id: c.id,
    partner: a ? { name: c.b_name, ...c.b_profile } : { name: c.a_name, ...c.a_profile },
    created_at: c.created_at,
    ended_at: c.ended_at,
    ended_by_me: c.ended_by === me,
    last: last ? { body: last.body, mine: last.sender_key === me, at: last.created_at } : null,
  };
}

export const toMessageView = (m: MessageRow, me: string): MessageView => ({ id: m.id, body: m.body, mine: m.sender_key === me, created_at: m.created_at });

export const isMember = (c: ChatRow, key: string) => c.a_key === key || c.b_key === key;
