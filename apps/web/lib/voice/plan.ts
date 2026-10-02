// /api/foodi/tts 요청 → 시도할 (제공자, 음성) 순서. 순수 함수라 준비 상태를 바꿔 가며 테스트한다 (plan.test.ts).
//  - 목소리를 고르면 그 제공자가 1순위, 실패하면 기본 체인(env TTS_PROVIDER 순서)으로 — 소리가 안 나는 것보단 다른 목소리가 낫다
//  - exact(미리듣기)는 그 목소리만 — 다른 목소리로 들려주면 미리듣기가 아니다
//  - host-a / host-b 는 라디오 자동 짝 (준비된 제공자 중에서)
//  - lang(한국어 외)은 현지 발음: 그 언어를 말하는 목소리만. 한국어 목소리로 대신 읽으면 의미가 없다 → 없으면 503, 클라이언트가 브라우저 음성(그 언어)으로
import { autoHosts, findVoice, HOST_ROLES, type HostRole, type TTSProviderId, type VoiceEntry } from "./catalog";
import { baseLang } from "./langs";
import { localVoices } from "./local";
import { SPEECH_STYLE, type SpeechRole } from "./styles";

export type PlannedVoice = {
  provider: TTSProviderId;
  voice: string;
  model?: string;
  lang?: string;
  style?: string;
  /** 카탈로그 id (현지 발음 음성·env 로만 정한 음성은 null) */
  id: string | null;
};

export type TTSRequest = { voice?: string; lang?: string; role?: SpeechRole; exact?: boolean };

export type PlanContext = {
  ready: (p: TTSProviderId) => boolean;
  /** 기본 체인: 제공자별 기본 음성, 1순위부터 */
  chain: PlannedVoice[];
};

export const isHostRole = (v: unknown): v is HostRole => HOST_ROLES.includes(v as HostRole);

/** 카탈로그 id 또는 host-a/host-b → 목소리 (모르는 값·짝을 못 정하면 undefined) */
export function resolveVoiceRef(ref: string | undefined, ready: PlanContext["ready"]): VoiceEntry | undefined {
  if (!ref) return undefined;
  if (isHostRole(ref)) return autoHosts(ready)?.[ref === "host-a" ? 0 : 1];
  return findVoice(ref);
}

export const fromEntry = (e: VoiceEntry, style?: string): PlannedVoice => ({ provider: e.provider, voice: e.voice, model: e.model, id: e.id, ...(style ? { style } : {}) });

export function planTTS(req: TTSRequest, ctx: PlanContext): PlannedVoice[] {
  if (req.lang && baseLang(req.lang) !== "ko") {
    return localVoices(req.lang)
      .filter((v) => ctx.ready(v.provider))
      .map((v) => ({ ...v, id: null }));
  }
  const style = req.role ? SPEECH_STYLE[req.role] : undefined;
  const out: PlannedVoice[] = [];
  let entry = resolveVoiceRef(req.voice, ctx.ready);
  // 라디오에서 고른 진행자의 키가 없으면 그 역할의 자동 진행자로 — 두 진행자 목소리가 갈리게 (기본 체인으로 가면 둘이 같아질 수 있다)
  if ((!entry || !ctx.ready(entry.provider)) && !req.exact && (req.role === "story" || req.role === "mc")) entry = resolveVoiceRef(req.role === "story" ? "host-a" : "host-b", ctx.ready);
  if (entry && ctx.ready(entry.provider)) out.push(fromEntry(entry, style));
  if (req.exact) return out;
  // 대체는 '다른 제공자'로 — 같은 제공자의 다른 음성은 장애·키 오류도 같아서 시간만 쓴다
  for (const c of ctx.chain) {
    if (!ctx.ready(c.provider) || out.some((o) => o.provider === c.provider)) continue;
    out.push(style ? { ...c, style } : c);
  }
  return out;
}
