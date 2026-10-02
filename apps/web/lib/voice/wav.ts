// PCM → WAV 컨테이너. Gemini TTS 스트리밍·일부 응답은 헤더 없는 16bit PCM(audio/l16, 24kHz, 모노)이라 <audio> 가 못 튼다 → 44바이트 RIFF 헤더를 붙인다.
// WAV 는 MediaSource 로 받는 대로 재생할 수 없다 → 이런 제공자는 stream() 없이 synthesize 만 (클라이언트는 blob 경로).

export type PcmFormat = { sampleRate: number; channels: number; bitsPerSample: number };
export const GEMINI_PCM: PcmFormat = { sampleRate: 24_000, channels: 1, bitsPerSample: 16 };

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

export const isWav = (b: Uint8Array) => b.byteLength >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE";

export function wavHeader(dataBytes: number, f: PcmFormat = GEMINI_PCM): Uint8Array<ArrayBuffer> {
  const h = new Uint8Array(44);
  const v = new DataView(h.buffer);
  const w = (at: number, s: string) => [...s].forEach((c, i) => (h[at + i] = c.charCodeAt(0)));
  const blockAlign = (f.channels * f.bitsPerSample) / 8;
  w(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true); // fmt 청크 길이
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, f.channels, true);
  v.setUint32(24, f.sampleRate, true);
  v.setUint32(28, f.sampleRate * blockAlign, true); // 초당 바이트
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, f.bitsPerSample, true);
  w(36, "data");
  v.setUint32(40, dataBytes, true);
  return h;
}

/** 헤더 + PCM 한 덩어리. 16bit 인데 홀수 바이트면 마지막 반쪽 샘플을 버린다 (헤더 길이와 어긋나지 않게) */
export function pcmToWav(pcm: Uint8Array, f: PcmFormat = GEMINI_PCM): Uint8Array<ArrayBuffer> {
  const align = (f.channels * f.bitsPerSample) / 8;
  const n = pcm.byteLength - (pcm.byteLength % align);
  const out = new Uint8Array(44 + n);
  out.set(wavHeader(n, f), 0);
  out.set(pcm.subarray(0, n), 44);
  return out;
}

/** "audio/L16;codec=pcm;rate=24000" → 24000 (없으면 null) */
export function rateFromMime(mime: string | null | undefined): number | null {
  const m = /rate=(\d+)/i.exec(mime ?? "");
  return m ? Number(m[1]) : null;
}

/** 테스트·길이 계산용: 44바이트 표준 헤더 읽기 */
export function readWavHeader(b: Uint8Array): (PcmFormat & { dataBytes: number; seconds: number }) | null {
  if (!isWav(b) || b.byteLength < 44) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const f = { channels: v.getUint16(22, true), sampleRate: v.getUint32(24, true), bitsPerSample: v.getUint16(34, true) };
  const dataBytes = v.getUint32(40, true);
  return { ...f, dataBytes, seconds: dataBytes / (f.sampleRate * f.channels * (f.bitsPerSample / 8)) };
}
