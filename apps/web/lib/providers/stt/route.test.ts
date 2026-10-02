// /api/foodi/stt 라우트: 입력 검사 · 엔진 선택 전달 · 응답 모양 · 실패 시 503 · 속도 제한. 의존성은 가짜로 바꿔 끼운다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { STTLang } from "../types";

const state = vi.hoisted(() => ({
  chainCalls: [] as { lang: string; engine: string | null | undefined }[],
  text: "이기 뭐꼬",
  fail: false,
  usages: [] as unknown[],
}));

vi.mock("@/lib/db/supabase-server", () => ({ currentUserId: async () => null }));
vi.mock("@/lib/foodi/deps", () => ({
  getOrchestratorDeps: async () => ({
    repo: { allFoodNames: async () => [{ id: "1", name_ko: "돼지국밥", name_en: "Dwaeji-gukbap", country_code: "KR" }], recordUsage: async (u: unknown[]) => void state.usages.push(...u) },
    llm: {
      structured: async () => ({ data: { standard_ko: "이게 뭐야?", language: "ko", is_dialect: true }, usage: { provider: "anthropic", operation: "stt_normalize", units: 1, unitType: "tokens", costUsd: 0 } }),
    },
    dailyBudgetUsd: 5,
  }),
}));
vi.mock("@/lib/providers/registry/stt", () => ({
  sttEngineStatus: () => ({ engines: [{ id: "elevenlabs", label_ko: "ElevenLabs Scribe", desc_ko: "사투리·외국어 자동 감지", ready: true, langs: ["ko", "auto"] }], chains: { ko: ["elevenlabs"], auto: ["elevenlabs"] }, normalize: true }),
  resolveChain: (lang: STTLang, engine?: string | null) => {
    state.chainCalls.push({ lang, engine });
    if (engine === "none") return [];
    return [
      {
        id: engine ?? "elevenlabs",
        provider: {
          transcribe: async (_a: Blob, o: { keywords?: string[] }) => {
            if (state.fail) throw new Error("upstream down");
            expect(o.keywords).toEqual(["돼지국밥"]);
            return { text: state.text, language: "ko", usage: { provider: "elevenlabs", operation: "stt", units: 2, unitType: "seconds", costUsd: 0.0001 } };
          },
        },
      },
    ];
  },
}));

const { GET, POST } = await import("@/app/api/foodi/stt/route");

let ip = 0;
const req = (fields: [string, string | Blob][], headers: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of fields) f.append(k, v);
  return new Request("http://localhost/api/foodi/stt", { method: "POST", body: f, headers: { "x-forwarded-for": `10.0.0.${++ip}`, ...headers } });
};
const audio = () => new Blob([new Uint8Array(4000)], { type: "audio/webm;codecs=opus" });

describe("/api/foodi/stt", () => {
  beforeEach(() => {
    state.chainCalls.length = 0;
    state.usages.length = 0;
    state.text = "이기 뭐꼬";
    state.fail = false;
  });

  it("GET: 엔진 상태 (키 값 없음)", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.engines[0]).toEqual({ id: "elevenlabs", label_ko: "ElevenLabs Scribe", desc_ko: "사투리·외국어 자동 감지", ready: true, langs: ["ko", "auto"] });
    expect(JSON.stringify(body)).not.toMatch(/key|secret/i);
  });

  it("POST: 사투리 → { text, standard_ko, language, provider } + 비용 기록", async () => {
    const res = await POST(req([["audio", audio()], ["mode", "ko"]]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "이기 뭐꼬", standard_ko: "이게 뭐야?", language: "ko", provider: "elevenlabs" });
    expect(state.chainCalls).toEqual([{ lang: "ko", engine: null }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(state.usages).toHaveLength(2);
  });

  it("mode·engine 을 registry 로 넘긴다", async () => {
    state.text = "Is pho spicy?";
    const res = await POST(req([["audio", audio()], ["mode", "auto"], ["engine", "gemini"]]));
    expect(res.status).toBe(200);
    expect(state.chainCalls).toEqual([{ lang: "auto", engine: "gemini" }]);
    expect((await res.json()).provider).toBe("gemini");
  });

  it("입력 오류: audio 없음 400 · 잘못된 mode 400 · 이미지 415 · content-length 초과 413", async () => {
    expect((await POST(req([["mode", "ko"]]))).status).toBe(400);
    expect((await POST(req([["audio", audio()], ["mode", "xx"]]))).status).toBe(400);
    expect((await POST(req([["audio", new Blob([new Uint8Array(10)], { type: "image/png" })]]))).status).toBe(415);
    expect((await POST(req([["audio", audio()]], { "content-length": String(5 * 1024 * 1024) }))).status).toBe(413);
    expect(state.chainCalls).toEqual([]);
  });

  it("준비된 엔진이 없으면 503, 체인이 모두 실패해도 503", async () => {
    const none = await POST(req([["audio", audio()], ["engine", "none"]]));
    expect(none.status).toBe(503);
    state.fail = true;
    const res = await POST(req([["audio", audio()]]));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("stt_unavailable");
  });

  it("같은 사용자 분당 10회를 넘으면 429", async () => {
    const h = { "x-forwarded-for": "10.9.9.9" };
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await POST(req([["audio", audio()]], h))).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
