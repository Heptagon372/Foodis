// 검수 규칙 (07 문서 §3.2 거버넌스 · docs/design/03 식이 태깅 기준 · foodis-data s07 과 같은 원칙). 순수 함수 — 테스트 가능.
import { z } from "zod";
import { COURSE_KO, METHOD_KO, TAG_KO, type Course, type Method } from "@/lib/foodi/vocab";
import { ALLERGENS, DIET_KEYS, type DietKey, type DietLevel } from "@/lib/foodi/schema";

const LEVEL = z.enum(["yes", "depends", "no", "unknown"]);
const opt = z
  .string()
  .trim()
  .max(4000)
  .transform((v) => v || null)
  .nullable()
  .optional();

export const FoodEdit = z.object({
  name_ko: z.string().trim().min(1).max(80),
  name_en: z.string().trim().min(1).max(120),
  name_local: opt,
  country_code: z.string().regex(/^[A-Z]{2}$/),
  region_in_country: opt,
  origin_note: opt,
  summary: z.string().trim().min(1, "summary 는 필수예요").max(400),
  history: opt,
  culture_story: opt,
  cooking_method: opt,
  course_type: opt,
  taste_tags: z.array(z.string().max(30)).max(8).default([]),
  allergens: z.array(z.enum(ALLERGENS)).max(9).default([]),
  diet: z.object(Object.fromEntries(DIET_KEYS.map((k) => [k, LEVEL])) as Record<DietKey, typeof LEVEL>),
  diet_note: opt,
  diet_sources: z.array(z.url()).max(10).default([]),
  image_url: opt,
  image_credit: opt,
});
export type FoodEdit = z.infer<typeof FoodEdit>;

/** 저장을 막는 규칙 위반. 빈 배열이면 통과 */
export function dietProblems(f: Pick<FoodEdit, "diet" | "allergens" | "diet_sources" | "diet_note">): string[] {
  const p: string[] = [];
  const decided = DIET_KEYS.filter((k) => f.diet[k] === "yes" || f.diet[k] === "no");
  const distinct = new Set(f.diet_sources.map((u) => u.trim())).size;
  if (decided.length && distinct < 2) p.push(`확정값(yes/no)이 있으면 식이 출처 URL 이 2개 이상 필요해요 (지금 ${distinct}개) — 모르면 unknown`);
  if (f.diet.vegan === "yes" && f.diet.vegetarian !== "yes") p.push("비건이 yes 면 채식도 yes 여야 해요");
  if (f.allergens.includes("dairy") && f.diet.dairy_free === "yes") p.push("유제품 알레르기 표시가 있는데 유제품 없음이 yes 예요");
  if (f.allergens.includes("dairy") && f.diet.vegan === "yes") p.push("유제품 알레르기 표시가 있는데 비건이 yes 예요");
  if (f.allergens.includes("wheat") && f.diet.gluten_free === "yes") p.push("밀 알레르기 표시가 있는데 글루텐 프리가 yes 예요");
  if (["egg", "fish", "shellfish"].some((a) => f.allergens.includes(a as never)) && f.diet.vegan === "yes") p.push("달걀·생선·갑각류가 있는데 비건이 yes 예요");
  if (DIET_KEYS.some((k) => f.diet[k] === "depends") && !f.diet_note) p.push("조리법에 따라 다름(depends)이 있으면 diet_note 에 무엇이 달라지는지 한 문장이 필요해요");
  return p;
}

/** 승인 가능 여부: 작성자와 검수자 분리. admin 은 기록을 남기고 예외 승인 가능 */
export function approvalProblem(input: { role: string | null; userId: string; createdBy: string | null; override: boolean }): string | null {
  if (input.role !== "reviewer" && input.role !== "admin") return "검수 승인은 reviewer 이상만 할 수 있어요";
  if (input.createdBy && input.createdBy === input.userId) {
    if (input.role === "admin" && input.override) return null;
    return "직접 작성·수정한 음식은 다른 사람이 승인해야 해요 (admin 은 예외 승인 가능)";
  }
  return null;
}

