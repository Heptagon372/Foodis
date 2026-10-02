// 녹음 PCM → 16kHz 모노 16bit WAV (10 문서 §6).
// 왜 WAV: 브라우저 녹음 형식(Chrome webm/opus · Safari mp4)은 엔진마다 받는 게 다르다 — CLOVA 는 webm·mp4 를 못 받는다.
// WAV 는 모든 서버 엔진이 받는다. 16kHz 면 12초 ≈ 384KB 로 업로드 한도(2MB) 안이다.

export const WAV_RATE = 16_000;

/** 평균으로 줄이기 (48k → 16k 처럼 정수배가 아니어도 구간 평균). 말소리 대역(≤ 8kHz)은 남는다 */
export function downsample(input: Float32Array, inRate: number, outRate = WAV_RATE): Float32Array {
  if (inRate <= outRate) return input;
  const ratio = inRate / outRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = b > a ? sum / (b - a) : 0;
  }
  return out;
}

export function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** RIFF/WAVE PCM 16bit 모노 */
export function encodeWav(samples: Float32Array, rate = WAV_RATE): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // fmt 청크 크기
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 모노
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // 초당 바이트
  v.setUint16(32, 2, true); // 블록 정렬
  v.setUint16(34, 16, true); // 비트
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** 캡처한 조각들 → WAV Blob. 0.3초도 안 되면 null (캡처가 안 된 것 → MediaRecorder 녹음을 쓴다) */
export function pcmToWav(chunks: Float32Array[], inRate: number): Blob | null {
  const all = concat(chunks);
  if (all.length < inRate * 0.3) return null;
  return new Blob([encodeWav(downsample(all, inRate))], { type: "audio/wav" });
}
