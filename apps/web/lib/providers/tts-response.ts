// /api/foodi/tts 의 본체: TTS 제공자 체인 → 오디오 Response (route 는 입력 검사·속도 제한만).
// 순수 로직이라 가짜 제공자로 테스트한다 (tts-response.test.ts).
import { ProviderError, type TTSProvider, type Usage } from "./types";

type Opened = { body: ReadableStream<Uint8Array>; contentType: string; usage: Usage; mode: "stream" | "buffered" };

/**
 * 1순위 → 2순위 순서로 시도. 제공자마다 stream() 이 있으면 먼저, 실패하면 같은 제공자의 synthesize, 그것도 실패하면 다음 제공자.
 * 모두 실패하면 null → route 가 503 (클라이언트가 브라우저 speechSynthesis 로 대체).
 */
export async function ttsResponse(chain: TTSProvider[], text: string, recordUsage: (u: Usage) => void, warn: (m: string) => void = () => {}): Promise<Response | null> {
  for (const tts of chain) {
    const opened = await open(tts, text, warn);
    if (!opened) continue;
    // 사용량은 첫 조각을 받은 시점에 기록한다 (스트림 완료를 기다리지 않음):
    // 비용은 글자 수로 미리 정해지는 추정치이고, 듣다가 끊어도(사용자가 말을 자름) 제공자는 이미 합성·과금했다 → 완료 시 기록하면 덜 잡힌다
    recordUsage(opened.usage);
    return new Response(opened.body, {
      headers: { "Content-Type": opened.contentType, "Cache-Control": "no-store", "X-TTS-Provider": opened.usage.provider, "X-TTS-Mode": opened.mode },
    });
  }
  return null;
}

async function open(tts: TTSProvider, text: string, warn: (m: string) => void): Promise<Opened | null> {
  if (tts.stream) {
    try {
      const s = await tts.stream(text);
      return { ...(await peekFirst(s.stream)), contentType: s.contentType, usage: s.usage, mode: "stream" };
    } catch (e) {
      warn(`stream failed: ${(e as Error).message}`);
      // 키 오류·잘못된 요청(재시도해도 같은 결과)이면 같은 제공자의 synthesize 는 건너뛴다
      if (e instanceof ProviderError && !e.retryable) return null;
    }
  }
  try {
    const { audio, usage } = await tts.synthesize(text);
    return { body: audio, contentType: "audio/mpeg", usage, mode: "buffered" };
  } catch (e) {
    warn(`synthesize failed: ${(e as Error).message}`);
    return null;
  }
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
