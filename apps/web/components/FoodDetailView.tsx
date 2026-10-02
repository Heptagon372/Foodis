"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RELATION_LABEL, TASTE_LABEL, type FoodDetail, type RelationType } from "@/lib/content/types";
import { record, toggle, useLocal, type FoodRef, type PassportStatus } from "@/lib/client/passport";
import { startRadio } from "@/lib/client/radio";
import { track } from "@/lib/client/track";
import { speak, stopSpeaking } from "@/lib/client/voice";
import { DIET_KEYS } from "@/lib/foodi/schema";
import { ALLERGEN_LABEL, DIET_LABEL, DietBadge } from "./DietBadge";
import { accentBg } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner, RelationRow, SourceFooter } from "./bits";
import { ImageCredit } from "./ImageCredit";
import { ReportForm } from "./ReportForm";
import { MicIcon } from "./VoiceButton";

const TABS = ["기본", "문화", "식이", "연결"] as const;
type Tab = (typeof TABS)[number];

const METHOD_LABEL: Record<string, string> = {
  fermented: "발효", grilled: "구이", steamed: "찜", stewed: "스튜·조림", raw: "날것", fried: "튀김", baked: "굽기(오븐)", boiled: "삶기·끓이기", stir_fried: "볶음", mixed: "섞기",
};
const LEVEL_TEXT = { yes: "가능", depends: "조리법에 따라 다름", no: "해당 안 됨", unknown: "확인 필요" } as const;

