"use client";
import Link from "next/link";
import type { Country } from "@/lib/content/types";
import { TASTE_LABEL } from "@/lib/content/types";
import { exploredCountries, foodDna, update, useLocal, type PassportStatus } from "@/lib/client/passport";
import { ALLERGENS, DIET_KEYS } from "@/lib/foodi/schema";
import { ALLERGEN_LABEL, DIET_LABEL } from "./DietBadge";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner, Section, Wordmark } from "./bits";
import { ShareCardButton } from "./ShareCardButton";
import { VoiceSettings } from "./settings/VoiceSettings";
import { MyTablePreview } from "./MyTable";
import { AccountCard, AccountNudge } from "./AccountCard";
import { useAccount } from "@/lib/client/account";
import { QuestBoard } from "./QuestBoard";

const CONTINENTS: Record<string, string> = { asia: "아시아", europe: "유럽", mena_africa: "중동·아프리카", americas: "아메리카", oceania: "오세아니아" };

export function PassportView({ countries, preview }: { countries: Country[]; preview: boolean }) {
  const { open } = useFoodi();
  const explored = useLocal(exploredCountries);
  const entries = useLocal((s) => Object.entries(s.entries));
  const dna = useLocal(foodDna);
  const diet = useLocal((s) => s.diet);
  const allergens = useLocal((s) => s.allergens ?? []);
  const signedIn = useAccount().status === "user";

  const listOf = (st: PassportStatus) => entries.filter(([, e]) => e.statuses.includes(st));
  const continents = Object.entries(CONTINENTS).map(([k, label]) => {
    const all = countries.filter((c) => c.continent_group === k);
    // 탐험한 나라를 앞에, 나머지는 가나다순 — 130개국이라 대륙별로 나눠 보여 준다
    const sorted = [...all].sort((a, b) => Number(explored.includes(b.code)) - Number(explored.includes(a.code)) || a.name_ko.localeCompare(b.name_ko, "ko"));
    return { key: k, label, total: all.length, done: all.filter((c) => explored.includes(c.code)).length, countries: sorted };
  });

  return (
    <main className="space-y-8 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-2">
          <Link href="/map" className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium text-green-800 transition active:scale-95">
            🗺 지도
          </Link>
          <span className="text-sm font-semibold text-green-800">📕 Passport</span>
        </div>
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
        <ShareCardButton explored={explored} countries={countries} foodCount={entries.length} dna={dna} />
      </section>

      <Section title="My Table">
        <MyTablePreview countries={countries} />
      </Section>
      <AccountNudge foods={entries.length} />

      <Section title="국기 그리드" more={<span className="text-caption text-muted">{explored.length}/{countries.length}개국</span>}>
        <div className="space-y-5">
          {continents.map((ct) => (
            <div key={ct.key} className="space-y-2">
              <p className="flex items-baseline justify-between text-sm font-semibold text-charcoal/80">
                {ct.label}
                <span className="text-caption font-medium tabular-nums text-muted">
                  {ct.done}/{ct.total}
                </span>
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {ct.countries.map((c) => {
                  const on = explored.includes(c.code);
                  return (
                    <Link
                      key={c.code}
                      href={`/country/${c.code}`}
                      title={c.name_ko}
                      className={`grid aspect-square place-items-center rounded-xl text-[1.6rem] transition active:scale-95 ${on ? "bg-surface shadow-sm" : "bg-line/50 opacity-45 grayscale"}`}
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
            </div>
          ))}
        </div>
      </Section>

      <Section title="Food DNA">
        <DnaRadar weights={dna} />
      </Section>

      <Section title="이번 주 퀘스트">
        <QuestBoard />
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

      <Section title="식이 조건 · 알레르기">
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
        <div className="flex flex-wrap gap-2 pt-1">
          {ALLERGENS.map((a) => {
            const on = allergens.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => update((s) => ({ ...s, allergens: on ? (s.allergens ?? []).filter((x) => x !== a) : [...(s.allergens ?? []), a] }))}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-diet-no bg-diet-no/10 font-medium text-diet-no" : "border-line bg-surface text-charcoal/70"}`}
              >
                {on ? "✕ " : ""}
                {ALLERGEN_LABEL[a]}
              </button>
            );
          })}
        </div>
        <p className="text-caption text-muted">추천 필터에만 쓰이고 {signedIn ? "내 계정에만" : "이 기기에만"} 저장돼요. 빨간 재료가 든 음식은 추천하지 않아요.</p>
      </Section>

      <Section title="음성 설정">
        <VoiceSettings />
      </Section>

      <Section title="계정">
        <AccountCard />
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
  if (top.length < 3) return <p className="text-sm text-muted">맛이 다른 음식을 몇 가지 더 탐험하면 나의 맛 지도가 그려져요.</p>;
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
