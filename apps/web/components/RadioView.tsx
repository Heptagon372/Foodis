"use client";
// S6 Food Culture Radio (F-VOI-05): 채널 → 지금 재생(사진·자막·조작) → 다음 이야기(연결 이유)
import Link from "next/link";
import { RELATION_LABEL } from "@/lib/content/types";
import { closeRadio, playEpisode, skip, startRadio, toggle, useRadio } from "@/lib/client/radio";
import { sentences, type Episode } from "@/lib/radio/script";
import { ImageCredit } from "./ImageCredit";
import { PreviewBanner, Wordmark } from "./bits";

export type ChannelInfo = { id: string; title: string; emoji: string; ready: boolean };
type Props = { channels: ChannelInfo[]; preview: boolean; startFood: { slug: string; name_ko: string; flag: string } | null };

export function RadioView({ channels, preview, startFood }: Props) {
  const r = useRadio();
  const has = r.episodes.length > 0;
  const activeChannel = r.channel?.split(":")[0];

  return (
    <main className="space-y-7 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Wordmark />
        <span className="text-sm font-semibold text-green-800">🎧 Radio</span>
      </header>
      {preview && <PreviewBanner />}

      <section className="space-y-1">
        <h1 className="font-display text-h1 font-semibold leading-tight">Food Culture Radio</h1>
        <p className="text-sm text-muted">1분 남짓한 음식 이야기 — 연결을 따라 다음 나라로 이어져요.</p>
      </section>

      {startFood && !has && r.status !== "loading" && (
        <button type="button" onClick={() => void startRadio({ channel: "today", start: startFood.slug })} className="flex w-full items-center gap-3 rounded-3xl bg-green-800 p-4 text-left text-ivory transition active:scale-[0.99]">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-mint-500 text-xl text-green-800">▶</span>
          <span>
            <span className="block text-caption text-ivory/70">여기서부터 듣기</span>
            <span className="text-lg font-semibold">
              {startFood.flag} {startFood.name_ko} 이야기
            </span>
          </span>
        </button>
      )}

      <div className="snap-row -mx-5 px-5 pb-1" role="group" aria-label="채널">
        {channels.map((c) => {
          const on = activeChannel === c.id && !r.channel?.includes(":");
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => void startRadio({ channel: c.id })}
              disabled={!c.ready}
              aria-pressed={on}
              className={`flex w-36 shrink-0 snap-start flex-col items-start gap-6 rounded-3xl p-4 text-left transition active:scale-[0.98] disabled:opacity-50 ${on ? "bg-green-800 text-ivory" : "bg-surface text-charcoal shadow-sm"}`}
            >
              <span className="text-3xl" aria-hidden>
                {c.emoji}
              </span>
              <span className="text-sm font-semibold leading-snug">
                {c.title}
                {!c.ready && <span className="mt-0.5 block text-caption font-normal text-muted">준비 중</span>}
              </span>
            </button>
          );
        })}
      </div>

      {r.status === "loading" && <NowSkeleton />}
      {r.status === "error" && (
        <div className="space-y-3 rounded-3xl bg-surface p-5 text-center">
          <p className="text-sm">{r.error}</p>
          <button type="button" onClick={() => void startRadio({ channel: activeChannel ?? "today" })} className="rounded-full bg-green-800 px-5 py-2 text-sm font-semibold text-ivory">
            다시 시도
          </button>
        </div>
      )}
      {has && r.status !== "loading" && <NowPlaying />}
      {has && r.status !== "loading" && <UpNext episodes={r.episodes} current={r.ep} playing={r.status === "playing"} />}
      {!has && r.status === "idle" && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
          채널을 고르면 바로 시작해요. 푸디는 <b className="text-charcoal/80">검수된 DB 문장만</b> 읽어요 — 지어내지 않아요.
        </p>
      )}
      {has && (
        <button type="button" onClick={closeRadio} className="mx-auto block text-caption text-muted underline-offset-4 hover:underline">
          라디오 끄기
        </button>
      )}
    </main>
  );
}

