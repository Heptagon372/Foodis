// 푸랜드: 입력 검증 · 켜기/끄기/자동 OFF · 켠 사람만 주변에 · 대화 연결(중복 없이) · 대화 종료 · 샘플 답장
import { describe, expect, it } from "vitest";
import { memoryBuddyStore, SAMPLES, samplePoint } from "./store";
import { BuddyAction, BuddyProfileInput, ChatAction, isOn, remainLabel, type BuddyProfile } from "./types";

const H = 3_600_000;
const T0 = Date.parse("2026-10-03T03:00:00Z");
const SEOUL = { lat: 37.5665, lng: 126.978 };
const prof: BuddyProfile = { cuisines: ["korean"], message: "국밥 드실 분", age: 28, gender: "female" };
const on = (key: string, at = SEOUL, until = T0 + H) => ({ user_key: key, name: key, ...prof, ...at, on_until: new Date(until).toISOString() });

describe("입력 검증", () => {
  it("음식 1개 이상 · 만 19세 이상 · 1~8시간", () => {
    expect(BuddyProfileInput.safeParse({ ...prof, cuisines: [] }).success).toBe(false);
    expect(BuddyProfileInput.safeParse({ ...prof, age: 17 }).success).toBe(false);
    expect(BuddyProfileInput.safeParse({ ...prof, cuisines: ["korean", "korean", "japanese"] }).data?.cuisines).toEqual(["korean", "japanese"]);
    expect(BuddyAction.safeParse({ action: "on", hours: 9, profile: prof, ...SEOUL }).success).toBe(false);
    expect(BuddyAction.safeParse({ action: "on", hours: 8, profile: prof, ...SEOUL }).success).toBe(true);
    expect(BuddyAction.safeParse({ action: "on", hours: 0, profile: prof, ...SEOUL }).success).toBe(false);
    expect(ChatAction.safeParse({ action: "send", body: "  " }).success).toBe(false);
  });
  it("남은 시간 문구", () => {
    expect(remainLabel(new Date(T0 + 40 * 60_000).toISOString(), T0)).toBe("40분 남음");
    expect(remainLabel(new Date(T0 + 135 * 60_000).toISOString(), T0)).toBe("2시간 15분 남음");
    expect(remainLabel(new Date(T0 + 8 * H).toISOString(), T0)).toBe("8시간 남음");
  });
});

describe("메모리 저장소", () => {
  it("켠 사람만, 나를 빼고, 반경 안에서 가까운 순 · 시간이 지나면 자동 OFF", async () => {
    let now = T0;
    const s = memoryBuddyStore({ now: () => now });
    await s.upsertPresence(on("me"));
    await s.upsertPresence(on("near", { lat: SEOUL.lat + 0.003, lng: SEOUL.lng }));
    await s.upsertPresence(on("far", { lat: SEOUL.lat + 0.5, lng: SEOUL.lng }));
    await s.upsertPresence(on("closer", { lat: SEOUL.lat + 0.001, lng: SEOUL.lng }, T0 + 2 * H));
    const list = await s.listActive({ near: SEOUL, radiusM: 10_000, exclude: "me", limit: 10 });
    expect(list.map((p) => p.user_key)).toEqual(["closer", "near"]);

    now = T0 + 1.5 * H; // 1시간짜리는 꺼졌다
    expect((await s.listActive({ near: SEOUL, radiusM: 10_000, exclude: "me", limit: 10 })).map((p) => p.user_key)).toEqual(["closer"]);
    expect(isOn(await s.getPresence("me"), now)).toBe(false);
    expect(await s.locate("me", SEOUL)).toBeNull(); // 꺼지면 위치도 안 받는다
  });

  it("끄면 바로 사라지고, 다시 켜도 공개 id 는 그대로", async () => {
    const s = memoryBuddyStore({ now: () => T0 });
    const a = await s.upsertPresence(on("a"));
    await s.setOff("a");
    expect(await s.listActive({ near: SEOUL, radiusM: 1000, exclude: "x", limit: 10 })).toEqual([]);
    const again = await s.upsertPresence(on("a"));
    expect(again.id).toBe(a.id);
  });

  it("대화: 같은 두 사람은 진행 중인 대화 하나 · 종료 후엔 못 보냄 · 새로 걸면 새 대화", async () => {
    const s = memoryBuddyStore();
    const A = { key: "a", name: "A", profile: prof };
    const B = { key: "b", name: "B", profile: { ...prof, cuisines: ["japanese"] as BuddyProfile["cuisines"] } };
    const c1 = await s.openChat(A, B);
    expect((await s.openChat(B, A)).id).toBe(c1.id);
    expect(await s.addMessage({ chat_id: c1.id, sender_key: "a", body: "안녕하세요" })).not.toBe("ended");
    expect((await s.listMessages(c1.id, null, 50)).map((m) => m.body)).toEqual(["안녕하세요"]);

    expect(await s.endChat(c1.id, "stranger")).toBeNull();
    const ended = await s.endChat(c1.id, "b");
    expect(ended?.ended_by).toBe("b");
    expect(await s.addMessage({ chat_id: c1.id, sender_key: "a", body: "?" })).toBe("ended");
    expect((await s.listChats("a", 10)).map((c) => c.id)).toEqual([c1.id]); // 끝난 대화도 하루는 보인다

    const c2 = await s.openChat(A, B);
    expect(c2.id).not.toBe(c1.id);
  });

  it("미리보기 샘플: 보는 사람 주변에 뜨고, 말을 걸면 잠시 뒤 답한다", async () => {
    let now = T0;
    const s = memoryBuddyStore({ samples: true, now: () => now });
    const list = await s.listActive({ near: SEOUL, radiusM: 10_000, exclude: "me", limit: 50 });
    expect(list.length).toBe(SAMPLES.length);
    const b1 = list.find((p) => p.id === "seed-b1")!;
    const chat = await s.openChat({ key: "me", name: "나", profile: prof }, { key: b1.user_key, name: b1.name, profile: prof });
    expect(await s.listMessages(chat.id, null, 50)).toEqual([]); // 인사는 아직 '오는 중'
    now += 2_000;
    expect((await s.listMessages(chat.id, null, 50)).map((m) => m.sender_key)).toEqual([b1.user_key]);
    await s.addMessage({ chat_id: chat.id, sender_key: "me", body: "좋아요" });
    now += 2_500;
    expect((await s.listMessages(chat.id, null, 50)).length).toBe(3);
  });

  it("샘플 위치는 시간이 지나면 조금 움직인다 (±40m 안)", () => {
    const a = samplePoint(SAMPLES[0], SEOUL, T0);
    const b = samplePoint(SAMPLES[0], SEOUL, T0 + 75_000);
    expect(a).not.toEqual(b);
    expect(Math.abs(a.lat - b.lat) * 111_320).toBeLessThan(81);
  });
});
