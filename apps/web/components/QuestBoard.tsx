"use client";
// Food Quest (기능 #9): /quests 의 주간 퀘스트 보드 + 배지 선반, 홈·Passport 의 한 줄 카드
import Link from "next/link";
import { useQuest } from "@/lib/client/quest";
import type { BadgeProgress, QuestProgress } from "@/lib/quest/quests";
import { Icon } from "./icons";
import { btn, IconTile, ProgressBar } from "./ui";

const day = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
const date = (ts: number) => day.format(ts);

export function QuestBoard() {
  const q = useQuest();
  return (
    // 데스크톱은 퀘스트 | 배지 두 칸
    <div id="quest" className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
      {!q.ready ? (
        <div className="h-56 rounded-3xl bg-sunken/70" aria-hidden />
      ) : (
        <>
          <div className="space-y-3">
            <ul className="space-y-2.5">
              {q.quests.map((x) => (
                <QuestRow key={x.id} q={x} />
              ))}
            </ul>
            <p className="text-caption text-muted">
              매주 월요일(한국 시간)에 새 퀘스트가 열려요. 3개를 모두 끝내면 연속 기록이 이어져요
              {q.streak > 0 && (
                <b className="font-semibold text-leaf">
                  {" · "}
                  <Icon name="flame" className="-mt-0.5 inline size-4" /> {q.streak}주 연속
                </b>
              )}
            </p>
          </div>
          <BadgeShelf badges={q.badges} />
        </>
      )}
    </div>
  );
}

