"use client";
import Link from "next/link";
import type { Country, FoodSummary } from "@/lib/content/types";
import { exploredCountries, foodDna, useLocal, type PassportStatus } from "@/lib/client/passport";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner, Section } from "./bits";
import { ShareCardButton } from "./ShareCardButton";
import { MyTablePreview } from "./MyTable";
import { AccountNudge } from "./AccountCard";
import { QuestHomeCard } from "./QuestBoard";
import { TopBar } from "./TopBar";
import { Icon, type IconName } from "./icons";
import { btn, Eyebrow, IconTile, ProgressBar } from "./ui";
import { TasteCard } from "./TasteCard";
import { FoodDna } from "./FoodDna";

const CONTINENTS: Record<string, string> = { asia: "아시아", europe: "유럽", mena_africa: "중동·아프리카", americas: "아메리카", oceania: "오세아니아" };
const STATUS_HEAD: Record<"liked" | "saved" | "tried", { title: string; icon: IconName }> = {
  liked: { title: "좋아요", icon: "heart" },
  saved: { title: "저장", icon: "bookmark" },
  tried: { title: "먹어봤어요", icon: "stamp" },
};

export function PassportView({ countries, foods, preview }: { countries: Country[]; foods: FoodSummary[]; preview: boolean }) {
  const { open } = useFoodi();
  const explored = useLocal(exploredCountries);
  const entries = useLocal((s) => Object.entries(s.entries));
  const dna = useLocal(foodDna);

  const listOf = (st: PassportStatus) => entries.filter(([, e]) => e.statuses.includes(st));
  const continents = Object.entries(CONTINENTS).map(([k, label]) => {
    const all = countries.filter((c) => c.continent_group === k);
    // 탐험한 나라를 앞에, 나머지는 가나다순 — 150개국이라 대륙별로 나눠 보여 준다
    const sorted = [...all].sort((a, b) => Number(explored.includes(b.code)) - Number(explored.includes(a.code)) || a.name_ko.localeCompare(b.name_ko, "ko"));
    return { key: k, label, total: all.length, done: all.filter((c) => explored.includes(c.code)).length, countries: sorted };
  });

  return (
    <main className="space-y-8 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar />
      <h1 className="sr-only">Passport</h1>
      {preview && <PreviewBanner />}

      {/* 데스크톱: 요약 | My Table · 퀘스트 */}
      <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
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

        <div className="space-y-8">
          <Section title="My Table">
            <MyTablePreview countries={countries} />
          </Section>
          <QuestHomeCard />
          <AccountNudge foods={entries.length} />
        </div>
      </div>

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
              <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10 lg:grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))]">
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

      {/* 데스크톱: Food DNA | 취향 분석 */}
      <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <Section title="Food DNA">
          <FoodDna foods={foods} countries={countries} />
        </Section>
        <Section title="내 취향 분석">
          <TasteCard countries={countries} />
        </Section>
      </div>

      {/* 좋아요 · 저장 · 먹어봤어요 — 데스크톱은 세 칸 */}
      {(["liked", "saved", "tried"] as const).some((st) => listOf(st).length) && (
        <div className="space-y-8 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
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
        </div>
      )}

      {/* 화면의 연두 CTA 는 이것 하나 */}
      <button type="button" onClick={() => open({ listen: true })} className={`${btn("lime", "lg")} w-full lg:mx-auto lg:flex lg:w-fit lg:px-10`}>
        <Icon name="mic" className="size-5" />
        푸디야, 다음은 어디로?
      </button>
    </main>
  );
}

