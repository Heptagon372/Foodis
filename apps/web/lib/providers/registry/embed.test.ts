// 임베딩 제공자 선택: 기본 openai, gemini 선택, 제공자·모델 불일치 가드 (env 는 import 시점에 읽혀서 모듈을 새로 불러온다).
import { afterEach, describe, expect, it, vi } from "vitest";

async function load(vars: Record<string, string>) {
  vi.resetModules();
  for (const k of ["EMBED_PROVIDER", "EMBEDDING_MODEL", "GEMINI_API_KEY", "OPENAI_API_KEY"]) vi.stubEnv(k, vars[k] ?? "");
  return import("./embed");
}

// 모듈을 새로 불러오며 SDK 까지 다시 변환한다 → 전체 실행 중에는 기본 5초를 넘길 수 있다
describe("registry/embed", { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("기본은 openai text-embedding-3-small, 키 기준 ready", async () => {
    const m = await load({ OPENAI_API_KEY: "fake-openai-key" });
    expect([m.embedProvider(), m.embedModel(), m.embedConfigError(), m.embedReady()]).toEqual(["openai", "text-embedding-3-small", null, true]);
  });

  it("EMBED_PROVIDER=gemini 면 모델 기본값이 gemini-embedding-2, 키는 GEMINI_API_KEY", async () => {
    const m = await load({ EMBED_PROVIDER: "gemini", OPENAI_API_KEY: "fake-openai-key" });
    expect([m.embedProvider(), m.embedModel(), m.embedKeyName(), m.embedReady()]).toEqual(["gemini", "gemini-embedding-2", "GEMINI_API_KEY", false]);
    const k = await load({ EMBED_PROVIDER: "gemini", GEMINI_API_KEY: "fake-gemini-key" });
    expect(k.embedReady()).toBe(true);
    expect(JSON.stringify(k.embedStatus())).not.toContain("fake-gemini-key");
  });

  it("제공자와 모델이 어긋나면 시작할 때 경고하고 임베딩을 끈다", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await load({ EMBED_PROVIDER: "gemini", EMBEDDING_MODEL: "text-embedding-3-small", GEMINI_API_KEY: "fake-gemini-key" });
    expect(m.embedConfigError()).toMatch(/EMBED_PROVIDER=gemini/);
    expect(m.embedReady()).toBe(false);
    expect(m.embedStatus()[0]).toMatchObject({ id: "gemini", ready: false });
    expect(err).toHaveBeenCalledWith(expect.stringContaining("설정 불일치"));

    const o = await load({ EMBED_PROVIDER: "openai", EMBEDDING_MODEL: "gemini-embedding-2", OPENAI_API_KEY: "fake-openai-key" });
    expect(o.embedConfigError()).toMatch(/EMBED_PROVIDER=openai/);
    expect(o.embedReady()).toBe(false);
  });
});
