import { describe, expect, it } from "vitest";
import { AppendQueue, type MediaSourceLike, type SourceBufferLike } from "./stream-audio";

/** 실제 SourceBuffer 처럼: append 중(updating)에 또 붙이면 InvalidStateError, finish() 가 updateend 를 낸다 */
class FakeSB implements SourceBufferLike {
  updating = false;
  appended: number[][] = [];
  private listeners: (() => void)[] = [];
  failNext = false;
  appendBuffer(data: Uint8Array<ArrayBuffer>) {
    if (this.updating) throw new Error("InvalidStateError: updating");
    if (this.failNext) throw new Error("QuotaExceededError");
    this.updating = true;
    this.appended.push([...data]);
  }
  addEventListener(_: "updateend", fn: () => void) {
    this.listeners.push(fn);
  }
  finish() {
    this.updating = false;
    this.listeners.forEach((f) => f());
  }
}
class FakeMS implements MediaSourceLike {
  readyState = "open";
  ended: (string | undefined)[] = [];
  endOfStream(error?: "network" | "decode") {
    this.ended.push(error);
    this.readyState = "ended";
  }
}
const u8 = (...xs: number[]) => new Uint8Array(xs);

describe("AppendQueue (받는 대로 재생)", () => {
  it("updating 중에 온 조각은 모았다가 updateend 에 한 번에 붙인다", () => {
    const q = new AppendQueue();
    const sb = new FakeSB();
    const ms = new FakeMS();
    q.attach(ms, sb);
    q.push(u8(1, 2));
    expect(sb.appended).toEqual([[1, 2]]);
    q.push(u8(3));
    q.push(u8(4, 5));
    expect(sb.appended).toHaveLength(1); // 아직 updating — 던지지 않고 기다린다
    sb.finish();
    expect(sb.appended).toEqual([[1, 2], [3, 4, 5]]);
    expect(q.appended).toBe(5);
  });

  it("sourceopen 전에 온 조각도 붙는 즉시 넣는다", () => {
    const q = new AppendQueue();
    q.push(u8(1));
    q.push(u8(2));
    const sb = new FakeSB();
    q.attach(new FakeMS(), sb);
    expect(sb.appended).toEqual([[1, 2]]);
  });

  it("end() 는 남은 조각을 다 붙인 뒤에 endOfStream 한다", () => {
    const q = new AppendQueue();
    const sb = new FakeSB();
    const ms = new FakeMS();
    q.attach(ms, sb);
    q.push(u8(1));
    q.push(u8(2));
    q.end();
    expect(ms.ended).toEqual([]); // 아직 updating · 대기 조각 있음
    sb.finish(); // [2] 붙임
    expect(ms.ended).toEqual([]);
    sb.finish();
    expect(ms.ended).toEqual([undefined]);
    expect(q.done).toBe(true);
    q.push(u8(9)); // 끝난 뒤엔 무시
    expect(sb.appended).toEqual([[1], [2]]);
  });

  it("첫 조각 전에 끊기면 endOfStream('network') — 재생 실패로 알린다", () => {
    const q = new AppendQueue();
    const ms = new FakeMS();
    q.attach(ms, new FakeSB());
    q.end("network");
    expect(ms.ended).toEqual(["network"]);
  });

  it("조각을 받은 뒤 끊기면 받은 데까지 들려주도록 정상 종료", () => {
    const q = new AppendQueue();
    const sb = new FakeSB();
    const ms = new FakeMS();
    q.attach(ms, sb);
    q.push(u8(1));
    q.end("network");
    sb.finish();
    expect(ms.ended).toEqual([undefined]);
  });

  it("빈 조각은 넘기고, MediaSource 가 닫혔으면 붙이지 않는다", () => {
    const q = new AppendQueue();
    const sb = new FakeSB();
    const ms = new FakeMS();
    q.attach(ms, sb);
    q.push(u8());
    expect(sb.appended).toEqual([]);
    ms.readyState = "closed";
    q.push(u8(1));
    expect(sb.appended).toEqual([]);
  });

  it("appendBuffer 가 던지면 닫고 onError", () => {
    const q = new AppendQueue();
    const sb = new FakeSB();
    const errors: unknown[] = [];
    q.onError = (e) => errors.push(e);
    q.attach(new FakeMS(), sb);
    sb.failNext = true;
    q.push(u8(1));
    expect(errors).toHaveLength(1);
    expect(q.done).toBe(true);
    sb.failNext = false;
    q.push(u8(2));
    expect(sb.appended).toEqual([]);
  });

  it("close() 뒤엔 updateend 가 와도 아무것도 하지 않는다 (src 바뀜 · 넘기기)", () => {
    const q = new AppendQueue();
    const sb = new FakeSB();
    const ms = new FakeMS();
    q.attach(ms, sb);
    q.push(u8(1));
    q.push(u8(2));
    q.close();
    sb.finish();
    expect(sb.appended).toEqual([[1]]);
    expect(ms.ended).toEqual([]);
  });
});
