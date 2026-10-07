"use client";
// 식단 카테고리 경고 UI (docs/design/15): 고른 조건에 맞지 않는 음식은 카드·상세에 빨간 라인, 확인이 필요하면 노란 라인.
// 안전 정보라 색만으로 말하지 않는다 — 라인 + 아이콘 + 글자 ("할랄 · 돼지고기").
import Link from "next/link";
import { useMemo } from "react";
import { useLocal } from "@/lib/client/passport";
import { assess, categoryOf, FLAG_LABEL, GROUP_LABEL, GUARD_KEYS, hitLine, selectedGuards, type GuardFood, type GuardGroup, type GuardKey, type GuardResult } from "@/lib/diet/guard";
import type { DietKey } from "@/lib/foodi/schema";
import { Icon } from "./icons";

const EMPTY: string[] = [];

/** 지금 사용자가 고른 조건으로 이 음식을 판정 (하이드레이션 전에는 조건 없음 → 경고 없음) */
export function useGuard(food: GuardFood): GuardResult {
  const diet = useLocal((s) => s.diet);
  const guards = useLocal((s) => s.guards ?? EMPTY);
  const allergens = useLocal((s) => s.allergens ?? EMPTY);
  return useMemo(() => assess(food, { guards: selectedGuards(diet, guards), allergens }), [food, diet, guards, allergens]);
}

/** 카드 테두리: 위험 = 빨간 라인(굵게), 주의 = 노란 라인 */
export const guardRing = (r: GuardResult) =>
  r.level === "danger" ? "ring-2 ring-diet-no ring-offset-2 ring-offset-canvas" : r.level === "caution" ? "ring-[1.5px] ring-diet-warn/80 ring-offset-2 ring-offset-canvas" : "";

