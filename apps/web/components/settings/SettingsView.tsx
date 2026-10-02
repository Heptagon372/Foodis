"use client";
// 설정 화면 (/settings): 화면 · 식단 · 푸디 음성 · 계정 네 묶음. 예전엔 Passport 맨 아래에 흩어져 있던 것을 한곳에 모았다.
// 모바일 = 위에 묶음 칩(바로 가기) + 세로 카드 / 데스크톱 = 왼쪽 묶음 목록(고정) + 오른쪽 카드
import { useRouter } from "next/navigation";
import { useAccount } from "@/lib/client/account";
import { clearInterest, useTopInterests } from "@/lib/client/community";
import { CATEGORY } from "@/lib/community/categories";
import { update, useLocal } from "@/lib/client/passport";
import { setTheme } from "@/lib/client/theme";
import { ALLERGENS, DIET_KEYS } from "@/lib/foodi/schema";
import { AccountCard } from "../AccountCard";
import { ALLERGEN_LABEL, DIET_LABEL } from "../DietBadge";
import { Icon, type IconName } from "../icons";
import { useTheme } from "../ThemeToggle";
import { TopBar } from "../TopBar";
import { btn, chip, Eyebrow } from "../ui";
import { optionRow, RadioDot, SettingCard } from "./parts";
import { VoiceSettings } from "./VoiceSettings";

const GROUPS: { id: string; label: string; icon: IconName }[] = [
  { id: "display", label: "화면", icon: "sun" },
  { id: "diet", label: "식단 · 알레르기", icon: "salad" },
  { id: "voice", label: "푸디 · 음성", icon: "mic" },
  { id: "account", label: "계정", icon: "user" },
];

export function SettingsView() {
  const acct = useAccount().status;
  // 로그인 기능이 꺼진 배포(off)에선 계정 묶음을 통째로 숨긴다
  const groups = GROUPS.filter((g) => g.id !== "account" || acct !== "off");
  return (
    <main className="space-y-6 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar back={{ href: "/", label: "홈" }} settings={false} />
      <div className="space-y-1">
        <Eyebrow>Settings</Eyebrow>
        <h1 className="text-h1 font-bold text-ink">설정</h1>
      </div>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* 묶음 바로 가기 — 모바일은 가로 칩, 데스크톱은 고정된 세로 목록 */}
        <nav aria-label="설정 묶음" className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] lg:sticky lg:top-8 lg:mx-0 lg:mb-0 lg:flex-col lg:px-0">
          {groups.map((g) => (
            <a key={g.id} href={`#${g.id}`} className={`${chip(false)} shrink-0 lg:h-11 lg:rounded-2xl lg:border-transparent lg:bg-transparent lg:hover:bg-ink/5`}>
              <Icon name={g.icon} className="size-4 text-leaf" />
              {g.label}
            </a>
          ))}
        </nav>

        <div className="space-y-10">
          <Group id="display" title="화면">
            <DisplaySettings />
          </Group>
          <Group id="diet" title="식단 · 알레르기">
            <DietSettings signedIn={acct === "user"} />
          </Group>
          <Group id="voice" title="푸디 · 음성">
            <VoiceSettings />
          </Group>
          {acct !== "off" && (
            <Group id="account" title="계정">
              <AccountCard />
            </Group>
          )}
        </div>
      </div>
    </main>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3" aria-label={title}>
      <h2 className="text-title font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function DisplaySettings() {
  const theme = useTheme();
  const router = useRouter();
  const opts: { v: "light" | "dark"; label: string; desc: string; icon: IconName }[] = [
    { v: "light", label: "낮 (라이트)", desc: "밝은 초록 바탕", icon: "sun" },
    { v: "dark", label: "밤 (다크)", desc: "진한 숲 바탕 — 밤에 눈이 편해요", icon: "moon" },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SettingCard icon="sun" title="테마" desc="이 기기에 기억돼요. 데스크톱에서는 사이드바의 새싹 버튼으로도 바꿀 수 있어요.">
        <div role="radiogroup" aria-label="테마" className="space-y-2">
          {opts.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={theme === o.v} onClick={() => theme !== o.v && setTheme(o.v)} className={optionRow(theme === o.v)}>
              <RadioDot on={theme === o.v} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Icon name={o.icon} className="size-4 text-leaf" />
                  {o.label}
                </span>
                <span className="block text-caption text-muted">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </SettingCard>
      <SettingCard icon="replay" title="처음 화면" desc="인트로와 취향 고르기를 다시 볼 수 있어요. 탐험 기록은 그대로예요.">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => (update((s) => ({ ...s, introSeen: false })), router.push("/"))} className={btn("outline", "sm")}>
            인트로 다시 보기
          </button>
          <button type="button" onClick={() => router.push("/onboarding")} className={btn("outline", "sm")}>
            취향 다시 고르기
          </button>
        </div>
      </SettingCard>
      <CommunityInterest />
    </div>
  );
}

/** 커뮤니티 AI 맞춤 피드가 쓰는 관심 기록 (이 기기에만 저장) — 보고 지울 수 있게 */
function CommunityInterest() {
  const top = useTopInterests(5);
  return (
    <SettingCard icon="users" title="커뮤니티 맞춤 기록" desc="자주 본 모임을 이 기기에만 기억해 AI 맞춤 피드 순서에 써요. 서버에는 개인별로 남기지 않아요.">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">{top.length ? top.map(([k]) => CATEGORY[k].label).join(" · ") : "아직 기록이 없어요"}</span>
        {top.length > 0 && (
          <button type="button" onClick={clearInterest} className={btn("outline", "sm")}>
            기록 지우기
          </button>
        )}
      </div>
    </SettingCard>
  );
}

function DietSettings({ signedIn }: { signedIn: boolean }) {
  const diet = useLocal((s) => s.diet);
  const allergens = useLocal((s) => s.allergens ?? []);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SettingCard icon="leaf" title="식이 조건" desc="고른 조건에 맞는 음식만 추천해요.">
        <div className="flex flex-wrap gap-2">
          {DIET_KEYS.map((k) => {
            const on = diet.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => update((s) => ({ ...s, diet: on ? s.diet.filter((x) => x !== k) : [...s.diet, k] }))} className={chip(on)}>
                {on && <Icon name="check" className="size-4" strokeWidth={2.25} />}
                {DIET_LABEL[k]}
              </button>
            );
          })}
        </div>
      </SettingCard>
      <SettingCard icon="warn" title="알레르기" desc="빨간 재료가 든 음식은 추천하지 않아요.">
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((a) => {
            const on = allergens.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => update((s) => ({ ...s, allergens: on ? (s.allergens ?? []).filter((x) => x !== a) : [...(s.allergens ?? []), a] }))}
                // 고른 알레르기 재료는 '빼는 것'이라 초록이 아니라 빨강 의미색 + X 아이콘
                className={on ? "inline-flex h-10 select-none items-center gap-1.5 rounded-full border border-diet-no bg-diet-no/10 px-4 text-sm font-semibold text-diet-no transition active:scale-[0.97]" : chip(false)}
              >
                {on && <Icon name="close" className="size-4" strokeWidth={2.25} />}
                {ALLERGEN_LABEL[a]}
              </button>
            );
          })}
        </div>
      </SettingCard>
      <p className="text-caption text-muted xl:col-span-2">추천 필터에만 쓰이고 {signedIn ? "내 계정에만" : "이 기기에만"} 저장돼요.</p>
    </div>
  );
}
