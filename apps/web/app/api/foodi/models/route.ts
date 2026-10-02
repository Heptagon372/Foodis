// GET /api/foodi/models — '푸디의 두뇌' 고르기 화면용 목록 (lib/ai/models). ready 는 서버 키 기준, 키 값은 절대 내보내지 않는다.
import { NextResponse } from "next/server";
import { findModel, modelCatalog, PREMIUM_BUDGET_RATIO, PROVIDER_LABEL } from "@/lib/ai/models";
import { enabledProviders, llmProviderReady, tierModels } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const order = enabledProviders();
  // '자동(추천)' 이 지금 실제로 쓰는 모델: 순서상 첫 번째로 준비된 제공자의 답변(smart) 모델
  const first = order.find(llmProviderReady);
  const autoId = first && tierModels(first).smart;
  return NextResponse.json({
    auto: first && autoId ? { id: autoId, label: findModel(autoId)?.label_ko ?? autoId, provider: first } : null,
    providers: order.map((p) => ({ id: p, label: PROVIDER_LABEL[p], ready: llmProviderReady(p) })),
    models: modelCatalog().map((m) => ({ ...m, ready: llmProviderReady(m.provider) })),
    premium_budget_ratio: PREMIUM_BUDGET_RATIO,
  });
}
