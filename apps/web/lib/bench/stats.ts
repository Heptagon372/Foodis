// 음성 지연 측정 도구(scripts/bench-voice.ts · components/VoiceBench.tsx)가 같이 쓰는 순수 함수.
// 서버·브라우저 양쪽에서 import 하므로 Node 전용 API 를 쓰지 않는다.

/** 선형 보간 백분위수 (numpy 기본값과 같은 방식). 빈 배열이면 NaN */
export function percentile(values: number[], p: number): number {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return NaN;
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (xs.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return xs[lo] + (xs[hi] - xs[lo]) * (rank - lo);
}

export type Summary = { n: number; p50: number; p95: number; mean: number; max: number };

export function summarize(values: number[]): Summary {
  const xs = values.filter((v) => Number.isFinite(v));
  return {
    n: xs.length,
    p50: percentile(xs, 50),
    p95: percentile(xs, 95),
    mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN,
    max: xs.length ? Math.max(...xs) : NaN,
  };
}

/** 문자 오류율 비교용: 공백·문장부호 차이는 오류로 세지 않는다 (STT 는 띄어쓰기·마침표를 제멋대로 붙인다) */
export function normalizeForCer(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** 편집 거리 (코드포인트 단위, 한 줄 DP) */
export function levenshtein(a: string, b: string): number {
  const A = [...a];
  const B = [...b];
  if (!A.length) return B.length;
  if (!B.length) return A.length;
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[B.length];
}

/** CER = 편집 거리 / 정답 글자 수. 0 이 완벽, 1 을 넘을 수도 있다 */
export function charErrorRate(reference: string, hypothesis: string): number {
  const ref = normalizeForCer(reference);
  const hyp = normalizeForCer(hypothesis);
  if (!ref.length) return hyp.length ? 1 : 0;
  return levenshtein(ref, hyp) / [...ref].length;
}

/** ms 표시. 측정값이 없으면 대시 */
export const fmtMs = (ms: number) => (Number.isFinite(ms) ? `${Math.round(ms).toLocaleString("en-US")}ms` : "—");

const cell = (s: string | number) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

export function markdownTable(headers: string[], rows: (string | number)[][]): string {
  return [`| ${headers.map(cell).join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

const BITRATES: Record<string, number[]> = {
  // [MPEG 버전 그룹][비트레이트 인덱스] kbps — Layer III 만 (TTS 출력은 전부 MP3)
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** MP3(Layer III) 프레임 헤더를 따라가며 재생 길이(초)를 잰다. 비용(분당 과금)·말 속도 계산용. 파싱 실패 시 NaN */
export function mp3DurationSec(buf: Uint8Array): number {
  let i = 0;
  // ID3v2 태그 건너뛰기 (크기는 7비트씩 4바이트 syncsafe 정수)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33 && buf.length > 10) i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  let seconds = 0;
  let frames = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const version = (buf[i + 1] >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[i + 1] >> 1) & 0x03; // 1 = Layer III
    const brIdx = buf[i + 2] >> 4;
    const srIdx = (buf[i + 2] >> 2) & 0x03;
    const pad = (buf[i + 2] >> 1) & 0x01;
    const kbps = BITRATES[version === 3 ? "v1" : "v2"][brIdx];
    const sr = SAMPLE_RATES[version]?.[srIdx];
    if (version === 1 || layer !== 1 || !kbps || !sr) {
      i++;
      continue;
    }
    const samples = version === 3 ? 1152 : 576;
    const len = Math.floor(((samples / 8) * kbps * 1000) / sr) + pad;
    seconds += samples / sr;
    frames++;
    i += len;
  }
  return frames ? seconds : NaN;
}
