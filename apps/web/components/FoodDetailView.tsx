"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RELATION_LABEL, TASTE_LABEL, type FoodDetail, type RelationType } from "@/lib/content/types";
import { record, toggle, useLocal, type FoodRef, type PassportStatus } from "@/lib/client/passport";
import { startRadio } from "@/lib/client/radio";
import { noteFeature, signal } from "@/lib/client/taste";
import { track } from "@/lib/client/track";
import { speak, stopSpeaking } from "@/lib/client/voice";
import { DIET_KEYS } from "@/lib/foodi/schema";
import { localSpeech } from "@/lib/voice/local";
import { ALLERGEN_LABEL, DietBadge } from "./DietBadge";
import { GuardBanner, GuardTable } from "./DietGuard";
import { accentBg } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner, RelationRow, SourceFooter } from "./bits";
import { ImageCredit } from "./ImageCredit";
import { Icon, type IconName } from "./icons";
import { ReportForm } from "./ReportForm";
import { BackLink, IconTile, SegTabs, btn, chip } from "./ui";
import { MicIcon } from "./VoiceButton";

const TABS = ["기본", "문화", "식이", "연결"] as const;
type Tab = (typeof TABS)[number];

const METHOD_LABEL: Record<string, string> = {
  fermented: "발효", grilled: "구이", steamed: "찜", stewed: "스튜·조림", raw: "날것", fried: "튀김", baked: "굽기(오븐)", boiled: "삶기·끓이기", stir_fried: "볶음", mixed: "섞기",
};
const LEVEL_TEXT = { yes: "가능", depends: "조리법에 따라 다름", no: "해당 안 됨", unknown: "확인 필요" } as const;
const LEVEL_CLS = { yes: "text-diet-ok", depends: "text-diet-warn-ink", no: "text-diet-no", unknown: "text-muted" } as const;

// Passport 상태 토글 — 켜짐은 초록 칩 + 체크 아이콘이라 색만으로 말하지 않는다
const STATUS_ACTIONS: [Exclude<PassportStatus, "explored">, IconName, string][] = [
  ["tried", "stamp", "먹어봤어요"],
  ["liked", "heart", "좋아요"],
  ["saved", "bookmark", "저장"],
];

type Stat = { icon: IconName; label: string; value: string };

