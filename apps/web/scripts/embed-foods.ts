/**
 * 음식 임베딩 일괄 생성 (docs/design/19 §5) — 1만 개를 한 번에. 어드민 버튼(/api/admin/embeddings/rebuild)과 같은 문서·같은 모델.
 *
 * 실행 (apps/web):  pnpm embed:foods                 지금 모델 임베딩이 없는 음식만 (중간에 끊겨도 다시 돌리면 이어서)
 *                   pnpm embed:foods -- --stale      없는 것 + 문서가 바뀐 것 + 다른 모델로 만든 것 (음식 내용·문서 구성을 고친 뒤)
 *                   pnpm embed:foods -- --all        전부 다시
 *                   pnpm embed:foods -- --dry-run    API·DB 쓰기 없이 할 일 수 · 예상 비용 · 문서 예시만
 *                   pnpm embed:foods -- --limit 500  이번에 만들 최대 개수
 *                   pnpm embed:foods -- --rpm 3000   분당 문서 수 (기본: EMBED_RPM, 없으면 Gemini 무료 등급 80 — 1만 개 약 2시간)
 *
 * 환경변수: apps/web/.env.local 의 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · EMBED_PROVIDER · (GEMINI|OPENAI)_API_KEY. 키 값은 출력하지 않는다.
 * "server-only": package.json 이 `tsx --conditions=react-server` 로 실행한다 (bench-voice.ts 와 같은 방식). lib/env 는 import 시점에 읽으므로 env 를 먼저 읽고 동적 import.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const MODE = args.includes("--all") ? "all" : args.includes("--stale") ? "stale" : "missing";
const limitAt = args.indexOf("--limit");
const LIMIT = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const rpmAt = args.indexOf("--rpm");

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { embedFoods, embedPerMinute, pendingFoodIds, documentFor } = await import("@/lib/admin/embed-batch");
  const { embedConfigError, embedKeyName, embedModel, embedProvider, embedReady, getEmbedder } = await import("@/lib/providers/registry/embed");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요해요 (apps/web/.env.local)");
  const cfg = embedConfigError();
  if (cfg) throw new Error(cfg);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const model = embedModel();
  console.log(`[embed] ${embedProvider()} / ${model} / 1536차원 · ${{ all: "전부 다시", stale: "없거나 바뀐 것", missing: "없는 것만" }[MODE]}${DRY ? " · dry-run" : ""}`);

  const { todo, total } = await pendingFoodIds(db, model, MODE);
  const n = Math.min(todo.length, LIMIT);
  // 문서 1개 ≈ 한국어 450자 ≈ 350토큰 (gemini-embedding-2 $0.20 / 1M, text-embedding-3-small $0.02 / 1M)
  const perM = model.startsWith("gemini") ? 0.2 : 0.02;
  console.log(`[embed] 검수된 음식 ${total}개 중 만들 것 ${todo.length}개 → 이번 ${n}개, 예상 비용 약 $${((n * 350 * perM) / 1e6).toFixed(2)}`);

  if (DRY) {
    const { data } = await db
      .from("foods")
      .select("id, name_ko, name_en, summary, taste_tags, cooking_method, course_type, culture_story, region_in_country, diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free, countries(name_ko), food_ingredients(role, ingredients(name_ko))")
      .in("id", todo.slice(0, 2));
    for (const f of (data ?? []) as Record<string, unknown>[]) console.log(`\n--- 문서 예시 ---\n${documentFor(f)}`);
    return;
  }
  if (!embedReady()) throw new Error(`${embedKeyName()} 가 없어요 (apps/web/.env.local)`);

  const perMinute = rpmAt >= 0 ? Number(args[rpmAt + 1]) : embedPerMinute(embedProvider());
  if (perMinute) console.log(`[embed] 분당 ${perMinute}건으로 천천히 — 예상 ${Math.ceil(n / perMinute)}분 (중간에 끊겨도 다시 돌리면 이어서)`);
  const started = Date.now();
  const r = await embedFoods(db, getEmbedder(), model, {
    mode: MODE,
    limit: n,
    parallel: perMinute ? 1 : 3,
    batch: perMinute ? Math.min(50, Math.max(1, Math.floor(perMinute / 2))) : 50,
    perMinute,
    onWait: (ms, why) => console.log(`[embed] ${why} — ${Math.round(ms / 1000)}초 쉼`),
    onProgress: (done, of, cost) => {
      if (done % 500 < 50 || done === of) console.log(`[embed] ${done}/${of} · $${cost.toFixed(4)} · ${Math.round((Date.now() - started) / 1000)}초`);
    },
  });
  console.log(`[embed] 완료 — ${r.embedded}개 · 남은 ${r.remaining}개 · $${r.costUsd}`);
}

main().catch((e) => {
  console.error(`[embed] 실패: ${e instanceof Error ? e.message : String(e)}`);
  if (e instanceof Error && /PerDay/.test(e.message))
    console.error(
      "[embed] Gemini 무료 등급의 하루 한도(임베딩 1,000건/일)에 걸렸어요. 만든 것은 저장됐고, 내일 다시 돌리면 이어서 만들어요.\n" +
        "        한 번에 끝내려면 Google AI Studio 에서 결제를 켜세요(1만 개 약 $0.7) — 그 뒤 EMBED_RPM=3000 pnpm embed:foods",
    );
  process.exit(1);
});
