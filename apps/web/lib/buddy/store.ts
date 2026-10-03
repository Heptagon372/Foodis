// 푸랜드 저장소 인터페이스 + 메모리 구현(미리보기·테스트용). 운영은 supabase-store.ts (0008_buddy.sql).
// 미리보기에는 샘플 푸랜드 6명이 '보는 사람 주변'에 떠 있고(조금씩 움직임), 말을 걸면 짧게 답한다 — 혼자 데모해도 흐름이 보이게.
import { distanceM, type LatLng } from "@/lib/places/geo";
import type { BuddyProfile, ChatRow, MessageRow, PresenceRow } from "./types";

export type Party = { key: string; name: string; profile: BuddyProfile };

export interface BuddyStore {
  readonly mode: "live" | "preview";
  getPresence(userKey: string): Promise<PresenceRow | null>;
  getPresenceById(id: string): Promise<PresenceRow | null>;
  /** 켜기 (있으면 프로필·위치·시간을 바꾸고 공개 id 는 그대로) */
  upsertPresence(p: Omit<PresenceRow, "id" | "updated_at">): Promise<PresenceRow>;
  setOff(userKey: string): Promise<void>;
  /** 켜져 있을 때만 위치를 바꾼다. 꺼져 있으면 null */
  locate(userKey: string, p: LatLng): Promise<PresenceRow | null>;
  /** 켜져 있는 사람들 (near 에서 radiusM 안, 가까운 순) */
  listActive(q: { near: LatLng; radiusM: number; exclude: string; limit: number }): Promise<PresenceRow[]>;
  /** 두 사람 사이 진행 중인 대화가 있으면 그것, 없으면 새로 */
  openChat(a: Party, b: Party): Promise<ChatRow>;
  getChat(id: string): Promise<ChatRow | null>;
  /** 내 대화 (진행 중 + 최근 하루 안에 끝난 것), 최근 순 */
  listChats(userKey: string, limit: number): Promise<ChatRow[]>;
  lastMessages(chatIds: string[]): Promise<Map<string, MessageRow>>;
  /** after 보다 뒤 메시지, 오래된 순 */
  listMessages(chatId: string, after: string | null, limit: number): Promise<MessageRow[]>;
  /** 끝난 대화면 "ended" */
  addMessage(m: Omit<MessageRow, "id" | "created_at">): Promise<MessageRow | "ended">;
  /** 대화한 사람만. 이미 끝났으면 그대로 돌려준다 */
  endChat(id: string, userKey: string): Promise<ChatRow | null>;
}

export const ENDED_KEEP_MS = 24 * 3_600_000;

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const iso = (t = Date.now()) => new Date(t).toISOString();

// ── 미리보기 샘플: 보는 사람 위치 기준 오프셋(m) — 시간에 따라 수십 m 씩 흔들려 '실시간 위치'처럼 보인다
type Sample = { id: string; name: string; dx: number; dy: number; profile: BuddyProfile; replies: string[] };
export const SAMPLES: Sample[] = [
  { id: "seed-b1", name: "비빔밥러버", dx: 320, dy: 180, profile: { cuisines: ["korean"], message: "점심에 국밥 한 그릇 같이 하실 분!", age: 27, gender: "female" }, replies: ["안녕하세요! 국밥 좋아하세요?", "근처에 순대국 맛집 하나 알아요 😊", "12시 반쯤 어떠세요?"] },
  { id: "seed-b2", name: "채소한접시", dx: -450, dy: 260, profile: { cuisines: ["vegetarian", "japanese"], message: "비건 메뉴 있는 곳 같이 탐방해요", age: 31, gender: "male" }, replies: ["반가워요! 저는 비건이에요.", "근처 사찰음식점 가 보셨어요?", "저녁도 괜찮아요!"] },
  { id: "seed-b3", name: "마라는진리", dx: 120, dy: -520, profile: { cuisines: ["chinese"], message: "마라탕 1단계부터 도전 중", age: 24, gender: "female" }, replies: ["마라탕 몇 단계 드세요?", "꿔바로우도 같이 시키면 딱이에요", "오늘 저녁 7시 어때요?"] },
  { id: "seed-b4", name: "스시한판", dx: -700, dy: -380, profile: { cuisines: ["japanese"], message: "회전초밥 혼밥 탈출하고 싶어요", age: 35, gender: "none" }, replies: ["안녕하세요~ 초밥 좋아하시나 봐요", "역 근처 회전초밥집 괜찮아요", "주말 점심도 가능해요"] },
  { id: "seed-b5", name: "한식연구소", dx: 900, dy: 640, profile: { cuisines: ["korean", "chinese"], message: "새로 생긴 칼국수집 가보실 분", age: 42, gender: "male" }, replies: ["반갑습니다!", "칼국수에 보쌈 세트가 유명하대요", "몇 시가 편하세요?"] },
  { id: "seed-b6", name: "샐러드요정", dx: 60, dy: 1300, profile: { cuisines: ["vegetarian"], message: "가볍게 샐러드 + 커피 하실 분", age: 29, gender: "female" }, replies: ["안녕하세요 :)", "포케집도 좋아요!", "퇴근하고 6시 반 어때요?"] },
];
const isSample = (key: string) => key.startsWith("sample:");
const sampleOf = (key: string) => SAMPLES.find((s) => `sample:${s.id}` === key) ?? null;

/** 오프셋(m) → 좌표. 흔들림은 5분 주기로 ±40m */
export function samplePoint(s: Sample, near: LatLng, now = Date.now()): LatLng {
  const phase = (now / 300_000) * Math.PI * 2 + s.dx;
  const dx = s.dx + Math.cos(phase) * 40;
  const dy = s.dy + Math.sin(phase) * 40;
  return { lat: near.lat + dy / 111_320, lng: near.lng + dx / (111_320 * Math.cos((near.lat * Math.PI) / 180)) };
}

