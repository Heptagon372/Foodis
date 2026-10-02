// 환경변수로 구현체 선택 (11 문서 §3). 영역별 선택은 registry/ 아래 파일이 담당한다.
// 지연 생성: 키가 없는 빌드·테스트 환경에서 import 만으로 실패하지 않게 한다.
export { enabledProviders, getLLM, llmFor, llmModels, llmProviderReady, llmReady, llmStatus, tierModels } from "./registry/llm";
export { embedConfigError, embedKeyName, embedModel, embedReady, embedStatus, getEmbedder } from "./registry/embed";
export { getSTT, sttStatus } from "./registry/stt";
export { defaultChain, ttsAttempts, ttsReady, ttsStatus } from "./registry/tts";
export type { ProviderStatus } from "./registry/lazy";

export * from "./types";
