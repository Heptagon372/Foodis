// POST /api/admin/embeddings/rebuild — 검수된 음식 임베딩 생성 (F-ADM-02). body: { onlyMissing?: true, limit?: 1500 }
//   onlyMissing=true  → 없는 것만 (mode missing)
//   onlyMissing=false → 없는 것 + 문서가 바뀐 것 + 다른 모델로 만든 것 (mode stale — 이름·소개·재료를 고친 뒤, EMBED_PROVIDER 를 바꾼 뒤)
// 문서 구성은 lib/admin/embed-batch.ts (임베딩 문서 v2, docs/design/19 §5). 1만 개 전체는 scripts/embed-foods.ts 가 더 빠르다.
// 한 번에 limit 개까지만 만들고 남은 수(remaining)를 돌려준다 — 300초 제한 안에서 끝나게. 다시 누르면 이어서 만든다.
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { embedFoods, embedPerMinute } from "@/lib/admin/embed-batch";
import { embedConfigError, embedKeyName, embedModel, embedReady, getEmbedder } from "@/lib/providers";
import { embedProvider } from "@/lib/providers/registry/embed";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const s = await requireApi("admin");
  if (s instanceof Response) return s;
  const cfg = embedConfigError();
  if (cfg) return apiError(412, cfg);
  if (!embedReady()) return apiError(412, `${embedKeyName()} 가 없어요 (apps/web/.env.local)`);
  const { onlyMissing = true, limit = 1500 } = ((await req.json().catch(() => ({}))) ?? {}) as { onlyMissing?: boolean; limit?: number };
  try {
    // 분당 한도가 있으면(Gemini 무료 등급 95) 300초 안에 끝날 만큼만 — 4분 × 한도
    const perMinute = embedPerMinute(embedProvider());
    const cap = perMinute ? perMinute * 4 : 3000;
    const r = await embedFoods(db(), getEmbedder(), embedModel(), {
      mode: onlyMissing ? "missing" : "stale",
      limit: Math.max(1, Math.min(limit, cap)),
      parallel: perMinute ? 1 : 2,
      batch: perMinute ? Math.min(50, Math.floor(perMinute / 2)) : 50,
      perMinute,
    });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return apiError(500, e instanceof Error ? e.message : String(e));
  }
}
