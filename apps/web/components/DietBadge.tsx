import type { DietKey, DietLevel } from "@/lib/foodi/schema";

export const DIET_LABEL: Record<DietKey, string> = { vegan: "비건", vegetarian: "채식", halal: "할랄", gluten_free: "글루텐 프리", dairy_free: "유제품 없음" };

// 식이 배지 3단계 (05 문서 §7): 확실 ✅ / 조리법에 따라 다름 ⚠️ / 미확인 ❓. 'no' 는 배지 대신 표에서만 보여준다.
const STYLE: Record<DietLevel, { icon: string; cls: string; hint: string }> = {
  yes: { icon: "✓", cls: "bg-diet-ok/12 text-diet-ok", hint: "확실" },
  depends: { icon: "!", cls: "bg-diet-warn/15 text-[#9a6d0c]", hint: "조리법에 따라 다름" },
  no: { icon: "✕", cls: "bg-diet-no/10 text-diet-no", hint: "해당 안 됨" },
  unknown: { icon: "?", cls: "bg-diet-unknown/15 text-[#5f6672]", hint: "확인 필요" },
};

export function DietBadge({ k, level, size = "md" }: { k: DietKey; level: DietLevel; size?: "sm" | "md" }) {
  const s = STYLE[level];
  return (
    <span
      title={`${DIET_LABEL[k]}: ${s.hint}`}
      className={`inline-flex items-center gap-1 rounded-full font-medium ${s.cls} ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-caption"}`}
    >
      <span aria-hidden className="font-bold">{s.icon}</span>
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
