// 합성한 음성 메모리 캐시 (LRU). 라디오 구간·미리듣기·데모 답은 같은 글자가 반복된다 → 같은 제공자·음성·글자면 다시 합성하지 않는다 (비용 0, 첫 소리 즉시).
// 서버리스 인스턴스마다 따로라 완벽하지 않지만, 한 사람이 라디오를 다시 듣거나 여러 명이 같은 데모를 듣는 경우엔 충분하다.
import { createHash } from "node:crypto";

export type CachedAudio = { bytes: Uint8Array<ArrayBuffer>; contentType: string; provider: string; voice: string };

export class AudioCache {
  private map = new Map<string, CachedAudio>();
  private total = 0;

  constructor(
    readonly maxItems = 40,
    readonly maxBytes = 15 * 1024 * 1024,
    /** 하나가 너무 크면(긴 WAV) 넣지 않는다 — 몇 개가 캐시를 다 차지하지 않게 */
    readonly maxItemBytes = 5 * 1024 * 1024,
  ) {}

  get size() {
    return this.map.size;
  }
  get bytes() {
    return this.total;
  }

  get(key: string): CachedAudio | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    // 최근에 쓴 것을 맨 뒤로 (Map 은 넣은 순서를 지킨다 → 맨 앞이 가장 오래 안 쓴 것)
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }

  set(key: string, v: CachedAudio) {
    if (!v.bytes.byteLength || v.bytes.byteLength > this.maxItemBytes) return;
    const old = this.map.get(key);
    if (old) {
      this.map.delete(key);
      this.total -= old.bytes.byteLength;
    }
    this.map.set(key, v);
    this.total += v.bytes.byteLength;
    for (const [k, e] of this.map) {
      if (this.map.size <= this.maxItems && this.total <= this.maxBytes) break;
      this.map.delete(k);
      this.total -= e.bytes.byteLength;
    }
  }
}

/** 캐시 키: 제공자 + 음성 + 모델 + 언어 + 말투 + 글자. 글자는 해시로 (키가 600자씩 되지 않게) */
export function audioKey(provider: string, o: { voice?: string; model?: string; lang?: string; style?: string }, text: string): string {
  const h = createHash("sha256").update([provider, o.voice ?? "", o.model ?? "", o.lang ?? "", o.style ?? "", text].join("\u0000")).digest("base64url");
  return `${provider}:${o.voice ?? ""}:${h}`;
}

/** 서버 인스턴스 하나에 하나 */
export const ttsAudioCache = new AudioCache();
