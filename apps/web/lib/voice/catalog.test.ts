import { describe, expect, it } from "vitest";
import { autoHosts, DEFAULT_VOICE, findVoice, HOST_PREFS, hostForSegment, isVoiceId, tierOf, TTS_PROVIDERS, VOICES, type TTSProviderId } from "./catalog";
import { usdPer1MChars } from "./pricing";

const all = () => true;
const only = (...ps: TTSProviderId[]) => (p: TTSProviderId) => ps.includes(p);

describe("목소리 카탈로그", () => {
  it("id 가 겹치지 않고 12개 이상 · 제공자 4곳 이상", () => {
    const ids = VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(VOICES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(VOICES.map((v) => v.provider)).size).toBeGreaterThanOrEqual(4);
  });

  it("모든 목소리가 한국어를 맨 앞에 · 라벨·설명·모델 배지가 있다", () => {
    for (const v of VOICES) {
      expect(v.langs[0], v.id).toBe("ko");
      expect(v.label_ko && v.desc_ko && v.modelLabel, v.id).toBeTruthy();
      expect(TTS_PROVIDERS).toContain(v.provider);
      expect(v.id).toMatch(/^[a-z0-9-]+$/); // 저장·요청·헤더에 그대로 쓰인다
    }
  });

  it("같은 목소리 여러 모델은 항목이 나뉜다 (빠름 vs 고품질)", () => {
    const talia = VOICES.filter((v) => v.provider === "elevenlabs" && v.voice === "Talia");
    expect(new Set(talia.map((v) => v.model)).size).toBe(2);
    expect(new Set(talia.map((v) => v.modelLabel)).size).toBe(2);
  });

  it("가격 등급이 단가와 맞는다", () => {
    for (const v of VOICES) expect(v.priceTier, v.id).toBe(tierOf(usdPer1MChars(v.provider, v.model ?? v.voice)));
    expect(findVoice("google-wavenet-a")!.priceTier).toBe(1);
    expect(findVoice("eleven-talia-hq")!.priceTier).toBe(3);
  });

  it("WAV 로 주는 Gemini 는 스트리밍 아님 · MP3 스트림 제공자는 스트리밍", () => {
    for (const v of VOICES.filter((x) => x.provider === "gemini")) expect(v.streaming).toBe(false);
    for (const v of VOICES.filter((x) => x.provider === "openai" || x.provider === "elevenlabs")) expect(v.streaming).toBe(true);
  });

  it("제공자별 기본 목소리 · 진행자 후보가 모두 카탈로그에 있다", () => {
    for (const p of TTS_PROVIDERS) expect(findVoice(DEFAULT_VOICE[p])?.provider).toBe(p);
    for (const ids of Object.values(HOST_PREFS)) for (const id of ids) expect(isVoiceId(id), id).toBe(true);
    expect(isVoiceId("host-a")).toBe(false);
    expect(isVoiceId(null)).toBe(false);
  });
});

describe("라디오 2인 진행", () => {
  it("이야기 구간은 A, 오프닝·연결·클로징은 B", () => {
    for (const k of ["summary", "origin", "history", "culture"]) expect(hostForSegment(k)).toBe("host-a");
    for (const k of ["open", "bridge", "close"]) expect(hostForSegment(k)).toBe("host-b");
  });

  it("자동 짝: 준비된 제공자에서 서로 다른 목소리 · 성별이 갈린다", () => {
    const [a, b] = autoHosts(all)!;
    expect(a.id).not.toBe(b.id);
    expect(a.gender).not.toBe(b.gender);
    const g = autoHosts(only("google"))!;
    expect(g.map((v) => v.provider)).toEqual(["google", "google"]);
    expect(g[0].id).not.toBe(g[1].id);
    for (const p of TTS_PROVIDERS) expect(autoHosts(only(p)), p).not.toBeNull(); // 키가 하나만 있어도 짝이 된다
    expect(autoHosts(() => false)).toBeNull();
  });
});
