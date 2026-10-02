import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { env } from "@/lib/env";
import { ttsCostUsd } from "@/lib/voice/pricing";
import { ProviderError, type TTSOptions, type TTSProvider } from "./types";

// TTS 후보 A: Google Cloud TTS. 월 100만 자 무료 → 경진대회 규모면 사실상 0원 (09 문서 §5.4)
// stream() 은 일부러 없다 → /api/foodi/tts 가 synthesize(한 번에 받기)로 보낸다. streamingSynthesize 를 안 쓰는 이유 (08 문서 §6):
//  - 출력이 PCM·ALAW·MULAW·OGG_OPUS 만 된다 (MP3 불가). 브라우저 MediaSource 는 Ogg 를 거의 못 받고(Safari·Chrome ✗),
//    PCM 은 <audio> 가 아니라 Web Audio 로 직접 이어 붙여야 한다 → iOS 에서 잠금 해제한 <audio> 하나를 재사용하는 라디오 구조와 안 맞는다.
//    서버에서 MP3 로 바꾸려면 인코더(ffmpeg·lame wasm)를 서버리스에 실어야 한다 — 무겁다.
//  - Chirp 3 HD 음성 전용이라 현재 기본(Wavenet)에는 쓸 수 없고, gRPC 양방향 스트림이라 요청마다 연결 비용도 있다.
//  대신 Google 은 데모 팩 미리 만들기 / 첫 문장 먼저 합성으로 대응한다.
let shared: TextToSpeechClient | undefined;
const client = () =>
  (shared ??= new TextToSpeechClient(env.googleTtsCredentials ? { credentials: JSON.parse(env.googleTtsCredentials) } : {}));

/** 음성 이름의 앞 두 칸이 로케일이다: "ko-KR-Chirp3-HD-Aoede" → ko-KR, "cmn-CN-Chirp3-HD-Aoede" → cmn-CN */
export const localeOfVoice = (name: string) => name.split("-").slice(0, 2).join("-");

/** synthesizeSpeech 요청 (테스트에서 모양 확인). 현지 발음은 그 로케일 음성(lib/voice/local.ts)이 들어온다 */
export function googleRequest(text: string, opts?: TTSOptions) {
  const name = opts?.voice ?? env.googleTtsVoice;
  return {
    input: { text },
    voice: { languageCode: localeOfVoice(name), name },
    audioConfig: { audioEncoding: "MP3" as const },
  };
}

export function googleTTS(): TTSProvider {
  return {
    async synthesize(text, opts) {
      try {
        const req = googleRequest(text, opts);
        const [res] = await client().synthesizeSpeech(req);
        const bytes = res.audioContent;
        if (!bytes || typeof bytes === "string") throw new ProviderError("google_tts", "audioContent 없음", true);
        return {
          audio: new Blob([new Uint8Array(bytes)]).stream(),
          contentType: "audio/mpeg",
          // 목록가로 기록 (월 무료 구간은 빼지 않는다 → 일일 예산 가드가 보수적으로)
          usage: { provider: "google_tts", operation: "tts", units: text.length, unitType: "chars", costUsd: ttsCostUsd("google", req.voice.name, text.length) },
        };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        // gRPC 3 = INVALID_ARGUMENT (없는 음성 이름 등), 7 = PERMISSION_DENIED, 16 = UNAUTHENTICATED → 다시 해도 같다
        const code = (e as { code?: number }).code;
        throw new ProviderError("google_tts", (e as Error).message, !(code === 3 || code === 7 || code === 16));
      }
    },
  };
}