export function FoodDetailView({ food, preview }: { food: FoodDetail; preview: boolean }) {
  const [tab, setTab] = useState<Tab>("기본");
  const [telling, setTelling] = useState(false);
  const { open } = useFoodi();
  const ref: FoodRef = { id: food.id, slug: food.slug, name_ko: food.name_ko, flag: food.flag, country_code: food.country_code, taste_tags: food.taste_tags };
  const statuses = useLocal((s) => s.entries[food.id]?.statuses ?? []);
  const guardFood = useMemo(() => ({ ...food, ingredients: food.ingredients.map((i) => i.name_ko) }), [food]);

  // 상세를 연 것 자체가 탐험 (F-REC-02)
  useEffect(() => {
    record({ id: food.id, slug: food.slug, name_ko: food.name_ko, flag: food.flag, country_code: food.country_code, taste_tags: food.taste_tags }, "explored");
    track("detail_view", { food_id: food.id }); // KPI Hops: 세션 안 연속 상세 진입
    // 취향 엔진: 상세 열기 + 머문 시간 (떠날 때 한 번)
    const sf = { slug: food.slug, country_code: food.country_code, taste_tags: food.taste_tags };
    signal("view", sf);
    const t0 = Date.now();
    return () => {
      stopSpeaking();
      signal("dwell", sf, { ms: Date.now() - t0 });
    };
  }, [food.id, food.slug, food.name_ko, food.flag, food.country_code, food.taste_tags]);
  const sf = { slug: food.slug, country_code: food.country_code, taste_tags: food.taste_tags };
  const askFoodi = (o: Parameters<typeof open>[0]) => (signal("ask", sf), open(o));

  const tell = () => {
    if (telling) return (stopSpeaking(), setTelling(false));
    const text = food.culture_story ?? food.summary;
    if (!text) return;
    signal("listen", sf);
    noteFeature("listen");
    setTelling(true);
    void speak(text, () => setTelling(false));
  };

  // 현지 발음 (design/11 문서 §3): 현지 이름을 그 나라 말 목소리로. 짧아서 누를 때마다 처음부터
  const local = localSpeech(food);
  const sayLocal = () => {
    setTelling(false);
    void speak(local.text, () => {}, null, { lang: local.lang });
  };

  const byType = (Object.keys(RELATION_LABEL) as RelationType[]).map((t) => ({ t, items: food.relations.filter((r) => r.type === t) })).filter((g) => g.items.length);

  // '기본' 탭 요약 타일 (레퍼런스 식물 앱의 care overview) — 데이터가 있는 것만
  const mains = food.ingredients.filter((i) => i.role === "main").map((i) => i.name_ko);
  const stats: Stat[] = [];
  if (food.cooking_method) stats.push({ icon: "pot", label: "조리법", value: METHOD_LABEL[food.cooking_method] ?? food.cooking_method });
  if (food.taste_tags.length) stats.push({ icon: "flame", label: food.summary ? "맛" : "분류 (추정)", value: food.taste_tags.map((t) => TASTE_LABEL[t] ?? t).join(" · ") });
  if (mains.length) stats.push({ icon: "carrot", label: "주재료", value: mains.join(" · ") });
  stats.push({ icon: "pin", label: "어디서", value: `${food.country.name_ko}${food.region_in_country ? ` · ${food.region_in_country}` : ""}` });

  return (
    // 데스크톱: 왼쪽 사진 카드(고정) | 오른쪽 정보 — 모바일은 사진 위 + 시트처럼 겹친 본문
    <main className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-8 lg:pt-8">
      <header className="relative flex h-80 flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:sticky lg:top-8 lg:h-[min(36rem,calc(100dvh-4rem))] lg:overflow-hidden lg:rounded-[32px] lg:pt-5 lg:shadow-lift" style={accentBg(food.accent, food.image_url)}>
        <BackLink href="/" label="홈" onPhoto={!!food.image_url} />
        {/* 사진이 없을 때만 큰 국기가 히어로 — 사진이 있으면 사진이 주인공 */}
        {!food.image_url && (
          <span className="mb-8 text-7xl leading-none drop-shadow-sm" aria-hidden>
            {food.flag}
          </span>
        )}
        <ImageCredit credit={food.image_credit} className="absolute bottom-10 right-4 lg:bottom-4" />
      </header>

      <div className="relative -mt-7 space-y-6 rounded-t-[28px] bg-canvas px-5 pb-8 pt-6 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0">
        {preview && <PreviewBanner />}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/country/${food.country_code}`} className="inline-flex min-h-10 min-w-0 items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink">
              <span aria-hidden>{food.flag}</span>
              <span className="truncate">
                {food.country.name_ko}
                {food.region_in_country ? ` · ${food.region_in_country}` : ""}
              </span>
              <Icon name="next" className="size-4 shrink-0 text-muted" />
            </Link>
            {food.summary && (
              <button type="button" onClick={() => void startRadio({ channel: "today", start: food.slug })} className={`${btn("outline", "sm")} shrink-0`} aria-label={`${food.name_ko} 이야기부터 라디오로 듣기`}>
                <Icon name="headphones" className="size-4 text-leaf" />
                라디오로 듣기
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-h1 font-bold text-ink">{food.name_ko}</h1>
            <button type="button" onClick={sayLocal} className={`${btn("soft", "sm")} shrink-0`} aria-label={`${local.text} ${local.native ? "현지" : "영어"} 발음 듣기`}>
              <Icon name="volume-on" className="size-4" />
              {local.native ? "현지 발음" : "영어 발음"}
            </button>
          </div>
          <p className="text-[15px] text-muted">
            {food.name_en}
            {food.name_local && food.name_local !== food.name_ko ? ` · ${food.name_local}` : ""}
          </p>
          {food.origin_note && (
            <p className="flex items-start gap-1.5 text-caption text-muted">
              <Icon name="info" className="mt-px size-4 shrink-0" />
              {food.origin_note}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DIET_KEYS.filter((k) => food.diet[k] !== "no").map((k) => (
            <DietBadge key={k} k={k} level={food.diet[k]} />
          ))}
        </div>
        <GuardBanner food={guardFood} />

        {/* 기록 토글 한 줄 + 묻기는 넓게 한 줄 — 좁은 화면에서 버튼 하나만 외따로 접히지 않게 */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_ACTIONS.map(([s, icon, label]) => {
              const on = statuses.includes(s);
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => toggle(ref, s)} className={`${chip(on)} whitespace-nowrap px-3.5`}>
                  {/* 하트·책갈피는 켜지면 채워진다 (도장은 채우면 뭉개져서 선 그대로) */}
                  <Icon name={icon} className="size-4" fill={on && icon !== "stamp" ? "currentColor" : "none"} />
                  {label}
                  {on && <Icon name="check" className="size-3.5" strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => askFoodi({ contextFoodId: food.id, contextName: food.name_ko, listen: true })} className={`${btn("primary", "md")} w-full`} aria-label="이 음식에 대해 푸디에게 묻기">
            <MicIcon className="size-5" />
            푸디에게 묻기
          </button>
        </div>

        {/* 길게 스크롤해도 탭을 바로 바꿀 수 있게 위에 붙는다 (유리 트랙이라 아래 내용이 비친다) */}
        <div className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-10">
          <SegTabs tabs={TABS} value={tab} onChange={(t) => (setTab(t), t !== "기본" && (signal("tab", sf, { src: t }), noteFeature(`tab:${t}`)))} label="음식 정보" />
        </div>

        <div className="min-h-48 animate-rise space-y-4" key={tab} role="tabpanel" aria-label={tab}>
          {tab === "기본" && (
            <>
              {food.summary ? (
                <p className="text-[17px] leading-relaxed text-ink">{food.summary}</p>
              ) : (
                // 자동 후보 음식: 소개 글 전이라 확인된 것(이름·나라·사진)만
                <div className="card flex items-start gap-3 rounded-3xl p-4">
                  <IconTile icon="book" size="sm" />
                  <p className="min-w-0 text-[15px] leading-relaxed text-ink">
                    {food.country.name_ko}의 <b>{food.name_ko}</b>
                    {food.name_en !== food.name_ko && <span className="text-muted"> ({food.name_en})</span>}
                    <span className="mt-1 block text-sm text-muted">소개 글은 출처를 확인하며 준비하고 있어요. 지금은 이름·나라·사진만 확인된 음식이에요.</span>
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {stats.map((s) => (
                  <div key={s.label} className="card flex items-start gap-3 rounded-3xl p-3.5 odd:last:col-span-2">
                    <IconTile icon={s.icon} size="sm" />
                    <div className="min-w-0">
                      <p className="text-caption text-muted">{s.label}</p>
                      <p className="text-[15px] font-semibold leading-snug text-ink">{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              {food.ingredients.length > 0 && (
                <Facts label="주요 재료 · 눌러서 같은 재료 음식 보기">
                  <div className="flex flex-wrap gap-2">
                    {food.ingredients.map((i) => (
                      <Link
                        key={i.slug}
                        href={`/ingredient/${encodeURIComponent(i.slug)}`}
                        className={`inline-flex h-10 items-center gap-0.5 rounded-full pl-3.5 pr-2.5 text-sm transition active:scale-95 ${i.role === "main" ? "border border-line bg-surface font-semibold text-ink shadow-soft" : "bg-sunken text-ink-soft"}`}
                      >
                        {i.name_ko}
                        <Icon name="next" className="size-4 text-muted" />
                      </Link>
                    ))}
                  </div>
                </Facts>
              )}
            </>
          )}

          {tab === "문화" && (
            <>
              {food.history && (
                <Facts label="역사" card>
                  {food.history}
                </Facts>
              )}
              <Facts label="언제, 어떻게 먹나" card>
                {food.culture_story ?? <span className="text-muted">아직 검수된 문화 이야기가 없어요. 푸디에게 물어보면 아는 만큼 답해줄게요.</span>}
              </Facts>
              {(food.culture_story || food.summary) && (
                <button type="button" onClick={tell} aria-pressed={telling} className={`${btn("primary", "md")} w-full`}>
                  <Icon name={telling ? "pause" : "play"} className="size-5" fill="currentColor" />
                  {telling ? "그만 듣기" : "푸디가 이야기로 들려주기"}
                </button>
              )}
            </>
          )}

          {tab === "식이" && (
            <>
              <GuardTable food={guardFood} />
              <table className="card w-full overflow-hidden rounded-3xl text-sm">
                <caption className="sr-only">식이 조건별 가능 여부</caption>
                <tbody>
                  {DIET_KEYS.map((k) => (
                    <tr key={k} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-3 text-left font-medium">
                        <DietBadge k={k} level={food.diet[k]} />
                      </th>
                      <td className={`px-4 py-3 text-right font-semibold ${LEVEL_CLS[food.diet[k]]}`}>{LEVEL_TEXT[food.diet[k]]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {food.allergens.length > 0 && (
                <Facts label="알레르기 유발 가능">
                  <ul className="flex flex-wrap gap-1.5">
                    {food.allergens.map((a) => (
                      <li key={a} className="inline-flex h-8 items-center gap-1 rounded-full border border-diet-warn/30 bg-diet-warn/10 px-3 text-sm font-medium text-diet-warn-ink">
                        <Icon name="warn" className="size-3.5" />
                        {ALLERGEN_LABEL[a] ?? a}
                      </li>
                    ))}
                  </ul>
                </Facts>
              )}
              {food.diet_note && (
                <p className="flex items-start gap-2 rounded-2xl border border-diet-warn/25 bg-diet-warn/10 px-3.5 py-3 text-sm text-ink">
                  <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-diet-warn-ink" />
                  <span>
                    <span className="sr-only">주의: </span>
                    {food.diet_note}
                  </span>
                </p>
              )}
              <p className="text-caption text-muted">식이 정보는 대표 조리법 기준이에요. 식당·가정마다 다를 수 있으니 주문할 때 꼭 확인하세요.</p>
              <ReportForm foodId={food.id} />
            </>
          )}

          {tab === "연결" && (
            <div className="space-y-5">
              {byType.map(({ t, items }) => (
                <RelationRow key={t} label={RELATION_LABEL[t]} note={items[0].description} foods={items.map((r) => r.food)} />
              ))}
              {food.relations.some((r) => r.type === "historical_link" || r.type === "regional_variant") && (
                <Link href={`/journey/${food.slug}`} className={`${btn("outline", "md")} w-full`}>
                  <Icon name="route" className="size-5 text-leaf" />
                  이 음식의 여정 보기
                  <Icon name="arrow-right" className="size-4 text-muted" />
                </Link>
              )}
              <Link href={`/taste/${food.slug}`} className={`${btn("outline", "md")} w-full`}>
                <Icon name="pin" className="size-5 text-leaf" />
                한국에서 맛보기
                <Icon name="arrow-right" className="size-4 text-muted" />
              </Link>
              <RelationRow label={`같은 나라 · ${food.country.name_ko}`} foods={food.sameCountry} />
              {!byType.length && !food.sameCountry.length && <p className="text-sm text-muted">아직 검수된 연결이 없어요.</p>}
              <button type="button" onClick={() => askFoodi({ contextFoodId: food.id, contextName: food.name_ko, question: "비슷한 음식 있어?" })} className={`${btn("soft", "md")} w-full`}>
                <Icon name="sparkle" className="size-5" />
                푸디에게 비슷한 음식 물어보기
              </button>
            </div>
          )}
        </div>

        <SourceFooter sources={food.sources} />
      </div>
    </main>
  );
}

function Facts({ label, children, card = false }: { label: string; children: ReactNode; card?: boolean }) {
  return (
    <div className={`space-y-1.5 ${card ? "card rounded-3xl p-4" : ""}`}>
      <p className="text-caption font-semibold text-leaf">{label}</p>
      <div className="leading-relaxed text-ink">{children}</div>
    </div>
  );
}
