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
import { ThemeToggle } from "./ThemeToggle";
import { Icon, type IconName } from "./icons";
import { btn, chip, Eyebrow, IconTile, ProgressBar } from "./ui";

const CONTINENTS: Record<string, string> = { asia: "아시아", europe: "유럽", mena_africa: "중동·아프리카", americas: "아메리카", oceania: "오세아니아" };
const STATUS_HEAD: Record<"liked" | "saved" | "tried", { title: string; icon: IconName }> = {
  liked: { title: "좋아요", icon: "heart" },
  saved: { title: "저장", icon: "bookmark" },
  tried: { title: "먹어봤어요", icon: "stamp" },
};

export function PassportView({ countries, preview }: { countries: Country[]; preview: boolean }) {
  const { open } = useFoodi();
  const explored = useLocal(exploredCountries);
  const entries = useLocal((s) => Object.entries(s.entries));
  const dna = useLocal(foodDna);
  const diet = useLocal((s) => s.diet);
  const allergens = useLocal((s) => s.allergens ?? []);
  const acctStatus = useAccount().status;
  const signedIn = acctStatus === "user";

  const listOf = (st: PassportStatus) => entries.filter(([, e]) => e.statuses.includes(st));
  const continents = Object.entries(CONTINENTS).map(([k, label]) => {
    const all = countries.filter((c) => c.continent_group === k);
    // 탐험한 나라를 앞에, 나머지는 가나다순 — 130개국이라 대륙별로 나눠 보여 준다
    const sorted = [...all].sort((a, b) => Number(explored.includes(b.code)) - Number(explored.includes(a.code)) || a.name_ko.localeCompare(b.name_ko, "ko"));
    return { key: k, label, total: all.length, done: all.filter((c) => explored.includes(c.code)).length, countries: sorted };
  });

  return (
    <main className="space-y-8 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <Wordmark />
        <h1 className="sr-only">Passport</h1>
        <div className="flex items-center gap-2">
          <Link href="/map" className="glass inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-caption font-semibold text-ink transition active:scale-95">
            <Icon name="map" className="size-[18px] text-leaf" />
            지도
          </Link>
          <ThemeToggle />
        </div>
      </header>
      {preview && <PreviewBanner />}

      {/* 요약 (레퍼런스 온실 대시보드): 큰 숫자 두 개 + 대륙별 진행 바 */}
      <section className="meadow-panel space-y-5 rounded-[28px] p-5 shadow-soft" aria-label="탐험 요약">
        <div className="space-y-3">
          <Eyebrow>My Passport</Eyebrow>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="sr-only">탐험한 나라</dt>
              <dd className="flex items-baseline gap-1">
                <span className="text-display font-semibold tabular-nums text-leaf">{explored.length}</span>
                <span className="text-sm font-medium text-ink-soft">개국</span>
              </dd>
            </div>
            <div>
              <dt className="sr-only">탐험한 음식</dt>
              <dd className="flex items-baseline gap-1">
                <span className="text-display font-semibold tabular-nums text-leaf">{entries.length}</span>
                <span className="text-sm font-medium text-ink-soft">개 음식</span>
              </dd>
            </div>
          </dl>
          <p className="text-sm text-ink-soft">탐험한 기록이 나만의 식탁이 돼요.</p>
        </div>
        <div className="space-y-2.5">
          {continents.map((c) => (
            <div key={c.label} className="flex items-center gap-3 text-caption">
              <span className="w-24 shrink-0 font-medium text-ink-soft">{c.label}</span>
              <ProgressBar value={c.done} max={c.total} label={`${c.label} 탐험`} />
              <span className="w-12 text-right font-semibold tabular-nums text-ink">
                {c.done}
                <span className="font-normal text-muted">/{c.total}</span>
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
              <p className="flex items-baseline justify-between text-sm font-semibold text-ink-soft">
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
                      className={`relative grid aspect-square min-h-10 place-items-center rounded-2xl text-[1.6rem] transition active:scale-95 ${on ? "bg-surface shadow-soft" : "bg-sunken opacity-45 grayscale"}`}
                      // 탐험한 나라 = 그 나라 Accent 를 옅게 두른 테두리 (콘텐츠 색)
                      style={on ? { boxShadow: `inset 0 0 0 2px ${c.accent_color}55` } : undefined}
                    >
                      <span aria-hidden>{c.flag_emoji}</span>
                      {/* 색·흐림만으로 말하지 않게 탐험한 칸엔 작은 체크 */}
                      {on && (
                        <span className="absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full bg-brand text-on-brand" aria-hidden>
                          <Icon name="check" className="size-2.5" strokeWidth={3} />
                        </span>
                      )}
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
          // Section 은 글자 제목만 받아서, 아이콘 타일을 곁들인 제목을 여기서 그린다
          <section key={st} className="space-y-3">
            <h2 className="flex items-center gap-2.5 text-title font-bold text-ink">
              <IconTile icon={STATUS_HEAD[st].icon} size="sm" />
              {STATUS_HEAD[st].title}
              <span className="text-caption font-medium tabular-nums text-muted">{items.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {items.map(([id, e]) => (
                <Link key={id} href={`/food/${e.slug}`} className="glass inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-ink transition active:scale-95">
                  <span aria-hidden>{e.flag}</span>
                  {e.name_ko}
                </Link>
              ))}
            </div>
          </section>
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
                className={chip(on)}
              >
                {on && <Icon name="check" className="size-4" strokeWidth={2.25} />}
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
                // 고른 알레르기 재료는 '빼는 것'이라 초록이 아니라 빨강 의미색 + X 아이콘
                className={
                  on
                    ? "inline-flex h-10 select-none items-center gap-1.5 rounded-full border border-diet-no bg-diet-no/10 px-4 text-sm font-semibold text-diet-no transition active:scale-[0.97]"
                    : chip(false)
                }
              >
                {on && <Icon name="close" className="size-4" strokeWidth={2.25} />}
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

      {/* 로그인 기능이 꺼진 배포(off)에선 빈 제목만 남지 않게 섹션째 숨긴다 — off 는 서버·브라우저가 같아 깜빡임 없음 */}
      {acctStatus !== "off" && (
        <Section title="계정">
          <AccountCard />
        </Section>
      )}

      {/* 화면의 연두 CTA 는 이것 하나 */}
      <button type="button" onClick={() => open({ listen: true })} className={`${btn("lime", "lg")} w-full`}>
        <Icon name="mic" className="size-5" />
        푸디야, 다음은 어디로?
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
  // 색은 모두 CSS 변수 → 테마가 바뀌면 같이 바뀐다
  return (
    <figure className="card space-y-2 rounded-3xl p-4">
      <svg viewBox="0 0 220 220" className="mx-auto w-full max-w-64" role="img" aria-label={`Food DNA: ${top.map(([t]) => TASTE_LABEL[t] ?? t).join(", ")}`}>
        {[0.33, 0.66, 1].map((k) => (
          <polygon key={k} points={top.map((_, i) => pt(i, R * k).join(",")).join(" ")} fill="none" stroke="var(--color-line)" />
        ))}
        {top.map((_, i) => {
          const [x, y] = pt(i, R);
          return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--color-line)" />;
        })}
        <polygon points={poly} fill="var(--color-lime)" fillOpacity="0.5" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" />
        {top.map(([t, w], i) => {
          const [x, y] = pt(i, (w / max) * R);
          return <circle key={t} cx={x} cy={y} r="3" fill="var(--color-brand)" />;
        })}
        {top.map(([t], i) => {
          const [x, y] = pt(i, R + 18);
          return (
            <text key={t} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="500" fill="var(--color-ink-soft)">
              {TASTE_LABEL[t] ?? t}
            </text>
          );
        })}
      </svg>
      <figcaption className="text-center text-sm text-ink-soft">
        <b className="font-semibold text-leaf">{TASTE_LABEL[top[0][0]] ?? top[0][0]}</b>·<b className="font-semibold text-leaf">{TASTE_LABEL[top[1][0]] ?? top[1][0]}</b> 쪽으로 끌리는 탐험가예요.
      </figcaption>
    </figure>
  );
}
