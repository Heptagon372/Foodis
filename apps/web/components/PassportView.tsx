"use client";
import Link from "next/link";
import type { Country } from "@/lib/content/types";
import { TASTE_LABEL } from "@/lib/content/types";
import { exploredCountries, foodDna, update, useLocal, type PassportStatus } from "@/lib/client/passport";
import { DIET_KEYS } from "@/lib/foodi/schema";
import { DIET_LABEL } from "./DietBadge";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner, Section, Wordmark } from "./bits";

const CONTINENTS: Record<string, string> = { asia: "아시아", europe: "유럽", mena_africa: "중동·아프리카", americas: "아메리카" };

export function PassportView({ countries, preview }: { countries: Country[]; preview: boolean }) {
  const { open } = useFoodi();
  const explored = useLocal(exploredCountries);
  const entries = useLocal((s) => Object.entries(s.entries));
  const dna = useLocal(foodDna);
  const diet = useLocal((s) => s.diet);

  const listOf = (st: PassportStatus) => entries.filter(([, e]) => e.statuses.includes(st));
  const continents = Object.entries(CONTINENTS).map(([k, label]) => {
    const all = countries.filter((c) => c.continent_group === k);
    return { label, total: all.length, done: all.filter((c) => explored.includes(c.code)).length };
  });

  return (
    <main className="space-y-8 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Wordmark />
        <span className="text-sm font-semibold text-green-800">📕 Passport</span>
      </header>
      {preview && <PreviewBanner />}

      <section className="space-y-4 rounded-3xl bg-green-800 p-5 text-ivory">
        <p className="font-display text-[2rem] font-semibold leading-tight">
          {explored.length}개국 · {entries.length}개 음식
        </p>
        <p className="text-sm text-ivory/75">탐험한 기록이 나만의 식탁이 돼요.</p>
        <div className="space-y-2">
          {continents.map((c) => (
            <div key={c.label} className="flex items-center gap-3 text-caption">
              <span className="w-24 shrink-0">{c.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-ivory/20">
                <span className="block h-full rounded-full bg-mint-500 transition-[width] duration-300" style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} />
              </span>
              <span className="w-10 text-right tabular-nums">
                {c.done}/{c.total}
              </span>
            </div>
          ))}
        </div>
      </section>

      <Section title="국기 그리드">
        <div className="grid grid-cols-6 gap-2">
          {countries.map((c) => {
            const on = explored.includes(c.code);
            return (
              <Link
                key={c.code}
                href={`/country/${c.code}`}
                title={c.name_ko}
                className={`grid aspect-square place-items-center rounded-xl text-2xl transition active:scale-95 ${on ? "bg-surface shadow-sm" : "bg-line/50 opacity-45 grayscale"}`}
                style={on ? { boxShadow: `inset 0 0 0 2px ${c.accent_color}55` } : undefined}
              >
                <span aria-hidden>{c.flag_emoji}</span>
                <span className="sr-only">
                  {c.name_ko} {on ? "탐험함" : "미탐험"}
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section title="Food DNA">
        <DnaRadar weights={dna} />
      </Section>

      {(["liked", "saved", "tried"] as const).map((st) => {
        const items = listOf(st);
        if (!items.length) return null;
        return (
          <Section key={st} title={st === "liked" ? "❤️ 좋아요" : st === "saved" ? "🔖 저장" : "📕 먹어봤어요"}>
            <div className="flex flex-wrap gap-2">
              {items.map(([id, e]) => (
                <Link key={id} href={`/food/${e.slug}`} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium">
                  <span aria-hidden>{e.flag}</span>
                  {e.name_ko}
                </Link>
              ))}
            </div>
          </Section>
        );
      })}

      <Section title="식이 조건">
        <div className="flex flex-wrap gap-2">
          {DIET_KEYS.map((k) => {
            const on = diet.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => update((s) => ({ ...s, diet: on ? s.diet.filter((x) => x !== k) : [...s.diet, k] }))}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${on ? "border-mint-500 bg-mint-100 text-green-800" : "border-line bg-surface text-charcoal/80"}`}
              >
                {on ? "✓ " : ""}
                {DIET_LABEL[k]}
              </button>
            );
          })}
        </div>
        <p className="text-caption text-muted">추천 필터에만 쓰이고 이 기기에만 저장돼요.</p>
      </Section>

      <button type="button" onClick={() => open({ listen: true })} className="w-full rounded-full bg-mint-500 py-4 font-semibold text-green-800">
        🎙 푸디야, 다음은 어디로?
      </button>
    </main>
  );
}

/** Food DNA 레이더: 가중치 상위 6개 태그. 데이터가 없으면 빈 축 + 안내 */
function DnaRadar({ weights }: { weights: Record<string, number> }) {
  const top = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (top.length < 3) return <p className="text-sm text-muted">음식을 3가지 이상 탐험하면 나의 맛 지도가 그려져요.</p>;
  const max = top[0][1];
  const R = 80;
  const C = 110;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / top.length - Math.PI / 2;
    return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const;
  };
  const poly = top.map(([, w], i) => pt(i, (w / max) * R).join(",")).join(" ");
  return (
    <figure className="space-y-2 rounded-3xl bg-surface p-4 shadow-sm">
      <svg viewBox="0 0 220 220" className="mx-auto w-full max-w-64" role="img" aria-label={`Food DNA: ${top.map(([t]) => TASTE_LABEL[t] ?? t).join(", ")}`}>
        {[0.33, 0.66, 1].map((k) => (
          <polygon key={k} points={top.map((_, i) => pt(i, R * k).join(",")).join(" ")} fill="none" stroke="var(--color-line)" />
        ))}
        <polygon points={poly} fill="var(--color-mint-500)" fillOpacity="0.35" stroke="var(--color-green-800)" strokeWidth="2" strokeLinejoin="round" />
        {top.map(([t], i) => {
          const [x, y] = pt(i, R + 18);
          return (
            <text key={t} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="var(--color-charcoal)">
              {TASTE_LABEL[t] ?? t}
            </text>
          );
        })}
      </svg>
      <figcaption className="text-center text-sm">
        <b className="text-green-800">{TASTE_LABEL[top[0][0]] ?? top[0][0]}</b>·<b className="text-green-800">{TASTE_LABEL[top[1][0]] ?? top[1][0]}</b> 쪽으로 끌리는 탐험가예요.
      </figcaption>
    </figure>
  );
}
