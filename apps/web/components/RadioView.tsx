"use client";
// S6 Food Culture Radio (F-VOI-05): 채널 → 지금 재생(사진·자막·조작) → 다음 이야기(연결 이유)
// 디자인 v2: 플레이어 하나만 숲 패널(연두 재생 버튼·연두 진행), 나머지는 흰 카드·유리 — 두 테마 모두 토큰으로
import Link from "next/link";
import { SkipBack, SkipForward } from "lucide-react";
import { RELATION_LABEL } from "@/lib/content/types";
import { closeRadio, playEpisode, skip, startRadio, toggle, useRadio } from "@/lib/client/radio";
import { sentences, type Episode } from "@/lib/radio/script";
import { useVoicePrefs } from "@/lib/client/voice-prefs";
import { useVoices } from "@/lib/client/voices";
import { findVoice, hostForSegment, isVoiceId } from "@/lib/voice/catalog";
import { ImageCredit } from "./ImageCredit";
import { PreviewBanner } from "./bits";
import { TopBar } from "./TopBar";
import { Icon, type IconName } from "./icons";
import { btn, Eyebrow, IconTile } from "./ui";

export type ChannelInfo = { id: string; title: string; icon: IconName; ready: boolean };
type Props = { channels: ChannelInfo[]; preview: boolean; startFood: { slug: string; name_ko: string; flag: string } | null };

