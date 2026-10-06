/**
 * 음식 DB 품질 점검 (읽기 전용) — 실DB(Supabase)를 훑어 문제를 센다. docs/design/20 QA 보고서의 데이터 절.
 * 실행 (apps/web): pnpm qa:data            요약만
 *                  pnpm qa:data -- --csv   고칠 목록을 qa-out/*.csv 로 (어드민 검수용, gitignore)
 *
 * 점검: 검수 상태 · 채움률 · 나라별 음식 수(빈 나라) · 같은 나라 같은 이름 · 식이 자기모순(lib/diet/consistency) ·
 *       표준 키로 못 바꾸는 알레르기 표기 · 출처 없는 음식 · 관계가 가리키는 비공개 음식 · 유명도·임베딩 커버리지
 */
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";

loadEnvConfig(process.cwd());
const CSV = process.argv.includes("--csv");

type Row = Record<string, unknown>;

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { ALLERGEN_KEYS, canonAllergens } = await import("@/lib/diet/allergens");
  const { checkDiet } = await import("@/lib/diet/consistency");
  const { DIET_KEYS } = await import("@/lib/foodi/schema");
  const FAME = (await import("@/lib/content/fame.json")).default as Record<string, number>;
  const POP = (await import("@/lib/content/popularity.json")).default as Record<string, number>;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const all = async (table: string, select: string, order: string): Promise<Row[]> => {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select(select).order(order).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data as unknown as Row[]));
      if ((data as unknown[]).length < 1000) return out;
    }
  };

  const [foods, countries, sources, rels, emb] = await Promise.all([
    all("foods", `id, slug, name_ko, name_en, country_code, verified, summary, history, culture_story, image_url, cooking_method, course_type, taste_tags, allergens, ${DIET_KEYS.map((k) => `diet_${k}`).join(", ")}, food_ingredients(role, ingredients(name_ko))`, "id"),
    all("countries", "code, name_ko", "code"),
    all("sources", "food_id", "id"),
    all("food_relations", "from_food_id, to_food_id", "id"),
    all("food_embeddings", "food_id, model", "food_id"),
  ]);
  const pub = foods.filter((f) => f.verified);
  const pct = (n: number, d = pub.length) => `${n} (${((100 * n) / Math.max(1, d)).toFixed(1)}%)`;
  const out: string[] = [];
  const log = (s: string) => (console.log(s), out.push(s));

  log(`음식 ${foods.length} · 공개(verified) ${pub.length} · 비공개 ${foods.length - pub.length}`);
  for (const k of ["summary", "history", "culture_story", "image_url", "cooking_method", "course_type"]) log(`  채움 ${k}: ${pct(pub.filter((f) => f[k]).length)}`);
  log(`  맛 태그 0개: ${pct(pub.filter((f) => !(f.taste_tags as string[])?.length).length)}`);
  const ingOf = (f: Row) => ((f.food_ingredients as { role: string; ingredients: { name_ko: string } | null }[]) ?? []).flatMap((x) => (x.ingredients ? [x.ingredients.name_ko] : []));
  log(`  재료 0개: ${pct(pub.filter((f) => !ingOf(f).length).length)}`);

  const per = new Map<string, number>();
  for (const f of pub) per.set(f.country_code as string, (per.get(f.country_code as string) ?? 0) + 1);
  const empty = countries.filter((c) => !per.has(c.code as string));
  log(`나라 ${countries.length} · 공개 음식 없는 나라 ${empty.length}${empty.length ? `: ${empty.map((c) => c.name_ko).join(", ")}` : ""}`);
  const thin = countries.filter((c) => (per.get(c.code as string) ?? 0) > 0 && (per.get(c.code as string) ?? 0) < 5);
  log(`  음식 5개 미만 나라 ${thin.length}${thin.length ? `: ${thin.map((c) => `${c.name_ko}(${per.get(c.code as string)})`).join(", ")}` : ""}`);

  const dupKey = new Map<string, Row[]>();
  for (const f of pub) {
    const k = `${f.country_code}|${(f.name_ko as string).replace(/\s/g, "")}`;
    (dupKey.get(k) ?? dupKey.set(k, []).get(k)!).push(f);
  }
  const dups = [...dupKey.values()].filter((v) => v.length > 1);
  log(`같은 나라 · 같은 이름(띄어쓰기 무시) ${dups.length}쌍${dups.length ? `: ${dups.slice(0, 15).map((v) => `${v[0].name_ko}(${v.map((x) => x.slug).join("/")})`).join(", ")}` : ""}`);

  const contra = pub.flatMap((f) => {
    const c = checkDiet(Object.fromEntries(DIET_KEYS.map((k) => [k, f[`diet_${k}`]])) as never, ingOf(f));
    return c.downgraded.length ? [{ f, keys: c.downgraded, ing: ingOf(f) }] : [];
  });
  log(`식이 자기모순 (yes 인데 재료와 모순): ${contra.length} — 비건 ${contra.filter((c) => c.keys.includes("vegan")).length} · 채식 ${contra.filter((c) => c.keys.includes("vegetarian")).length}`);

  const raw = new Map<string, number>();
  for (const f of pub) for (const a of canonAllergens(f.allergens as string[])) if (!(ALLERGEN_KEYS as string[]).includes(a)) raw.set(a, (raw.get(a) ?? 0) + 1);
  log(`표준 키로 못 바꾼 알레르기 표기: ${raw.size ? [...raw].map(([a, n]) => `${a}×${n}`).join(", ") : "없음"}`);
  const korean = pub.filter((f) => ((f.allergens as string[]) ?? []).some((a) => /[가-힣]/.test(a))).length;
  log(`  DB 에 한국어 알레르기 표기가 남은 음식: ${pct(korean)} (0011_allergen_keys.sql 실행 전이면 정상)`);

  const withSrc = new Set(sources.map((s) => s.food_id as string));
  log(`출처 없는 공개 음식: ${pct(pub.filter((f) => !withSrc.has(f.id as string)).length)}`);
  const pubIds = new Set(pub.map((f) => f.id as string));
  log(`관계 ${rels.length} · 비공개 음식을 가리키는 것 ${rels.filter((r) => !pubIds.has(r.to_food_id as string) || !pubIds.has(r.from_food_id as string)).length}`);
  log(`나라 안 유명도(fame.json) 커버: ${pct(pub.filter((f) => FAME[f.slug as string]).length)} · 세계 유명도(popularity.json): ${pct(pub.filter((f) => POP[f.slug as string] != null).length)}`);
  const models = new Map<string, number>();
  for (const e of emb) models.set(e.model as string, (models.get(e.model as string) ?? 0) + 1);
  log(`임베딩 ${emb.length}${models.size ? ` (${[...models].map(([m, n]) => `${m} ${n}`).join(", ")})` : ""} · 공개 음식 중 없는 것 ${pct(pub.filter((f) => !emb.some((e) => e.food_id === f.id)).length)}`);

  if (CSV) {
    mkdirSync("qa-out", { recursive: true });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    writeFileSync("qa-out/diet-contradictions.csv", "﻿slug,name_ko,country,keys,ingredients\n" + contra.map((c) => [c.f.slug, c.f.name_ko, c.f.country_code, c.keys.join("|"), c.ing.join("|")].map(esc).join(",")).join("\n"));
    writeFileSync("qa-out/duplicate-names.csv", "﻿country,name_ko,slugs\n" + dups.map((v) => [v[0].country_code, v[0].name_ko, v.map((x) => x.slug).join("|")].map(esc).join(",")).join("\n"));
    writeFileSync("qa-out/summary.txt", out.join("\n"));
    console.log("→ qa-out/diet-contradictions.csv · duplicate-names.csv · summary.txt");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
