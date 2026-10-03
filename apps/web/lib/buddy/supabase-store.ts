// BuddyStore 의 Supabase 구현 (service_role — 라우트가 로그인·권한을 확인한 뒤에만). 스키마: 0008_buddy.sql
// user_key = auth.users.id (운영은 로그인 사용자만 켤 수 있다)
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { boundsAround, distanceM } from "@/lib/places/geo";
import { ENDED_KEEP_MS, type BuddyStore } from "./store";
import type { BuddyProfile, ChatRow, MessageRow, PresenceRow } from "./types";

const P_COLS = "user_id, id, name, cuisines, message, age, gender, lat, lng, on_until, updated_at";
type DbPresence = Omit<PresenceRow, "user_key"> & { user_id: string };
const toPresence = ({ user_id, ...p }: DbPresence): PresenceRow => ({ ...p, user_key: user_id });

const C_COLS = "id, a_id, b_id, a_name, b_name, a_profile, b_profile, created_at, last_at, ended_at, ended_by";
type DbChat = Omit<ChatRow, "a_key" | "b_key"> & { a_id: string; b_id: string };
const toChat = ({ a_id, b_id, ...c }: DbChat): ChatRow => ({ ...c, a_key: a_id, b_key: b_id });

const M_COLS = "id, chat_id, sender_id, body, created_at";
type DbMessage = Omit<MessageRow, "sender_key"> & { sender_id: string };
const toMessage = ({ sender_id, ...m }: DbMessage): MessageRow => ({ ...m, sender_key: sender_id });

const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export function supabaseBuddyStore(db: SupabaseClient): BuddyStore {
  const chat = async (id: string) => {
    const d = must(await db.from("buddy_chats").select(C_COLS).eq("id", id).maybeSingle()) as DbChat | null;
    return d ? toChat(d) : null;
  };
  const openBetween = async (x: string, y: string) => {
    const d = must(await db.from("buddy_chats").select(C_COLS).is("ended_at", null).or(`and(a_id.eq.${x},b_id.eq.${y}),and(a_id.eq.${y},b_id.eq.${x})`).limit(1).maybeSingle()) as DbChat | null;
    return d ? toChat(d) : null;
  };

  return {
    mode: "live",
    async getPresence(key) {
      const d = must(await db.from("buddy_presence").select(P_COLS).eq("user_id", key).maybeSingle()) as DbPresence | null;
      return d ? toPresence(d) : null;
    },
    async getPresenceById(id) {
      const d = must(await db.from("buddy_presence").select(P_COLS).eq("id", id).maybeSingle()) as DbPresence | null;
      return d ? toPresence(d) : null;
    },
    async upsertPresence({ user_key, ...p }) {
      const d = must(await db.from("buddy_presence").upsert({ ...p, user_id: user_key, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select(P_COLS).single()) as DbPresence;
      return toPresence(d);
    },
    async setOff(key) {
      must(await db.from("buddy_presence").update({ on_until: new Date().toISOString() }).eq("user_id", key));
    },
    async locate(key, at) {
      const now = new Date().toISOString();
      const d = must(await db.from("buddy_presence").update({ lat: at.lat, lng: at.lng, updated_at: now }).eq("user_id", key).gt("on_until", now).select(P_COLS).maybeSingle()) as DbPresence | null;
      return d ? toPresence(d) : null;
    },
    async listActive({ near, radiusM, exclude, limit }) {
      const b = boundsAround(near, radiusM);
      const rows = must(
        await db
          .from("buddy_presence")
          .select(P_COLS)
          .gt("on_until", new Date().toISOString())
          .neq("user_id", exclude)
          .gte("lat", b.minLat)
          .lte("lat", b.maxLat)
          .gte("lng", b.minLng)
          .lte("lng", b.maxLng)
          .limit(500),
      ) as DbPresence[];
      return rows
        .map(toPresence)
        .map((p) => ({ p, d: distanceM(near, p) }))
        .filter((x) => x.d <= radiusM)
        .sort((x, y) => x.d - y.d)
        .slice(0, limit)
        .map((x) => x.p);
    },
    async openChat(a, b) {
      const open = await openBetween(a.key, b.key);
      if (open) return open;
      const r = await db
        .from("buddy_chats")
        .insert({ a_id: a.key, b_id: b.key, a_name: a.name, b_name: b.name, a_profile: a.profile satisfies BuddyProfile, b_profile: b.profile })
        .select(C_COLS)
        .single();
      // 동시에 서로 말을 걸었으면(유일 인덱스 충돌) 먼저 만들어진 대화로
      if (r.error?.code === "23505") {
        const again = await openBetween(a.key, b.key);
        if (again) return again;
      }
      return toChat(must(r) as DbChat);
    },
    getChat: chat,
    async listChats(key, limit) {
      const since = Date.now() - ENDED_KEEP_MS;
      const rows = must(await db.from("buddy_chats").select(C_COLS).or(`a_id.eq.${key},b_id.eq.${key}`).order("last_at", { ascending: false }).limit(limit * 3)) as DbChat[];
      return rows
        .map(toChat)
        .filter((c) => !c.ended_at || Date.parse(c.ended_at) > since)
        .slice(0, limit);
    },
    async lastMessages(ids) {
      const m = new Map<string, MessageRow>();
      // 대화 수가 적어(최대 20) 대화마다 마지막 하나씩
      await Promise.all(
        ids.map(async (id) => {
          const d = must(await db.from("buddy_messages").select(M_COLS).eq("chat_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()) as DbMessage | null;
          if (d) m.set(id, toMessage(d));
        }),
      );
      return m;
    },
    async listMessages(chatId, after, limit) {
      let q = db.from("buddy_messages").select(M_COLS).eq("chat_id", chatId).order("created_at", { ascending: false }).limit(limit);
      if (after) q = q.gt("created_at", after);
      return (must(await q) as DbMessage[]).map(toMessage).reverse();
    },
    async addMessage({ sender_key, ...m }) {
      const c = await chat(m.chat_id);
      if (!c || c.ended_at) return "ended";
      return toMessage(must(await db.from("buddy_messages").insert({ ...m, sender_id: sender_key }).select(M_COLS).single()) as DbMessage);
    },
    async endChat(id, key) {
      const c = await chat(id);
      if (!c || (c.a_key !== key && c.b_key !== key)) return null;
      if (c.ended_at) return c;
      const d = must(await db.from("buddy_chats").update({ ended_at: new Date().toISOString(), ended_by: key }).eq("id", id).is("ended_at", null).select(C_COLS).maybeSingle()) as DbChat | null;
      return d ? toChat(d) : await chat(id);
    },
  };
}
