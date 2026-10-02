// /api/foodi/tts 의 본체: (제공자, 음성) 시도 순서 → 오디오 Response (route 는 입력 검사·속도 제한·예산만).
// 순수 로직이라 가짜 제공자로 테스트한다 (tts-response.test.ts).
import { audioKey, type CachedAudio } from "@/lib/voice/audio-cache";
import { ProviderError, type TTSOptions, type TTSProvider, type Usage } from "./types";

/** 시도 하나: 어느 제공자에게 어떤 음성으로. provider 가 있어야 캐시에 넣는다 */
export type TTSAttempt = { tts: TTSProvider; provider?: string; opts?: TTSOptions; /** 카탈로그 id (응답 헤더용) */ voiceId?: string | null };
export type AudioCacheLike = { get(key: string): CachedAudio | undefined; set(key: string, v: CachedAudio): void };
export type TTSResponseOptions = {
  cache?: AudioCacheLike;
  /** 일일 예산 초과: 이미 만들어 둔(캐시) 음성만 — 새로 합성하지 않는다 */
  cacheOnly?: boolean;
};

type Opened = { body: ReadableStream<Uint8Array>; contentType: string; usage: Usage; mode: "stream" | "buffered" };

const asAttempt = (c: TTSProvider | TTSAttempt): TTSAttempt => ("tts" in c ? c : { tts: c });

/**
 * 1순위 → 2순위 순서로 시도. 시도마다 캐시를 먼저 보고, 제공자에 stream() 이 있으면 먼저, 실패하면 같은 제공자의 synthesize, 그것도 실패하면 다음 시도.
 * 모두 실패하면 null → route 가 503 (클라이언트가 브라우저 speechSynthesis 로 대체).
 */
export async function ttsResponse(
  chain: (TTSProvider | TTSAttempt)[],
  text: string,
  recordUsage: (u: Usage) => void,
  warn: (m: string) => void = () => {},
  o: TTSResponseOptions = {},
): Promise<Response | null> {
  for (const a of chain.map(asAttempt)) {
    const key = o.cache && a.provider ? audioKey(a.provider, a.opts ?? {}, text) : null;
    const voice = a.voiceId ?? a.opts?.voice ?? "";
    const hit = key ? o.cache!.get(key) : undefined;
    if (hit) return respond(new Blob([hit.bytes]).stream(), hit.contentType, hit.provider, "cache", hit.voice);
    if (o.cacheOnly) continue;
    const opened = await open(a, text, warn);
    if (!opened) continue;
    // 사용량은 첫 조각을 받은 시점에 기록한다 (스트림 완료를 기다리지 않음):
    // 비용은 글자 수로 미리 정해지는 추정치이고, 듣다가 끊어도(사용자가 말을 자름) 제공자는 이미 합성·과금했다 → 완료 시 기록하면 덜 잡힌다
    recordUsage(opened.usage);
    // 끝까지 흘려보내면 캐시에 — 중간에 끊긴(취소·오류) 음성은 넣지 않는다
    const body = key ? collect(opened.body, (bytes) => o.cache!.set(key, { bytes, contentType: opened.contentType, provider: opened.usage.provider, voice })) : opened.body;
    return respond(body, opened.contentType, opened.usage.provider, opened.mode, voice);
  }
  return null;
}

function respond(body: ReadableStream<Uint8Array>, contentType: string, provider: string, mode: Opened["mode"] | "cache", voice: string) {
  return new Response(body, {
    headers: { "Content-Type": contentType, "Cache-Control": "no-store", "X-TTS-Provider": provider, "X-TTS-Mode": mode, "X-TTS-Voice": voice },
  });
}

async function open(a: TTSAttempt, text: string, warn: (m: string) => void): Promise<Opened | null> {
  const { tts, opts } = a;
  if (tts.stream) {
    try {
      const s = await tts.stream(text, opts);
      return { ...(await peekFirst(s.stream)), contentType: s.contentType, usage: s.usage, mode: "stream" };
    } catch (e) {
      warn(`stream failed: ${(e as Error).message}`);
      // 키 오류·잘못된 요청(재시도해도 같은 결과)이면 같은 제공자의 synthesize 는 건너뛴다
      if (e instanceof ProviderError && !e.retryable) return null;
    }
  }
  try {
    const { audio, usage, contentType } = await tts.synthesize(text, opts);
    return { body: audio, contentType: contentType ?? "audio/mpeg", usage, mode: "buffered" };
  } catch (e) {
    warn(`synthesize failed: ${(e as Error).message}`);
    return null;
  }
}

/** 흘려보내면서 모은다. 끝까지 오면 done(전체 바이트). limit 을 넘으면 모으기만 그만둔다 (재생은 계속) */
export function collect(src: ReadableStream<Uint8Array>, done: (bytes: Uint8Array<ArrayBuffer>) => void, limit = 5 * 1024 * 1024): ReadableStream<Uint8Array> {
  const reader = src.getReader();
  let parts: Uint8Array[] | null = [];
  let n = 0;
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const r = await reader.read();
      if (r.done) {
        if (parts) {
          const out = new Uint8Array(n);
          let at = 0;
          for (const p of parts) {
            out.set(p, at);
            at += p.byteLength;
          }
          done(out);
        }
        ctrl.close();
        return;
      }
      if (parts) {
        n += r.value.byteLength;
        if (n > limit) parts = null;
        else parts.push(r.value);
      }
      ctrl.enqueue(r.value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
}

/**
 * 첫 조각을 받아 본 뒤에 응답을 시작한다. 첫 조각 전에 끊기면 throw → 아직 200 을 보내지 않았으니 다음 경로로 갈 수 있다.
 * 클라이언트도 첫 조각 전엔 재생을 못 하므로 지연 손해가 없다. 이후 끊김은 되돌릴 수 없다 (클라이언트가 받은 데까지 재생).
 */
export async function peekFirst(src: ReadableStream<Uint8Array>): Promise<{ body: ReadableStream<Uint8Array> }> {
  const reader = src.getReader();
  let first: ReadableStreamReadResult<Uint8Array>;
  try {
    do first = await reader.read();
    while (!first.done && first.value.byteLength === 0);
  } catch (e) {
    reader.releaseLock();
    throw e;
  }
  if (first.done) throw new Error("빈 오디오 스트림");
  let head: Uint8Array | null = first.value;
  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      if (head) {
        ctrl.enqueue(head);
        head = null;
        return;
      }
      const { done, value } = await reader.read();
      if (done) ctrl.close();
      else ctrl.enqueue(value);
    },
    // 클라이언트가 끊으면(다음 질문·라디오 넘기기) 제공자 연결도 닫는다
    cancel: (reason) => reader.cancel(reason),
  });
  return { body };
}
