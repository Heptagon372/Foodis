// 검색 임베딩 선택. DB vector(1536) 과 차원이 반드시 같아야 한다.
import { openaiEmbedder } from "../openai";
import type { Embedder } from "../types";
import { lazy, type ProviderStatus } from "./lazy";

export const getEmbedder = lazy<Embedder>(openaiEmbedder);

export const embedStatus = (): ProviderStatus[] => [{ id: "openai", ready: Boolean(process.env.OPENAI_API_KEY) }];
