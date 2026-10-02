// GET /api/foodi/voices — 목소리 카탈로그 + 목소리마다 지금 쓸 수 있는지(ready = 그 제공자 키가 서버에 있음). 키 값은 절대 넣지 않는다.
// 설정 화면(VoicePicker)·라디오 진행자 이름 표시가 쓴다. auto = 아무것도 고르지 않았을 때 실제로 나갈 목소리.
import { NextResponse } from "next/server";
import { defaultChain, ttsReady } from "@/lib/providers";
import { autoHosts, PROVIDER_LABEL, TTS_PROVIDERS, VOICES, type VoiceInfo, type VoicesResponse } from "@/lib/voice/catalog";
import { FREE_TIER_NOTE, usdPer1MChars } from "@/lib/voice/pricing";

export const dynamic = "force-dynamic";

export async function GET() {
  const voices: VoiceInfo[] = VOICES.map((v) => ({ ...v, ready: ttsReady(v.provider), usdPer1MChars: Math.round(usdPer1MChars(v.provider, v.model ?? v.voice) * 10) / 10 }));
  const hosts = autoHosts(ttsReady);
  const body: VoicesResponse = {
    voices,
    providers: TTS_PROVIDERS.map((id) => ({ id, label: PROVIDER_LABEL[id], ready: ttsReady(id), freeTier: FREE_TIER_NOTE[id] })),
    auto: { foodi: defaultChain()[0]?.id ?? null, radio: hosts ? [hosts[0].id, hosts[1].id] : null },
  };
  // 키는 배포 단위로만 바뀐다 → 잠깐 캐시해도 된다
  return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=300" } });
}
