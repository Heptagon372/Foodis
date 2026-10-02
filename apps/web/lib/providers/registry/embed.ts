// 검색 임베딩 선택 (EMBED_PROVIDER=openai|gemini, 기본 openai). DB vector(1536) 과 차원이 반드시 같아야 한다.
// 질의 벡터와 음식 문서 벡터는 같은 모델로 만들어야 비교된다 → 제공자를 바꾸면 어드민 "임베딩 전체 다시 만들기"로 전부 재생성
// (재생성 라우트는 food_embeddings.model 이 지금 모델과 다른 행도 '없는 것'으로 보고 다시 만든다).
// 데이터 파이프라인(s09)과 같은 형식: gemini-embedding-2 · 1536차원 · L2 정규화 · 문서 "title: {이름} | text: {본문}" · 질의 "task: search result | query: {검색어}"
import { env } from "@/lib/env";
import { geminiEmbedder } from "../gemini";
import { openaiEmbedder } from "../openai";
import type { Embedder } from "../types";
import { lazy, type ProviderStatus } from "./lazy";

const KEY = { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" } as const;

export const embedProvider = () => (env.embedProvider === "gemini" ? "gemini" : "openai");
/** food_embeddings.model 에 남기는 값 */
export const embedModel = () => env.embeddingModel;
export const embedKeyName = () => KEY[embedProvider()];

/** 제공자와 모델이 어긋나면(예: EMBED_PROVIDER=gemini 인데 EMBEDDING_MODEL=text-embedding-3-small) 임베딩을 쓰지 않는다 — 다른 모델 벡터끼리 비교하면 검색이 조용히 엉망이 된다 */
export function embedConfigError(): string | null {
  const p = embedProvider();
  const m = embedModel();
  if (p === "gemini" && !m.startsWith("gemini-embedding")) return `EMBED_PROVIDER=gemini 인데 EMBEDDING_MODEL=${m} — gemini-embedding-2 로 맞추거나 EMBEDDING_MODEL 을 비우세요`;
  if (p === "openai" && !m.startsWith("text-embedding")) return `EMBED_PROVIDER=openai 인데 EMBEDDING_MODEL=${m} — text-embedding-3-small 로 맞추거나 비우세요`;
  return null;
}

// 서버가 이 모듈을 처음 읽을 때 한 번 알린다 (설정 실수를 로그에서 바로 보이게)
const startupError = embedConfigError();
if (startupError) console.error(`[embed] 설정 불일치: ${startupError} — 벡터 검색을 끄고 키워드 검색만 씁니다`);

export const embedReady = () => Boolean(process.env[embedKeyName()]) && !embedConfigError();

export const getEmbedder = lazy<Embedder>(() => (embedProvider() === "gemini" ? geminiEmbedder({ model: embedModel() }) : openaiEmbedder()));

export const embedStatus = (): ProviderStatus[] => {
  const err = embedConfigError();
  return [{ id: embedProvider(), ready: embedReady(), note: err ?? `${embedModel()} · 1536차원` }];
};