function QuestRow({ q }: { q: QuestProgress }) {
  return (
    <li className={`rounded-3xl p-4 ${q.done ? "border border-brand/25 bg-lime-soft" : "card"}`}>
      <div className="flex items-center gap-3">
        {/* 완료는 색만이 아니라 체크 아이콘 + '완료' 글자로도 알린다 */}
        <IconTile icon={q.done ? "check" : q.icon} tone={q.done ? "brand" : "soft"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{q.title}</p>
          <p className={`text-caption ${q.done ? "font-medium text-leaf" : "text-muted"}`}>{q.done ? `${q.doneAt ? date(q.doneAt) : "이번 주"} 완료` : `다음: ${q.next}`}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-caption font-medium ${q.done ? "border-brand/30 bg-surface text-leaf" : "border-line text-ink-soft"}`}>
          <Icon name={q.done ? "check" : "stamp"} className="size-3.5" />
          {q.reward}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ProgressBar value={q.value} max={q.target} label={`${q.title} 진행`} className="h-1.5" />
        <span className="w-8 text-right text-caption tabular-nums text-muted">
          {q.value}/{q.target}
        </span>
      </div>
    </li>
  );
}

function BadgeShelf({ badges }: { badges: BadgeProgress[] }) {
  const earned = badges.filter((b) => b.earnedAt != null).length;
  return (
    <div className="space-y-2.5">
      <p className="flex items-baseline justify-between text-sm font-semibold text-ink">
        배지
        <span className="text-caption font-medium tabular-nums text-muted">
          {earned}/{badges.length}
        </span>
      </p>
      <ul className="grid grid-cols-3 gap-2">
        {badges.map((b) => {
          const on = b.earnedAt != null;
          return (
            // 받은 배지 = 초록 메달 타일, 아직 = 점선 테두리 + 흐린 아이콘 (글자로도 '획득'/'조건' 구분)
            <li key={b.id} className={`flex flex-col items-center gap-1.5 rounded-3xl p-3 text-center ${on ? "card" : "border border-dashed border-line bg-sunken/50"}`}>
              <IconTile icon={b.icon} tone={on ? "brand" : "outline"} className={on ? "shadow-brand" : "opacity-60"} />
              <span className={`text-caption font-semibold ${on ? "text-ink" : "text-ink-soft"}`}>{b.name}</span>
              <span className={`text-[11px] leading-snug ${on ? "font-medium text-leaf" : "text-muted"}`}>{on ? `${date(b.earnedAt!)} 획득` : `${b.hint} (${b.value}/${b.target})`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 홈: "이번 주 퀘스트 1/3 · 다음: 발효 음식 1개 더" — 시끄럽지 않게 한 줄 + 작은 진행 링 */
export function QuestHomeCard() {
  const q = useQuest();
  if (!q.ready || !q.quests.length) return null;
  const next = q.quests.find((x) => !x.done);
  return (
    <Link href="/quests" className="glass flex min-h-16 items-center gap-3 rounded-3xl py-3 pl-3 pr-2 text-sm transition active:scale-[0.98]">
      <IconTile icon="quest" />
      <span className="min-w-0 flex-1">
        <b className="block font-semibold text-ink">
          이번 주 퀘스트 {q.doneCount}/{q.quests.length}
        </b>
        <span className="block truncate text-caption text-ink-soft">{next ? `다음: ${next.next}` : "모두 완료했어요"}</span>
      </span>
      <ProgressRing value={q.doneCount} max={q.quests.length} />
      <Icon name="next" className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

/** 홈 오른쪽 '이번 주 챌린지' 패널 (레퍼런스 Daily Challenge) — 아직 안 끝난 퀘스트 하나 + 진행률 + 보상 + CTA */
export function QuestChallengeCard({ className = "" }: { className?: string }) {
  const q = useQuest();
  if (!q.ready || !q.quests.length) return <div className={`panel min-h-72 rounded-[28px] ${className}`} aria-hidden />;
  const cur = q.quests.find((x) => !x.done) ?? q.quests[q.quests.length - 1];
  const pct = Math.round((cur.value / Math.max(1, cur.target)) * 100);
  return (
    <section className={`panel flex flex-col gap-4 rounded-[28px] p-5 ${className}`} aria-labelledby="challenge-title">
      <div className="flex items-center justify-between">
        <h2 id="challenge-title" className="text-title font-bold text-ink">
          이번 주 챌린지
        </h2>
        <Icon name="calendar" className="size-5 text-ink-soft" />
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-sunken/60 p-3">
        <IconTile icon={cur.done ? "check" : cur.icon} tone="soft" size="lg" />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{cur.title}</p>
          <p className="line-clamp-2 text-caption text-ink-soft">{cur.done ? "이번 주 퀘스트를 모두 끝냈어요" : `다음: ${cur.next}`}</p>
        </div>
      </div>
      <div className="space-y-2">
        <p className="flex items-baseline justify-between text-caption text-ink-soft">
          진행
          <span className="font-semibold tabular-nums text-ink">
            {cur.value}/{cur.target} · {pct}%
          </span>
        </p>
        <ProgressBar value={cur.value} max={cur.target} label={`${cur.title} 진행`} className="h-2" />
      </div>
      <div className="space-y-2">
        <p className="text-caption text-ink-soft">보상</p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-ink">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="stamp" className="size-4 text-leaf" />
            {cur.reward}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="quest" className="size-4 text-leaf" />
            이번 주 {q.doneCount}/{q.quests.length}
          </span>
          {q.streak > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="flame" className="size-4 text-leaf" />
              {q.streak}주 연속
            </span>
          )}
        </p>
      </div>
      <Link href="/quests" className={`${btn("lime", "md")} mt-auto w-full`}>
        {cur.done ? "배지 보러 가기" : "챌린지 시작"}
      </Link>
    </section>
  );
}

/** 진행 링 (레퍼런스 GreenBite 의 75% 링). 숫자는 옆 글자에 있으니 그림만 */
function ProgressRing({ value, max }: { value: number; max: number }) {
  const r = 14;
  const len = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <svg viewBox="0 0 36 36" className="size-9 shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-sunken)" strokeWidth="4" />
      {/* 0 일 때 둥근 끝이 점으로 남지 않게 그리지 않는다 */}
      {pct > 0 && <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-brand)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${len * pct} ${len}`} className="transition-[stroke-dasharray] duration-300" />}
    </svg>
  );
}
