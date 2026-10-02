// 말투 지시 — 지시를 받는 제공자(OpenAI instructions · Gemini style)에만 쓰인다. 나머지는 목소리 자체의 톤으로.
// 라디오는 두 진행자가 말투로도 갈리게 한다 (design/11 문서 §4).
export const SPEECH_STYLE = {
  foodi: "따뜻하고 다정한 여행 가이드처럼, 호기심 어린 밝은 톤으로 또박또박 자연스러운 한국어로 말해 주세요. 외국 음식 이름은 현지 발음에 가깝게, 문장 끝은 부드럽게 내려 주세요.",
  story: "라디오 이야기꾼처럼 차분하고 따뜻하게, 듣는 사람이 장면을 떠올릴 수 있도록 서두르지 않고 또박또박 한국어로 들려주세요. 외국 음식 이름은 현지 발음에 가깝게.",
  mc: "라디오 진행자처럼 밝고 경쾌하게, 미소가 느껴지는 목소리로 자연스러운 한국어로 말해 주세요.",
} as const;

export type SpeechRole = keyof typeof SPEECH_STYLE;
export const SPEECH_ROLES = Object.keys(SPEECH_STYLE) as SpeechRole[];
