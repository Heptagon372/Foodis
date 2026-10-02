// 답변·의도·사진 인식 LLM 선택 (11 문서 §3). 이 파일은 LLM 영역만 담당한다.
import { anthropicLLM } from "../anthropic";
import type { LLMProvider } from "../types";
import { lazy, type ProviderStatus } from "./lazy";

export const getLLM = lazy<LLMProvider>(() => anthropicLLM());

export const llmStatus = (): ProviderStatus[] => [{ id: "anthropic", ready: Boolean(process.env.ANTHROPIC_API_KEY) }];