export function memoryBuddyStore(opts: { samples?: boolean; now?: () => number } = {}): BuddyStore {
  const now = opts.now ?? Date.now;
  const presence = new Map<string, PresenceRow>(); // user_key →
  const chats = new Map<string, ChatRow>();
  const messages: MessageRow[] = [];
  const replyIdx = new Map<string, number>();
  const samples = opts.samples ? SAMPLES : [];

  const sampleRow = (s: Sample, near: LatLng): PresenceRow => ({ ...s.profile, id: s.id, user_key: `sample:${s.id}`, name: s.name, ...samplePoint(s, near, now()), on_until: iso(now() + 8 * 3_600_000), updated_at: iso(now()) });
  // 샘플 답장: 몇 초 뒤 시각으로 넣어 두고, 읽을 때 지금보다 미래인 건 숨긴다 (기다리는 느낌)
  const sampleSay = (chat: ChatRow, key: string, delayMs: number) => {
    const s = sampleOf(key);
    if (!s) return;
    const i = replyIdx.get(chat.id) ?? 0;
    replyIdx.set(chat.id, i + 1);
    const body = i < s.replies.length ? s.replies[i] : "좋아요! 그럼 그때 봬요 🙌";
    const at = iso(now() + delayMs);
    messages.push({ id: uid(), chat_id: chat.id, sender_key: key, body, created_at: at });
    chat.last_at = at;
  };
  const partnerKey = (c: ChatRow, me: string) => (c.a_key === me ? c.b_key : c.a_key);

  return {
    mode: "preview",
    async getPresence(key) {
      const p = presence.get(key);
      return p ? { ...p } : null;
    },
    async getPresenceById(id) {
      const s = samples.find((x) => x.id === id);
      if (s) return sampleRow(s, { lat: 37.5665, lng: 126.978 });
      const p = [...presence.values()].find((x) => x.id === id);
      return p ? { ...p } : null;
    },
    async upsertPresence(p) {
      const prev = presence.get(p.user_key);
      const row: PresenceRow = { ...p, id: prev?.id ?? uid(), updated_at: iso(now()) };
      presence.set(p.user_key, row);
      return { ...row };
    },
    async setOff(key) {
      const p = presence.get(key);
      if (p) p.on_until = iso(now());
    },
    async locate(key, at) {
      const p = presence.get(key);
      if (!p || Date.parse(p.on_until) <= now()) return null;
      Object.assign(p, { lat: at.lat, lng: at.lng, updated_at: iso(now()) });
      return { ...p };
    },
    async listActive({ near, radiusM, exclude, limit }) {
      const t = now();
      const real = [...presence.values()].filter((p) => p.user_key !== exclude && Date.parse(p.on_until) > t);
      return [...real, ...samples.map((s) => sampleRow(s, near))]
        .map((p) => ({ p, d: distanceM(near, p) }))
        .filter((x) => x.d <= radiusM)
        .sort((a, b) => a.d - b.d)
        .slice(0, limit)
        .map((x) => ({ ...x.p }));
    },
    async openChat(a, b) {
      const open = [...chats.values()].find((c) => !c.ended_at && ((c.a_key === a.key && c.b_key === b.key) || (c.a_key === b.key && c.b_key === a.key)));
      if (open) return { ...open };
      const t = iso(now());
      const c: ChatRow = { id: uid(), a_key: a.key, b_key: b.key, a_name: a.name, b_name: b.name, a_profile: a.profile, b_profile: b.profile, created_at: t, last_at: t, ended_at: null, ended_by: null };
      chats.set(c.id, c);
      if (isSample(b.key)) sampleSay(c, b.key, 1500);
      return { ...c };
    },
    async getChat(id) {
      const c = chats.get(id);
      return c ? { ...c } : null;
    },
    async listChats(key, limit) {
      const since = now() - ENDED_KEEP_MS;
      return [...chats.values()]
        .filter((c) => (c.a_key === key || c.b_key === key) && (!c.ended_at || Date.parse(c.ended_at) > since))
        .sort((x, y) => y.last_at.localeCompare(x.last_at))
        .slice(0, limit)
        .map((c) => ({ ...c }));
    },
    async lastMessages(ids) {
      const t = iso(now());
      const m = new Map<string, MessageRow>();
      for (const msg of messages) if (ids.includes(msg.chat_id) && msg.created_at <= t && (!m.has(msg.chat_id) || m.get(msg.chat_id)!.created_at <= msg.created_at)) m.set(msg.chat_id, msg);
      return m;
    },
    async listMessages(chatId, after, limit) {
      const t = iso(now());
      return messages
        .filter((m) => m.chat_id === chatId && m.created_at <= t && (!after || m.created_at > after))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(-limit)
        .map((m) => ({ ...m }));
    },
    async addMessage(m) {
      const c = chats.get(m.chat_id);
      if (!c || c.ended_at) return "ended";
      const row: MessageRow = { ...m, id: uid(), created_at: iso(now()) };
      messages.push(row);
      c.last_at = row.created_at;
      const other = partnerKey(c, m.sender_key);
      if (isSample(other)) sampleSay(c, other, 2000);
      if (messages.length > 20_000) messages.splice(0, messages.length - 20_000);
      return { ...row };
    },
    async endChat(id, key) {
      const c = chats.get(id);
      if (!c || (c.a_key !== key && c.b_key !== key)) return null;
      if (!c.ended_at) Object.assign(c, { ended_at: iso(now()), ended_by: key });
      return { ...c };
    },
  };
}
