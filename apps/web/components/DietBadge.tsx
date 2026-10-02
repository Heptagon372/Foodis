import type { DietKey, DietLevel } from "@/lib/foodi/schema";
import { Icon, type IconName } from "./icons";

export const ALLERGEN_LABEL: Record<string, string> = { nuts: "견과류", peanut: "땅콩", shellfish: "갑각류", fish: "생선", egg: "달걀", soy: "대두", wheat: "밀", dairy: "유제품", sesame: "참깨" };

export const DIET_LABEL: Record<DietKey, string> = { vegan: "비건", vegetarian: "채식", halal: "할랄", gluten_free: "글루텐 프리", dairy_free: "유제품 없음" };

// 식이 배지 3단계 (05 문서 §7): 확실 ✓ / 조리법에 따라 다름 ! / 미확인 ?. 'no' 는 배지 대신 표에서만 보여준다.
// 안전 정보라 색만으로 구분하지 않는다 — 라인 아이콘(currentColor) + 글자 + 스크린리더 힌트
export const DIET_STYLE: Record<DietLevel, { icon: IconName; cls: string; hint: string }> = {
  yes: { icon: "check", cls: "bg-diet-ok/10 text-diet-ok", hint: "확실" },
  depends: { icon: "warn", cls: "bg-diet-warn/14 text-diet-warn-ink", hint: "조리법에 따라 다름" },
  no: { icon: "close", cls: "bg-diet-no/10 text-diet-no", hint: "해당 안 됨" },
  unknown: { icon: "help", cls: "bg-sunken text-ink-soft", hint: "확인 필요" },
};

export function DietBadge({ k, level, size = "md" }: { k: DietKey; level: DietLevel; size?: "sm" | "md" }) {
  const s = DIET_STYLE[level];
  return (
    <span
      title={`${DIET_LABEL[k]}: ${s.hint}`}
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${s.cls} ${size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-caption"}`}
    >
      <Icon name={s.icon} className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.5} />
      {DIET_LABEL[k]}
      <span className="sr-only">({s.hint})</span>
    </span>
  );
}

/** 카드용: 확실(yes)·조리법 따라(depends)만 최대 n개 */
export function DietBadges({ diet, max = 3, size = "sm" }: { diet: Record<DietKey, DietLevel>; max?: number; size?: "sm" | "md" }) {
  const shown = (Object.keys(DIET_LABEL) as DietKey[]).filter((k) => diet[k] === "yes" || diet[k] === "depends").slice(0, max);
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((k) => (
        <DietBadge key={k} k={k} level={diet[k]} size={size} />
      ))}
    </div>
  );
}
