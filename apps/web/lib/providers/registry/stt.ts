// 서버 음성 인식(STT) 선택. 브라우저 Web Speech 가 안 되거나 사투리·외국어 모드일 때 쓰인다.
import { openaiSTT } from "../openai";
import type { STTProvider } from "../types";
import { lazy, type ProviderStatus } from "./lazy";

export const getSTT = lazy<STTProvider>(openaiSTT);

export const sttStatus = (): ProviderStatus[] => [{ id: "openai", ready: Boolean(process.env.OPENAI_API_KEY) }];
