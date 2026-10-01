"use client";
// 음식 편집·검수 (F-ADM-01). 규칙 위반은 저장 전에 바로 보여 주고, 근거 링크를 옆에 둔다.
// 저장하면 검수가 풀리고(내가 작성자), 승인은 다른 사람이 한다 — 07 문서 거버넌스.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DIET_LABEL } from "@/components/DietBadge";
import { ALLERGEN_LABEL } from "@/components/DietBadge";
import { TASTE_LABEL } from "@/lib/content/types";
import { dietProblems, levelLabel, type FoodEdit } from "@/lib/admin/rules";
import { ALLERGENS, DIET_KEYS, type DietLevel } from "@/lib/foodi/schema";
import { ActionButton, callApi } from "./ui";

type Props = {
  id?: string;
  slug?: string;
  verified?: boolean;
  isAuthor?: boolean;
  role: string | null;
  countries: { code: string; name_ko: string; flag_emoji: string }[];
  evidence: { field: string; url: string; title: string | null; data_source_id: string | null }[];
  reports: { id: string; field: string; message: string | null }[];
  initial: Partial<FoodEdit> & Pick<FoodEdit, "name_ko" | "name_en" | "country_code" | "summary" | "taste_tags" | "allergens" | "diet" | "diet_sources">;
};

const LEVELS: DietLevel[] = ["yes", "depends", "no", "unknown"];
const LEVEL_TONE: Record<DietLevel, string> = { yes: "bg-diet-ok text-white", depends: "bg-diet-warn text-charcoal", no: "bg-diet-no text-white", unknown: "bg-diet-unknown/40 text-charcoal" };
const METHODS = ["fermented", "grilled", "steamed", "stewed", "raw", "fried", "baked", "boiled", "stir_fried", "mixed"];
const COURSES = ["main", "side", "soup", "street", "dessert", "drink", "bread", "condiment"];