export function FoodDetailView({ food, preview }: { food: FoodDetail; preview: boolean }) {
  const [tab, setTab] = useState<Tab>("기본");
  const [telling, setTelling] = useState(false);
  const { open } = useFoodi();
  const ref: FoodRef = { id: food.id, slug: food.slug, name_ko: food.name_ko, flag: food.flag, country_code: food.country_code, taste_tags: food.taste_tags };
  const statuses = useLocal((s) => s.entries[food.id]?.statuses ?? []);

  // 상세를 연 것 자체가 탐험 (F-REC-02)
  useEffect(() => {
    record({ id: food.id, slug: food.slug, name_ko: food.name_ko, flag: food.flag, country_code: food.country_code, taste_tags: food.taste_tags }, "explored");
    track("detail_view", { food_id: food.id }); // KPI Hops: 세션 안 연속 상세 진입
    return () => stopSpeaking();
  }, [food.id, food.slug, food.name_ko, food.flag, food.country_code, food.taste_tags]);

  const tell = () => {
    if (telling) return (stopSpeaking(), setTelling(false));
    const text = food.culture_story ?? food.summary;
    if (!text) return;
    setTelling(true);
    void speak(text, () => setTelling(false));
  };

  const byType = (Object.keys(RELATION_LABEL) as RelationType[]).map((t) => ({ t, items: food.relations.filter((r) => r.type === t) })).filter((g) => g.items.length);

  return (
    <main>
      <header className="relative flex h-72 flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))]" style={accentBg(food.accent, food.image_url)}>
        <Link href="/" className="w-fit rounded-full bg-surface/80 px-3 py-1.5 text-sm backdrop-blur" aria-label="뒤로">
          ← 홈
        </Link>
        <span className="text-7xl drop-shadow" aria-hidden>{food.flag}</span>
        <ImageCredit credit={food.image_credit} className="absolute bottom-9 right-4" />
      </header>

      <div className="-mt-6 space-y-5 rounded-t-[28px] bg-ivory px-5 pt-6">
        {preview && <PreviewBanner />}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/country/${food.country_code}`} className="text-sm font-medium text-muted">
              {food.flag} {food.country.name_ko}
              {food.region_in_country ? ` · ${food.region_in_country}` : ""} ›
            </Link>
            <button type="button" onClick={() => void startRadio({ channel: "today", start: food.slug })} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-caption font-semibold text-green-800 transition active:scale-95" aria-label={`${food.name_ko} 이야기부터 라디오로 듣기`}>
              🎧 라디오로 듣기
            </button>
          </div>
          <h1 className="font-display text-[2rem] font-semibold leading-tight">{food.name_ko}</h1>
          <p className="text-muted">
            {food.name_en}
            {food.name_local && food.name_local !== food.name_ko ? ` · ${food.name_local}` : ""}
          </p>
          {food.origin_note && <p className="text-caption text-muted">ⓘ {food.origin_note}</p>}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DIET_KEYS.filter((k) => food.diet[k] !== "no").map((k) => (
            <DietBadge key={k} k={k} level={food.diet[k]} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {(
            [
              ["tried", "📕", "먹어봤어요"],
              ["liked", "❤️", "좋아요"],
              ["saved", "🔖", "저장"],
            ] as [Exclude<PassportStatus, "explored">, string, string][]
          ).map(([s, icon, label]) => {
            const on = statuses.includes(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => toggle(ref, s)} className={`flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-2 text-[13px] font-medium transition active:scale-95 ${on ? "border-green-800 bg-green-800 text-ivory" : "border-line bg-surface text-charcoal/80"}`}>
                <span aria-hidden>{icon}</span>
                {label}
              </button>
            );
          })}
          <button type="button" onClick={() => open({ contextFoodId: food.id, contextName: food.name_ko, listen: true })} className="ml-auto grid size-10 shrink-0 place-items-center rounded-full bg-mint-500 text-green-800" aria-label="이 음식에 대해 푸디에게 묻기">
            <MicIcon className="size-5" />
          </button>
        </div>

        <nav className="sticky top-0 z-10 -mx-5 flex border-b border-line bg-ivory/95 px-5 backdrop-blur" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 border-b-2 py-3 text-sm font-semibold transition ${tab === t ? "border-green-800 text-green-800" : "border-transparent text-muted"}`}>
              {t}
            </button>
          ))}
        </nav>

        <div className="min-h-48 animate-rise space-y-5" key={tab} role="tabpanel">
          {tab === "기본" && (
            <>
              {food.summary && <p className="text-[17px] leading-relaxed">{food.summary}</p>}
              <Facts label="주요 재료 · 눌러서 같은 재료 음식 보기">
                <div className="flex flex-wrap gap-1.5">
                  {food.ingredients.map((i) => (
                    <Link key={i.slug} href={`/ingredient/${encodeURIComponent(i.slug)}`} className={`rounded-full px-3 py-1 text-sm transition active:scale-95 ${i.role === "main" ? "bg-surface font-medium shadow-sm" : "bg-line/50 text-charcoal/75"}`}>
                      {i.name_ko} <span className="text-muted">›</span>
                    </Link>
                  ))}
                </div>
              </Facts>
              {food.cooking_method && <Facts label="조리법">{METHOD_LABEL[food.cooking_method] ?? food.cooking_method}</Facts>}
              <Facts label="맛">
                <div className="flex flex-wrap gap-1.5">
                  {food.taste_tags.map((t) => (
                    <span key={t} className="rounded-full bg-mint-100 px-3 py-1 text-sm text-green-800">
                      {TASTE_LABEL[t] ?? t}
                    </span>
                  ))}
                </div>
              </Facts>
            </>
          )}

          {tab === "문화" && (
            <>
              {food.history && <Facts label="역사">{food.history}</Facts>}
              <Facts label="언제, 어떻게 먹나">{food.culture_story ?? <span className="text-muted">아직 검수된 문화 이야기가 없어요. 푸디에게 물어보면 아는 만큼 답해줄게요.</span>}</Facts>
              {(food.culture_story || food.summary) && (
                <button type="button" onClick={tell} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-mint-100 py-3.5 font-semibold text-green-800">
                  {telling ? "■ 그만 듣기" : "▶ 푸디가 이야기로 들려주기"}
                </button>
              )}
            </>
          )}

          {tab === "식이" && (
            <>
              <table className="w-full overflow-hidden rounded-2xl bg-surface text-sm shadow-sm">
                <tbody>
                  {DIET_KEYS.map((k) => (
                    <tr key={k} className="border-b border-line last:border-0">
                      <th className="px-4 py-3 text-left font-medium">{DIET_LABEL[k]}</th>
                      <td className="px-4 py-3 text-right">
                        <span className={food.diet[k] === "yes" ? "text-diet-ok" : food.diet[k] === "depends" ? "text-[#9a6d0c]" : food.diet[k] === "no" ? "text-diet-no" : "text-muted"}>{LEVEL_TEXT[food.diet[k]]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {food.allergens.length > 0 && <Facts label="알레르기 유발 가능">{food.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(" · ")}</Facts>}
              {food.diet_note && <p className="rounded-xl bg-diet-warn/10 px-3 py-2.5 text-sm">⚠️ {food.diet_note}</p>}
              <p className="text-caption text-muted">식이 정보는 대표 조리법 기준이에요. 식당·가정마다 다를 수 있으니 주문할 때 꼭 확인하세요.</p>
              <ReportForm foodId={food.id} />
            </>
          )}

          {tab === "연결" && (
            <>
              {byType.map(({ t, items }) => (
                <RelationRow key={t} label={RELATION_LABEL[t]} note={items[0].description} foods={items.map((r) => r.food)} />
              ))}
              {food.relations.some((r) => r.type === "historical_link" || r.type === "regional_variant") && (
                <Link href={`/journey/${food.slug}`} className="flex w-full items-center justify-center rounded-2xl border border-mint-500 bg-mint-100 py-3 text-sm font-semibold text-green-800 transition active:scale-[0.98]">
                  🗺 이 음식의 여정 보기 →
                </Link>
              )}
              <RelationRow label={`같은 나라 · ${food.country.name_ko}`} foods={food.sameCountry} />
              {!byType.length && !food.sameCountry.length && <p className="text-sm text-muted">아직 검수된 연결이 없어요.</p>}
              <button type="button" onClick={() => open({ contextFoodId: food.id, contextName: food.name_ko, question: "비슷한 음식 있어?" })} className="w-full rounded-2xl border border-mint-500/60 py-3 text-sm font-semibold text-green-800">
                푸디에게 비슷한 음식 물어보기
              </button>
            </>
          )}
        </div>

        <SourceFooter sources={food.sources} />
      </div>

    </main>
  );
}

function Facts({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