function NowPlaying() {
  const r = useRadio();
  const e = r.episodes[r.ep];
  const seg = e.segments[r.seg];
  const lines = sentences(seg?.text ?? "");
  const line = lines[r.sent] ?? "";
  const after = lines[r.sent + 1] ?? e.segments[r.seg + 1]?.text.split(/(?<=[.!?])\s/)[0] ?? "";
  const playing = r.status === "playing";
  const ended = r.status === "ended";

  return (
    <section className="space-y-4" aria-label="지금 재생">
      <div className="relative overflow-hidden rounded-[28px] text-ivory shadow-[0_18px_40px_-20px_#00000080]" style={{ background: e.food.accent }}>
        {e.food.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- 위키미디어 원본, 크레딧 표기
          <img src={e.food.image_url} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-black/80" />
        <div className="relative flex min-h-64 flex-col justify-end gap-1 p-5">
          <p className="flex items-center gap-2 text-caption text-ivory/80">
            <span className="rounded-full bg-black/30 px-2 py-0.5 backdrop-blur">
              {r.ep + 1} / {r.episodes.length}
            </span>
            {e.food.flag} {e.food.country_name}
          </p>
          <h2 className="font-display text-[2rem] font-semibold leading-tight">{e.food.name_ko}</h2>
          <div className="mt-2 flex gap-1" aria-hidden>
            {e.segments.map((_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i < r.seg || ended ? "bg-ivory" : i === r.seg ? "bg-mint-500" : "bg-ivory/30"}`} />
            ))}
          </div>
        </div>
        {e.food.image_credit && (
          <div className="relative px-5 pb-2">
            <ImageCredit credit={e.food.image_credit} />
          </div>
        )}
      </div>

      <div className="min-h-28 space-y-2 rounded-3xl bg-surface p-5 shadow-sm" aria-live="polite">
        {ended ? (
          <p className="text-subtitle font-medium">오늘 라디오는 여기까지예요. 다른 채널도 들어 볼까요?</p>
        ) : (
          <>
            <p key={`${r.ep}-${r.seg}-${r.sent}`} className="animate-rise text-subtitle font-medium leading-relaxed">
              {line}
            </p>
            {after && <p className="line-clamp-2 text-sm text-muted">{after}</p>}
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-6">
        <button type="button" onClick={() => skip(-1)} disabled={r.ep === 0} className="grid size-12 place-items-center rounded-full text-2xl text-green-800 disabled:opacity-30" aria-label="이전 이야기">
          ⏮
        </button>
        <button type="button" onClick={toggle} className="relative grid size-20 place-items-center rounded-full bg-mint-500 text-3xl text-green-800 shadow-[0_10px_24px_-10px_#1f5f4699] transition active:scale-95" aria-label={playing ? "일시정지" : ended ? "처음부터 다시" : "재생"}>
          {playing && <span className="absolute inset-0 animate-pulse-ring rounded-full" aria-hidden />}
          {playing ? "⏸" : ended ? "↻" : "▶"}
        </button>
        <button type="button" onClick={() => skip(1)} disabled={r.ep >= r.episodes.length - 1} className="grid size-12 place-items-center rounded-full text-2xl text-green-800 disabled:opacity-30" aria-label="다음 이야기">
          ⏭
        </button>
      </div>
      <div className="flex justify-center gap-4 text-caption text-muted">
        <Link href={`/food/${e.food.slug}`} className="underline-offset-4 hover:underline">
          {e.food.name_ko} 자세히 보기
        </Link>
        {r.engine === "browser" && <span>· 브라우저 음성으로 재생 중</span>}
      </div>
    </section>
  );
}

function UpNext({ episodes, current, playing }: { episodes: Episode[]; current: number; playing: boolean }) {
  return (
    <section className="space-y-3" aria-label="편성표">
      <h2 className="text-sm font-semibold text-charcoal/70">이어지는 이야기</h2>
      <ol className="space-y-2">
        {episodes.map((e, i) => {
          const prev = episodes[i - 1]?.next?.bridge;
          const why = i === 0 ? "시작" : prev?.kind === "relation" ? RELATION_LABEL[prev.type] : "새로운 나라로";
          const desc = prev?.kind === "relation" ? prev.description : null;
          const on = i === current;
          return (
            <li key={e.food.slug}>
              <button type="button" onClick={() => playEpisode(i)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${on ? "bg-mint-100" : "hover:bg-surface"}`} aria-current={on ? "true" : undefined}>
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${e.food.accent}22` }} aria-hidden>
                  {e.food.flag}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{e.food.name_ko}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${prev?.kind === "relation" && prev.type === "historical_link" ? "bg-green-800 text-ivory" : "bg-line/70 text-charcoal/70"}`}>{why}</span>
                  </span>
                  <span className="block truncate text-caption text-muted">{desc ?? e.food.country_name}</span>
                </span>
                {on && playing ? <Bars /> : <span className="text-caption text-muted tabular-nums">{i + 1}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Bars() {
  return (
    <span className="flex h-4 items-center gap-0.5" aria-label="재생 중">
      {[0, 1, 2].map((i) => (
        <span key={i} className="block h-full w-1 origin-bottom animate-wave rounded-full bg-green-800" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

function NowSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="불러오는 중">
      <div className="h-64 animate-pulse rounded-[28px] bg-line/60" />
      <div className="h-28 animate-pulse rounded-3xl bg-line/40" />
    </div>
  );
}