export function FoodEditor(p: Props) {
  const router = useRouter();
  const [f, setF] = useState(p.initial);
  const [slug, setSlug] = useState(p.slug ?? "");
  const [sourcesText, setSourcesText] = useState(p.initial.diet_sources.join("\n"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof FoodEdit>(k: K, v: FoodEdit[K] | null) => setF((x) => ({ ...x, [k]: v }));

  const diet_sources = useMemo(() => sourcesText.split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)), [sourcesText]);
  const problems = dietProblems({ diet: f.diet, allergens: f.allergens, diet_sources, diet_note: f.diet_note ?? null });
  const canReview = p.role === "reviewer" || p.role === "admin";

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = { ...f, diet_sources };
      if (p.id) await callApi(`/api/admin/foods/${p.id}`, "PATCH", body);
      else {
        const r = (await callApi("/api/admin/foods", "POST", { ...body, slug })) as { id: string };
        router.replace(`/admin/foods/${r.id}`);
      }
      setMsg({ ok: true, text: "저장했어요 — 검수 대기 상태가 됐어요 (다른 사람이 승인)" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const text = (k: keyof FoodEdit, label: string, rows = 1, hint?: string) => (
    <label className="block space-y-1">
      <span className="text-caption font-semibold text-muted">
        {label}
        {hint && <span className="font-normal"> · {hint}</span>}
      </span>
      {rows === 1 ? (
        <input value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
      ) : (
        <textarea value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} rows={rows} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed" />
      )}
    </label>
  );
  const chips = (all: readonly string[], key: "taste_tags" | "allergens", label: (v: string) => string) => (
    <div className="flex flex-wrap gap-1.5">
      {all.map((v) => {
        const on = (f[key] as string[]).includes(v);
        return (
          <button key={v} type="button" onClick={() => set(key, (on ? (f[key] as string[]).filter((x) => x !== v) : [...(f[key] as string[]), v]) as never)} className={`rounded-full border px-2.5 py-1 text-caption ${on ? "border-green-800 bg-green-800 text-ivory" : "border-line bg-surface"}`}>
            {label(v)}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-h2 font-semibold">{p.id ? f.name_ko || "음식" : "새 음식"}</h1>
          {p.id && (p.verified ? <span className="rounded-full bg-diet-ok/15 px-2.5 py-1 text-caption font-semibold text-diet-ok">✓ 검수 완료</span> : <span className="rounded-full bg-diet-warn/20 px-2.5 py-1 text-caption font-semibold text-[#7a5a10]">검수 대기</span>)}
          {p.slug && (
            <a href={`/food/${p.slug}`} target="_blank" rel="noreferrer" className="text-caption text-muted underline">
              앱에서 보기 ↗
            </a>
          )}
        </div>

        {!p.id && (
          <label className="block space-y-1">
            <span className="text-caption font-semibold text-muted">slug · 영소문자·숫자·하이픈 (예: doro-wat)</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
          </label>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          {text("name_ko", "한국어 이름")}
          {text("name_en", "영어 이름")}
          {text("name_local", "현지 표기")}
          <label className="block space-y-1">
            <span className="text-caption font-semibold text-muted">국가</span>
            <select value={f.country_code} onChange={(e) => set("country_code", e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              {p.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.name_ko}
                </option>
              ))}
            </select>
          </label>
          {text("region_in_country", "지역")}
          {text("origin_note", "기원 메모", 1, "논쟁이 있으면 — 푸디가 단정하지 않음")}
        </section>

        <section className="space-y-3">
          {text("summary", "요약 (필수)", 2, "1~2문장, 푸디가 그대로 읽어요 → 해요체, 괄호 없이")}
          {text("history", "역사", 3, "해요체, 근거에 없으면 비우기")}
          {text("culture_story", "문화 이야기", 5, "250~400자, 60초 음성")}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-caption font-semibold text-muted">조리법</span>
            <select value={f.cooking_method ?? ""} onChange={(e) => set("cooking_method", e.target.value || null)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <option value="">—</option>
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-caption font-semibold text-muted">분류</span>
            <select value={f.course_type ?? ""} onChange={(e) => set("course_type", e.target.value || null)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <option value="">—</option>
              {COURSES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </section>
        <div className="space-y-1.5">
          <p className="text-caption font-semibold text-muted">맛 태그 (최대 8)</p>
          {chips(Object.keys(TASTE_LABEL), "taste_tags", (v) => TASTE_LABEL[v] ?? v)}
        </div>

        <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">식이 정보</h2>
            <a href="https://github.com/Heptagon372/Foodis/blob/main/docs/design/03_%EC%8B%9D%EC%9D%B4_%ED%83%9C%EA%B9%85_%EA%B0%80%EC%9D%B4%EB%93%9C.md" target="_blank" rel="noreferrer" className="text-caption text-muted underline">
              태깅 기준 ↗
            </a>
          </div>
          {DIET_KEYS.map((k) => (
            <div key={k} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-sm font-medium">{DIET_LABEL[k]}</span>
              {LEVELS.map((lv) => (
                <button key={lv} type="button" onClick={() => set("diet", { ...f.diet, [k]: lv })} className={`rounded-lg px-2.5 py-1 text-caption font-semibold ${f.diet[k] === lv ? LEVEL_TONE[lv] : "border border-line text-muted"}`}>
                  {levelLabel[lv]}
                </button>
              ))}
            </div>
          ))}
          <div className="space-y-1.5">
            <p className="text-caption font-semibold text-muted">알레르기 (대표 조리법의 주재료·양념)</p>
            {chips(ALLERGENS, "allergens", (v) => ALLERGEN_LABEL[v] ?? v)}
          </div>
          {text("diet_note", "식이 메모", 2, "depends 면 필수 — 주문할 때 무엇을 확인할지")}
          <label className="block space-y-1">
            <span className="text-caption font-semibold text-muted">식이 출처 URL · 줄마다 하나 · 확정값(가능/불가)은 서로 다른 출처 2개 이상</span>
            <textarea value={sourcesText} onChange={(e) => setSourcesText(e.target.value)} rows={3} className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-caption" placeholder="https://..." />
          </label>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {text("image_url", "이미지 URL")}
          {text("image_credit", "이미지 출처", 1, "작가 / 라이선스 / 원본 — 위키미디어는 필수")}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
          {problems.length ? (
            <ul className="space-y-1 text-caption text-diet-no">
              {problems.map((x) => (
                <li key={x}>✕ {x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-diet-ok">✓ 검수 규칙 통과</p>
          )}
          <button type="button" disabled={busy || problems.length > 0} onClick={save} className="w-full rounded-xl bg-green-800 py-2.5 font-semibold text-ivory disabled:opacity-40">
            {busy ? "저장 중…" : p.id ? "저장 (검수 대기로)" : "만들기"}
          </button>
          {msg && <p className={`whitespace-pre-line text-caption ${msg.ok ? "text-green-800" : "text-diet-no"}`}>{msg.text}</p>}
          {p.id && canReview && (
            <div className="space-y-2 border-t border-line pt-3">
              {p.verified ? (
                <ActionButton url={`/api/admin/foods/${p.id}/verify`} method="DELETE" confirm="승인을 취소할까요? 앱과 푸디에서 바로 빠져요">
                  승인 취소
                </ActionButton>
              ) : p.isAuthor ? (
                p.role === "admin" ? (
                  <ActionButton url={`/api/admin/foods/${p.id}/verify`} body={{ override: true }} tone="danger" confirm="본인이 작성한 음식을 예외 승인합니다 (기록이 남아요). 출처를 모두 확인했나요?">
                    예외 승인 (본인 작성)
                  </ActionButton>
                ) : (
                  <p className="text-caption text-muted">직접 작성·수정한 음식이라 다른 검수자가 승인해야 해요</p>
                )
              ) : (
                <ActionButton url={`/api/admin/foods/${p.id}/verify`} tone="primary" confirm="출처와 식이 정보를 확인했나요? 승인하면 앱·푸디에 바로 나와요">
                  ✓ 검수 승인
                </ActionButton>
              )}
            </div>
          )}
        </div>

        {p.reports.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-diet-no/30 bg-surface p-4">
            <p className="font-semibold text-diet-no">열린 신고 {p.reports.length}건</p>
            {p.reports.map((r) => (
              <p key={r.id} className="text-caption">
                <b>{r.field}</b> — {r.message ?? "(내용 없음)"}
              </p>
            ))}
          </div>
        )}

        {p.evidence.length > 0 && (
          <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
            <p className="font-semibold">근거 자료</p>
            {p.evidence.map((e) => (
              <a key={e.url + e.field} href={e.url.startsWith("http") ? e.url : undefined} target="_blank" rel="noreferrer" className="block truncate text-caption text-green-800 underline">
                {e.title ?? e.url} <span className="text-muted no-underline">· {e.field}</span>
              </a>
            ))}
          </div>
        )}
        {p.id && p.role === "admin" && (
          <ActionButton url={`/api/admin/foods/${p.id}`} method="DELETE" tone="danger" confirm="이 음식을 완전히 삭제할까요? 되돌릴 수 없어요" done={() => "삭제했어요"}>
            삭제
          </ActionButton>
        )}
      </aside>
    </div>
  );
}
