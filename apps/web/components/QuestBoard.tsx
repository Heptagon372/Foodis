"use client";
// Food Quest (기능 #9): Passport 의 주간 퀘스트 보드 + 배지 선반, 홈의 한 줄 카드
import Link from "next/link";
import { useQuest } from "@/lib/client/quest";
import type { BadgeProgress, QuestProgress } from "@/lib/quest/quests";

const day = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
const date = (ts: number) => day.format(ts);

export function QuestBoard() {
  const q = useQuest();
  return (
    // 홈 카드의 /passport#quest 가 하이드레이션 전에도 닿도록 id 는 항상 그린다
    <div id="quest" className="scroll-mt-14 space-y-5">
      {!q.ready ? (
        <div className="h-56 rounded-3xl bg-surface/60" aria-hidden />
      ) : (
        <>
          <ul className="space-y-2.5">
            {q.quests.map((x) => (
              <QuestRow key={x.id} q={x} />
            ))}
          </ul>
          <p className="text-caption text-muted">
            매주 월요일(한국 시간)에 새 퀘스트가 열려요. 3개를 모두 끝내면 연속 기록이 이어져요
            {q.streak > 0 && <b className="font-semibold text-green-800"> · 🔥 {q.streak}주 연속</b>}
          </p>
          <BadgeShelf badges={q.badges} />
        </>
      )}
    </div>
  );
}

function QuestRow({ q }: { q: QuestProgress }) {
  return (
    <li className={`rounded-2xl p-3.5 ${q.done ? "bg-mint-100" : "bg-surface shadow-sm"}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-xl ${q.done ? "bg-mint-500 font-bold text-green-800" : "bg-ivory"}`} aria-hidden>
          {q.done ? "✓" : q.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${q.done ? "text-green-800" : ""}`}>{q.title}</p>
          <p className="text-caption text-muted">{q.done ? `${q.doneAt ? date(q.doneAt) : "이번 주"} 완료` : `다음: ${q.next}`}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-caption font-medium ${q.done ? "border-mint-500 bg-surface text-green-800" : "border-line text-muted"}`}>{q.reward}</span>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`${q.title} 진행`} aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={q.value}>
          <span className="block h-full rounded-full bg-mint-500 transition-[width] duration-300" style={{ width: `${(q.value / q.target) * 100}%` }} />
        </span>
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
    <div className="space-y-2">
      <p className="flex items-baseline justify-between text-sm font-semibold text-charcoal/80">
        배지
        <span className="text-caption font-medium tabular-nums text-muted">
          {earned}/{badges.length}
        </span>
      </p>
      <ul className="grid grid-cols-3 gap-2">
        {badges.map((b) => {
          const on = b.earnedAt != null;
          return (
            <li key={b.id} className={`flex flex-col items-center gap-1 rounded-2xl p-2.5 text-center ${on ? "bg-surface shadow-sm" : "bg-line/40"}`}>
              <span className={`text-[1.75rem] leading-none ${on ? "" : "opacity-40 grayscale"}`} aria-hidden>
                {b.emoji}
              </span>
              <span className={`text-caption font-semibold ${on ? "text-green-800" : "text-charcoal/60"}`}>{b.name}</span>
              <span className="text-[11px] leading-snug text-muted">{on ? `${date(b.earnedAt!)} 획득` : `${b.hint} (${b.value}/${b.target})`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 홈: "이번 주 퀘스트 1/3 · 다음: 발효 음식 1개 더" — 시끄럽지 않게 한 줄 */
export function QuestHomeCard() {
  const q = useQuest();
  if (!q.ready || !q.quests.length) return null;
  const next = q.quests.find((x) => !x.done);
  return (
    <Link href="/passport#quest" className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-sm transition active:scale-[0.98]">
      <span aria-hidden>🎮</span>
      <span className="min-w-0 flex-1 truncate">
        <b className="font-semibold text-green-800">
          이번 주 퀘스트 {q.doneCount}/{q.quests.length}
        </b>
        <span className="text-muted"> · {next ? `다음: ${next.next}` : "모두 완료했어요 🎉"}</span>
      </span>
      <span className="text-muted" aria-hidden>
        ›
      </span>
    </Link>
  );
}