export const levelLabel: Record<DietLevel, string> = { yes: "가능", depends: "조리법에 따라", no: "불가", unknown: "미확인" };

// ── CSV (RFC 4180, BOM·CRLF·따옴표 안 줄바꿈 처리) — s07 검수 시트 가져오기용
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

/** s07 review_sheet.csv 한 행 → FoodEdit 후보. 식이는 사람이 적은 final_* 만 믿고, AI 초안(draft_*)은 버린다 */
export function reviewRowToEdit(r: Record<string, string>): { slug: string; edit: FoodEdit } | { slug: string; error: string } {
  const slug = r.slug;
  const level = (v?: string): DietLevel => (["yes", "depends", "no", "unknown"].includes((v ?? "").toLowerCase()) ? ((v ?? "").toLowerCase() as DietLevel) : "unknown");
  const list = (v?: string) => (v ?? "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const parsed = FoodEdit.safeParse({
    name_ko: r.name_ko,
    name_en: r.name_en,
    country_code: r.country_code,
    origin_note: r.origin_note,
    summary: r.summary,
    history: r.history,
    culture_story: r.culture_story,
    taste_tags: list(r.taste_tags),
    allergens: list(r.allergens).filter((a) => (ALLERGENS as readonly string[]).includes(a)),
    diet: Object.fromEntries(DIET_KEYS.map((k) => [k, level(r[`final_${k}`])])),
    diet_note: r.diet_note,
    diet_sources: list(r.diet_sources).filter((u) => /^https?:\/\//.test(u)),
  });
  if (!slug) return { slug: "?", error: "slug 없음" };
  if (!parsed.success) return { slug, error: z.prettifyError(parsed.error).split("\n")[0] };
  return { slug, edit: parsed.data };
}

// ── 임베딩 문서 v2 (docs/design/19 §5). 사람이 말로 찾을 법한 특징을 한국어로 — 질의("튀긴 디저트", "비건 국물")와 같은 말을 쓴다.
// 맛·조리법·코스 이름표는 푸디 질의 해석(lib/foodi/vocab.ts)과 같은 표를 쓴다. 어드민 재생성 라우트 · scripts/embed-foods.ts 가 함께 쓴다.
const DIET_KO: Record<string, string> = { vegan: "비건", vegetarian: "채식", halal: "할랄", gluten_free: "글루텐 프리", dairy_free: "유제품 없음" };
export function embeddingText(f: {
  name_ko: string;
  name_en: string;
  summary: string | null;
  taste_tags: string[];
  cooking_method: string | null;
  course_type: string | null;
  culture_story: string | null;
  diet: Record<string, string>;
  mainIngredients: string[];
  subIngredients?: string[];
  countryKo: string;
  region?: string | null;
}): string {
  const diet = Object.entries(f.diet)
    .filter(([, v]) => v === "yes")
    .map(([k]) => DIET_KO[k] ?? k)
    .join(", ");
  const how = [f.cooking_method ? `조리법: ${METHOD_KO[f.cooking_method as Method] ?? f.cooking_method}` : "", f.course_type ? `종류: ${COURSE_KO[f.course_type as Course] ?? f.course_type}` : ""].filter(Boolean).join(", ");
  const lines = [
    `${f.name_ko} (${f.name_en}) — ${f.countryKo}${f.region ? ` ${f.region}` : ""} 음식`,
    f.summary ?? "",
    f.taste_tags.length ? `맛·특징: ${f.taste_tags.map((t) => TAG_KO[t] ?? t).join(", ")}` : "",
    f.mainIngredients.length ? `주재료: ${f.mainIngredients.join(", ")}` : "",
    f.subIngredients?.length ? `부재료: ${f.subIngredients.join(", ")}` : "",
    how,
  ];
  if (diet) lines.push(`식이: ${diet}`);
  if (f.culture_story) lines.push(f.culture_story.slice(0, 300));
  return lines.filter((l) => l.trim()).join("\n");
}