/** 카드 위에 얹는 짧은 표시. 첫 이유 + 나머지 개수 */
export function GuardTag({ r, size = "sm" }: { r: GuardResult; size?: "sm" | "md" }) {
  const top = r.hits[0];
  if (!top) return null;
  const danger = top.level === "danger";
  return (
    <span
      title={r.hits.map(hitLine).join("\n")}
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-semibold ${size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-caption"} ${danger ? "bg-diet-no text-white" : "bg-diet-warn text-shade"}`}
    >
      <Icon name={danger ? "close" : "warn"} className="size-3.5 shrink-0" strokeWidth={2.5} />
      <span className="sr-only">{danger ? "내 식단에 위험: " : "내 식단에 주의: "}</span>
      <span className="truncate">{hitLine(top)}</span>
      {r.hits.length > 1 && <span className="shrink-0 opacity-80">+{r.hits.length - 1}</span>}
    </span>
  );
}

const STATUS = {
  danger: { text: "위험", icon: "close", cls: "border-diet-no bg-diet-no/10 text-diet-no" },
  caution: { text: "주의", icon: "warn", cls: "border-diet-warn/60 bg-diet-warn/10 text-diet-warn-ink" },
} as const;

/** 상세 상단 경고 띠 — 위험·주의가 있을 때만 */
export function GuardBanner({ food }: { food: GuardFood }) {
  const r = useGuard(food);
  if (r.level !== "danger" && r.level !== "caution") return null;
  const s = STATUS[r.level];
  return (
    <div role="alert" className={`flex items-start gap-2.5 rounded-2xl border-2 px-3.5 py-3 text-sm ${s.cls}`}>
      <Icon name={s.icon} className="mt-0.5 size-5 shrink-0" strokeWidth={2.5} />
      <div className="min-w-0 space-y-1">
        <p className="font-bold">{r.level === "danger" ? "내 식단에 맞지 않아요" : "내 식단이면 확인이 필요해요"}</p>
        <ul className="space-y-0.5 text-ink">
          {r.hits.map((h) => (
            <li key={h.key}>
              <span className={`font-semibold ${h.level === "danger" ? "text-diet-no" : "text-diet-warn-ink"}`}>{h.label}</span> — {h.reasons.map((f) => FLAG_LABEL[f]).join(", ")}
              {h.level === "caution" ? " (조리법에 따라)" : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 상세 '식이' 탭: 고른 카테고리마다 결과 한 줄. 고른 게 없으면 설정으로 안내 */
export function GuardTable({ food }: { food: GuardFood }) {
  const r = useGuard(food);
  const diet = useLocal((s) => s.diet);
  const guards = useLocal((s) => s.guards ?? EMPTY);
  const keys = selectedGuards(diet, guards);
  if (r.level === null)
    return (
      <Link href="/settings#diet" className="card flex items-center gap-3 rounded-3xl px-4 py-3.5 text-sm text-ink-soft">
        <Icon name="salad" className="size-5 shrink-0 text-leaf" />
        <span className="flex-1">식단 조건을 고르면 안 맞는 음식에 빨간 라인이 떠요.</span>
        <Icon name="next" className="size-4 shrink-0" />
      </Link>
    );
  const byKey = new Map(r.hits.map((h) => [h.key, h]));
  const rows = [...r.hits.filter((h) => h.key.startsWith("allergen:")).map((h) => ({ key: h.key, label: h.label, hit: h })), ...keys.map((k) => ({ key: k, label: categoryOf(k).label, hit: byKey.get(k) }))];
  return (
    <table className="card w-full overflow-hidden rounded-3xl text-sm">
      <caption className="px-4 pb-1 pt-3.5 text-left text-caption font-semibold text-muted">내가 고른 식단 조건</caption>
      <tbody>
        {rows.map(({ key, label, hit }) => (
          <tr key={key} className={`border-b border-line last:border-0 ${hit?.level === "danger" ? "bg-diet-no/5 shadow-[inset_4px_0_0_var(--color-diet-no)]" : hit ? "shadow-[inset_4px_0_0_var(--color-diet-warn)]" : ""}`}>
            <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
              {label}
              {hit && <span className="block text-caption font-normal text-muted">{hit.reasons.map((f) => FLAG_LABEL[f]).join(", ")}</span>}
            </th>
            <td className={`px-4 py-3 text-right font-semibold ${hit ? (hit.level === "danger" ? "text-diet-no" : "text-diet-warn-ink") : r.level === "unknown" ? "text-muted" : "text-diet-ok"}`}>
              {hit ? STATUS[hit.level].text : r.level === "unknown" ? "정보 부족" : "걸리는 재료 없음"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const GROUPS = Object.keys(GROUP_LABEL) as GuardGroup[];

/** 식단 카테고리 고르기 (설정·온보딩 공용). 추천 필터와 같은 조건은 diet 로, 나머지는 guards 로 저장한다 */
/** extraOnly: 온보딩처럼 추천 필터 5종을 따로 보여주는 곳에서는 나머지만 */
export function GuardPicker({ diet, guards, onChange, groups = GROUPS, extraOnly = false }: { diet: DietKey[]; guards: string[]; onChange: (next: { diet: DietKey[]; guards: string[] }) => void; groups?: GuardGroup[]; extraOnly?: boolean }) {
  const on = new Set(selectedGuards(diet, guards));
  const toggle = (k: GuardKey) => {
    const d = categoryOf(k).diet;
    const has = on.has(k);
    if (d) onChange({ diet: has ? diet.filter((x) => x !== d) : [...diet, d], guards });
    else onChange({ diet, guards: has ? guards.filter((x) => x !== k) : [...guards, k] });
  };
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <fieldset key={g} className="space-y-2">
          <legend className="mb-2 text-caption font-semibold text-muted">{GROUP_LABEL[g]}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {GUARD_KEYS.filter((k) => categoryOf(k).group === g && !(extraOnly && categoryOf(k).diet)).map((k) => {
              const c = categoryOf(k);
              const sel = on.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => toggle(k)}
                  className={`flex min-h-14 items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left transition active:scale-[0.98] ${sel ? "border-brand bg-brand text-on-brand shadow-brand" : "border-line bg-surface text-ink"}`}
                >
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${sel ? "border-on-brand/60 bg-on-brand/15" : "border-line"}`} aria-hidden>
                    {sel && <Icon name="check" className="size-3.5" strokeWidth={2.5} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{c.label}</span>
                    <span className={`block text-caption leading-snug ${sel ? "text-on-brand/80" : "text-muted"}`}>{c.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
