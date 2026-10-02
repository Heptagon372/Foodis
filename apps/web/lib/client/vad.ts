// 녹음 자동 멈춤용 아주 단순한 음성 구간 검출 (RMS 기준, 10 문서 §6).
// 서버 인식 모드에선 Web Speech 처럼 "말 끝나면 알아서" 보내야 한다 — 버튼을 다시 누르게 하면 음성 우선 경험이 깨진다.
// 순수 함수라 테스트한다 (vad.test.ts). WebAudio 연결은 voice.ts 가 한다.

export const VAD = {
  /** 녹음 최대 길이 — 질문 하나는 길어야 10초 남짓 */
  maxMs: 12_000,
  /** 이 시간 안에 말소리가 없으면 업로드 없이 "못 들었어요" */
  noSpeechMs: 5_000,
  /** 말한 뒤 이만큼 조용하면 끝으로 본다 (Web Speech 의 끝 판정과 비슷한 체감) */
  endSilenceMs: 1_200,
  /** 이만큼은 소리가 나야 "말했다"로 본다 (기침·탁 소리 한 번은 무시) */
  minVoicedMs: 250,
  /** 처음 이만큼은 주변 소음 크기를 잰다 */
  calibrateMs: 300,
};
export type VadConfig = typeof VAD;

export type VadState = { t: number; floor: number; voiced: number; silence: number; spoke: boolean; alive: boolean };
export const vadStart = (): VadState => ({ t: 0, floor: 0, voiced: 0, silence: 0, spoke: false, alive: false });

export function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return buf.length ? Math.sqrt(sum / buf.length) : 0;
}

/** 소음 바닥의 3배를 문턱으로. 조용한 방에서도 너무 예민하지 않게, 시끄러워도 말소리는 넘게 범위를 묶는다 */
export const threshold = (floor: number) => Math.min(0.06, Math.max(0.012, floor * 3));

/**
 * 한 번 잰 소리 크기(level)와 지난 시간(dt ms)으로 상태를 넘긴다.
 * - stop: 말이 끝났다 → 업로드
 * - no_speech: 말소리가 없었다 → 업로드하지 않는다 (비용 0)
 * alive = 0 이 아닌 소리가 한 번이라도 들어왔는가. Safari 에서 AudioContext 가 잠겨 계속 0 이면 판정을 끄고 최대 길이까지 녹음한다.
 */
export function vadStep(s: VadState, level: number, dt: number, cfg: VadConfig = VAD): { s: VadState; action: "continue" | "stop" | "no_speech" } {
  const n: VadState = { ...s, t: s.t + dt, alive: s.alive || level > 0 };
  if (n.t <= cfg.calibrateMs) {
    n.floor = s.floor === 0 ? level : s.floor * 0.7 + level * 0.3;
  } else if (level >= threshold(n.floor)) {
    n.voiced += dt;
    n.silence = 0;
    if (n.voiced >= cfg.minVoicedMs) n.spoke = true;
  } else {
    n.silence += dt;
    // 말하기 전 조용한 구간으로 소음 바닥을 천천히 따라간다 (냉장고·환풍기 소리가 켜지고 꺼지는 경우)
    if (!n.spoke) n.floor = n.floor * 0.95 + level * 0.05;
  }
  if (n.t >= cfg.maxMs) return { s: n, action: n.spoke || !n.alive ? "stop" : "no_speech" };
  if (n.spoke && n.silence >= cfg.endSilenceMs) return { s: n, action: "stop" };
  if (!n.spoke && n.alive && n.t >= cfg.noSpeechMs) return { s: n, action: "no_speech" };
  return { s: n, action: "continue" };
}
