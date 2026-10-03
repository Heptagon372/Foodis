"use client";
// 푸랜드 클라이언트: API 호출 + 마지막으로 쓴 프로필·시간(이 기기에만) + 대화별 '읽은 시각'(새 메시지 표시용)
import type { BuddyProfile, BuddyView, ChatView, MessageView, MyBuddy } from "@/lib/buddy/types";
import { api } from "./community";

export type BuddyPage = { me: MyBuddy; buddies: BuddyView[]; chats: ChatView[]; mode: "live" | "preview"; can_use: boolean; name: string };
export type ChatPage = { chat: ChatView; messages: MessageView[]; mode: "live" | "preview" };
type LatLng = { lat: number; lng: number };

export const fetchBuddy = () => api<BuddyPage>("/api/community/buddy");
export const buddyOn = (hours: number, profile: BuddyProfile, at: LatLng) =>
  api<{ me: MyBuddy }>("/api/community/buddy", { method: "POST", body: JSON.stringify({ action: "on", hours, profile, ...at }) });
export const buddyOff = () => api<{ me: MyBuddy }>("/api/community/buddy", { method: "POST", body: JSON.stringify({ action: "off" }) });
export const buddyLocate = (at: LatLng) => api<{ me: MyBuddy }>("/api/community/buddy", { method: "POST", body: JSON.stringify({ action: "locate", ...at }) });

export const startChat = (to: string) => api<{ chat: ChatView }>("/api/community/buddy/chats", { method: "POST", body: JSON.stringify({ to }) });
export const fetchChat = (id: string, after: string | null) => api<ChatPage>(`/api/community/buddy/chats/${encodeURIComponent(id)}${after ? `?after=${encodeURIComponent(after)}` : ""}`);
export const sendChat = (id: string, body: string) => api<{ message: MessageView }>(`/api/community/buddy/chats/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ action: "send", body }) });
export const endChat = (id: string) => api<{ chat: ChatView }>(`/api/community/buddy/chats/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ action: "end" }) });

// ── 이 기기에 남기는 것 (서버에도 프로필이 있지만, 처음 켤 때·로그아웃 상태에서 다시 적지 않게)
const DRAFT_KEY = "foodis.buddy.draft";
const SEEN_KEY = "foodis.buddy.seen";
export type BuddyDraft = Partial<BuddyProfile> & { hours?: number };

export function loadDraft(): BuddyDraft {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as BuddyDraft;
  } catch {
    return {};
  }
}
export function saveDraft(d: BuddyDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {}
}

function seenMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
/** 이 대화를 이 시각까지 읽었다 */
export function markSeen(chatId: string, at: string) {
  try {
    const m = seenMap();
    if ((m[chatId] ?? "") >= at) return;
    m[chatId] = at;
    // 오래된 기록은 50개까지만
    const keep = Object.entries(m).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 50);
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {}
}
/** 상대가 보낸 마지막 메시지를 아직 안 읽었나 */
export const isUnread = (c: ChatView) => Boolean(c.last && !c.last.mine && !c.ended_at && (seenMap()[c.id] ?? "") < c.last.at);

/** 브라우저 위치 한 번. 실패하면 이유 코드 */
export function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? "denied" : "failed")),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}
export const GEO_MESSAGE: Record<string, string> = {
  unsupported: "이 브라우저는 위치를 지원하지 않아요.",
  denied: "위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용해 주세요.",
  failed: "위치를 잡지 못했어요. 잠시 뒤 다시 시도해 주세요.",
};