export function RadioView({ channels, preview, startFood }: Props) {
  const r = useRadio();
  const has = r.episodes.length > 0;
  const activeChannel = r.channel?.split(":")[0];

  return (
    <main className="space-y-7 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:mx-auto lg:max-w-3xl lg:pt-8">
      <TopBar />
      {preview && <PreviewBanner />}

      <section className="space-y-1.5">
        <h1 className="text-h1 font-bold text-ink">
          Food Culture <span className="font-serif font-semibold italic text-leaf">Radio</span>
        </h1>
        <p className="text-sm text-ink-soft">1분 남짓한 음식 이야기 — 연결을 따라 다음 나라로 이어져요.</p>
      </section>

      {startFood && !has && r.status !== "loading" && (
        <button
          type="button"
          onClick={() => void startRadio({ channel: "today", start: startFood.slug })}
          className="card flex w-full items-center gap-3 rounded-3xl p-4 text-left transition active:scale-[0.99]"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-lime text-on-lime shadow-glow">
            <Icon name="play" className="size-5 translate-x-px fill-current" />
          </span>
          <span className="min-w-0">
            <span className="block text-caption text-ink-soft">여기서부터 듣기</span>
            <span className="block truncate text-title font-bold text-ink">
              {startFood.flag} {startFood.name_ko} 이야기
            </span>
          </span>
        </button>
      )}

      <div className="snap-row -mx-5 px-5 pb-2" role="group" aria-label="채널">
        {channels.map((c) => {
          const on = activeChannel === c.id && !r.channel?.includes(":");
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => void startRadio({ channel: c.id })}
              disabled={!c.ready}
              aria-pressed={on}
              className={`relative flex w-36 shrink-0 snap-start flex-col items-start gap-5 rounded-3xl border p-4 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                on ? "border-brand bg-brand text-on-brand shadow-brand" : "glass text-ink"
              }`}
            >
              <IconTile icon={c.icon} tone={on ? "lime" : "soft"} />
              {on && <Icon name="wave" className="absolute right-4 top-4 size-5" />}
              <span className="text-sm font-semibold leading-snug">
                {c.title}
                {on && <span className="mt-0.5 block text-caption font-medium opacity-85">듣는 중</span>}
                {!c.ready && <span className="mt-0.5 block text-caption font-normal text-ink-soft">준비 중</span>}
              </span>
            </button>
          );
        })}
      </div>

      {r.status === "loading" && <NowSkeleton />}
      {r.status === "error" && (
        <div className="card space-y-3 rounded-3xl p-5 text-center">
          <p className="flex items-center justify-center gap-2 text-sm text-ink">
            <Icon name="warn" className="size-[18px] shrink-0 text-leaf" />
            {r.error}
          </p>
          <button type="button" onClick={() => void startRadio({ channel: activeChannel ?? "today" })} className={btn("primary", "sm")}>
            <Icon name="replay" className="size-4" />
            다시 시도
          </button>
        </div>
      )}
      {has && r.status !== "loading" && <NowPlaying />}
      {has && r.status !== "loading" && <UpNext episodes={r.episodes} current={r.ep} playing={r.status === "playing"} />}
      {!has && r.status === "idle" && (
        <div className="flex items-start gap-3 rounded-3xl border border-dashed border-line px-4 py-5 text-sm text-ink-soft">
          <IconTile icon="radio" size="sm" />
          <p className="leading-relaxed">
            채널을 고르면 바로 시작해요. 푸디는 <b className="font-semibold text-ink">검수된 DB 문장만</b> 읽어요 — 지어내지 않아요.
          </p>
        </div>
      )}
      {has && (
        <button type="button" onClick={closeRadio} className={`${btn("ghost", "sm")} mx-auto flex`}>
          <Icon name="close" className="size-4" />
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
    <section className="space-y-3" aria-label="지금 재생">
      <div className="forest-panel space-y-4 rounded-[28px] p-3 pb-5 shadow-lift">
        {/* 사진 칸: 사진이 없으면 나라 Accent 를 옅게 깔고 국기 */}
        <div className="relative h-52 overflow-hidden rounded-[20px]" style={{ background: `${e.food.accent}55` }}>
          {e.food.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- 위키미디어 원본, 크레딧 표기
            <img src={e.food.image_url} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-6xl" aria-hidden>
              {e.food.flag}
            </span>
          )}
          <span className="glass-dark absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium">
            {e.food.flag} {e.food.country_name}
          </span>
          {e.food.image_credit && (
            <div className="absolute inset-x-3 bottom-3 flex">
              <ImageCredit credit={e.food.image_credit} />
            </div>
          )}
        </div>

        <div className="space-y-3 px-2">
          <div className="space-y-1">
            <Eyebrow className="text-lime">
              Now playing · {r.ep + 1}/{r.episodes.length}
            </Eyebrow>
            <h2 className="text-h1 font-bold text-white">{e.food.name_ko}</h2>
          </div>

          <div className="flex gap-1" aria-hidden>
            {e.segments.map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < r.seg || ended ? "bg-lime" : i === r.seg ? "bg-lime/55" : "bg-white/18"}`} />
            ))}
          </div>

          <div className="min-h-24 space-y-1.5" aria-live="polite">
            {ended ? (
              <p className="text-subtitle font-medium text-white/90">오늘 라디오는 여기까지예요. 다른 채널도 들어 볼까요?</p>
            ) : (
              <>
                <p key={`${r.ep}-${r.seg}-${r.sent}`} className="animate-rise text-subtitle font-medium text-white/90">
                  {line}
                </p>
                {after && <p className="line-clamp-2 text-sm text-white/60">{after}</p>}
              </>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 pt-1">
            <SkipButton dir={-1} disabled={r.ep === 0} />
            <button
              type="button"
              onClick={toggle}
              className="relative grid size-16 place-items-center rounded-full bg-lime text-on-lime shadow-glow transition active:scale-95"
              aria-label={playing ? "일시정지" : ended ? "처음부터 다시" : "재생"}
            >
              {playing && <span className="absolute inset-0 animate-pulse-ring rounded-full" aria-hidden />}
              <Icon name={playing ? "pause" : ended ? "replay" : "play"} className={`size-7 ${playing || ended ? "" : "translate-x-0.5 fill-current"}`} />
            </button>
            <SkipButton dir={1} disabled={r.ep >= r.episodes.length - 1} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href={`/food/${e.food.slug}`} className="inline-flex h-10 items-center gap-0.5 text-caption font-semibold text-leaf">
          {e.food.name_ko} 자세히 보기
          <Icon name="next" className="size-4" />
        </Link>
        {r.engine === "browser" ? (
          <span className="inline-flex items-center gap-1 text-caption text-ink-soft">
            <Icon name="info" className="size-4" />
            브라우저 음성으로 재생 중
          </span>
        ) : (
          <Hosts kind={seg?.kind ?? "summary"} />
        )}
      </div>
    </section>
  );
}

/** 2인 진행자 이름 (design/11 문서 §4). 지금 말하는 쪽을 조금 진하게 */
function Hosts({ kind }: { kind: string }) {
  const picked = useVoicePrefs((p) => p.radioHosts);
  const voices = useVoices();
  // 고른 진행자라도 서버에 그 키가 없으면 서버가 자동 진행자로 바꿔 부른다 → 이름도 같이 맞춘다
  const ready = (id: string) => !voices || voices.voices.some((v) => v.id === id && v.ready);
  const names = [0, 1].map((i) => {
    const id = picked?.[i];
    return findVoice(isVoiceId(id) && ready(id) ? id : voices?.auto.radio?.[i])?.label_ko;
  });
  if (!names?.[0] || !names[1]) return null;
  const now = hostForSegment(kind) === "host-a" ? 0 : 1;
  return (
    <span className="inline-flex items-center gap-1 text-caption text-ink-soft" aria-label={`진행: ${names[0]}, ${names[1]}`}>
      <Icon name="mic" className="size-4" />
      진행 {names.map((n, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <span className={i === now ? "font-semibold text-ink" : ""}>{n}</span>
        </span>
      ))}
    </span>
  );
}

/** 이전·다음 이야기 — 숲 패널 위 유리 버튼 48px */
function SkipButton({ dir, disabled }: { dir: 1 | -1; disabled: boolean }) {
  const Glyph = dir < 0 ? SkipBack : SkipForward;
  return (
    <button
      type="button"
      onClick={() => skip(dir)}
      disabled={disabled}
      className="grid size-12 place-items-center rounded-full border border-white/20 bg-white/12 text-white transition active:scale-95 disabled:opacity-35"
      aria-label={dir < 0 ? "이전 이야기" : "다음 이야기"}
    >
      <Glyph aria-hidden className="size-5" strokeWidth={1.75} />
    </button>
  );
}

function UpNext({ episodes, current, playing }: { episodes: Episode[]; current: number; playing: boolean }) {
  return (
    <section className="space-y-3" aria-label="편성표">
      <h2 className="text-title font-bold text-ink">이어지는 이야기</h2>
      <ol className="space-y-2">
        {episodes.map((e, i) => {
          const prev = episodes[i - 1]?.next?.bridge;
          const why = i === 0 ? "시작" : prev?.kind === "relation" ? RELATION_LABEL[prev.type] : "새로운 나라로";
          const desc = prev?.kind === "relation" ? prev.description : null;
          const on = i === current;
          const history = prev?.kind === "relation" && prev.type === "historical_link";
          return (
            <li key={e.food.slug}>
              <button
                type="button"
                onClick={() => playEpisode(i)}
                className={`flex w-full items-center gap-3 rounded-3xl p-3 text-left transition active:scale-[0.99] ${on ? "border border-brand/40 bg-lime-soft shadow-soft" : "card"}`}
                aria-current={on ? "true" : undefined}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${e.food.accent}22` }} aria-hidden>
                  {e.food.flag}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-ink">{e.food.name_ko}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${history ? "bg-brand text-on-brand" : on ? "bg-surface text-leaf" : "bg-lime-soft text-leaf"}`}>{why}</span>
                  </span>
                  <span className="block truncate text-caption text-ink-soft">{desc ?? e.food.country_name}</span>
                </span>
                {on && playing ? (
                  <Bars />
                ) : (
                  <span className="flex shrink-0 items-center gap-0.5 text-caption text-muted tabular-nums">
                    {on ? <span className="font-semibold text-leaf">지금</span> : i + 1}
                    <Icon name="next" className="size-4" />
                  </span>
                )}
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
    <span className="flex h-4 shrink-0 items-center gap-0.5" aria-label="재생 중">
      {[0, 1, 2].map((i) => (
        <span key={i} className="block h-full w-1 origin-bottom animate-wave rounded-full bg-leaf" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

function NowSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="불러오는 중">
      <div className="h-[30rem] animate-pulse rounded-[28px] bg-sunken" />
      <div className="h-20 animate-pulse rounded-3xl bg-sunken" />
    </div>
  );
}
