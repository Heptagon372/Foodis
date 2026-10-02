"use client";
// 푸디 목소리 · 라디오 진행자 고르기 (design/11 문서). 목소리 하나 = 제공자 · TTS 모델 · 음성 → 고르면 곧 모델 선택.
// 목록·준비 여부는 /api/foodi/voices, 미리듣기는 /api/foodi/tts { voice, exact } — 그 목소리만 (다른 목소리로 대신하지 않음)
import { useEffect, useRef, useState } from "react";
import { beforeSpeak, stopSpeaking } from "@/lib/client/voice";
import { setVoicePrefs, useVoicePrefs } from "@/lib/client/voice-prefs";
import { useVoices } from "@/lib/client/voices";
import { findVoice, HOST_LABEL, HOST_ROLES, isVoiceId, PRICE_LABEL, PROVIDER_LABEL, SPEED_LABEL, TTS_PROVIDERS, type VoiceInfo } from "@/lib/voice/catalog";
import { Icon } from "../icons";
import { optionRow, RadioDot, SettingCard, Tag } from "./parts";

const SAMPLE = "안녕하세요, 저는 푸디예요. 오늘은 어느 나라 음식 이야기를 들어 볼까요?";

export function VoicePicker() {
  const data = useVoices();
  const selected = useVoicePrefs((p) => p.ttsVoice);
  const preview = usePreview();

  if (data === undefined)
    return (
      <SettingCard icon="volume" title="푸디 목소리">
        <div className="h-24 animate-pulse rounded-2xl bg-sunken" aria-busy="true" aria-label="목소리 목록 불러오는 중" />
      </SettingCard>
    );
  if (data === null)
    return (
      <SettingCard icon="volume" title="푸디 목소리">
        <p className="text-sm text-muted">목소리 목록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>
      </SettingCard>
    );

  const anyReady = data.voices.some((v) => v.ready);
  const pickedInfo = data.voices.find((v) => v.id === selected);
  const autoVoice = findVoice(data.auto.foodi);

  return (
    <>
      <SettingCard icon="volume" title="푸디 목소리" desc="목소리마다 쓰는 TTS 모델이 달라요. 재생 버튼으로 먼저 들어 보세요.">
        {!anyReady && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-sunken px-3 py-2.5 text-caption text-ink-soft">
            <Icon name="info" className="mt-px size-4 shrink-0 text-leaf" />
            서버에 음성 키가 아직 없어서 지금은 브라우저 음성으로 말해요.
          </p>
        )}
        {pickedInfo && !pickedInfo.ready && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-diet-warn/10 px-3 py-2.5 text-caption text-diet-warn-ink">
            <Icon name="warn" className="mt-px size-4 shrink-0" />
            고른 목소리({pickedInfo.label_ko})는 지금 쓸 수 없어서 기본 목소리로 말해요.
          </p>
        )}

        <div role="radiogroup" aria-label="푸디 목소리" className="space-y-2">
          <Choice on={!isVoiceId(selected)} onPick={() => setVoicePrefs({ ttsVoice: null })} title="자동 (추천)" desc={autoVoice ? `지금은 ${autoVoice.label_ko} · ${PROVIDER_LABEL[autoVoice.provider]} ${autoVoice.modelLabel}` : anyReady ? "서버 기본 목소리를 따라요" : "브라우저 음성"} />
          {TTS_PROVIDERS.map((p) => {
            const list = data.voices.filter((v) => v.provider === p);
            const info = data.providers.find((x) => x.id === p);
            const hasPicked = list.some((v) => v.id === selected);
            return (
              <details key={p} open={hasPicked || undefined} className="group rounded-2xl border border-line bg-surface">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  <Icon name="next" className="size-4 shrink-0 text-muted transition group-open:rotate-90" />
                  {PROVIDER_LABEL[p]}
                  <span className="text-caption font-normal text-muted">{list.length}개</span>
                  <span className="ml-auto">
                    {info?.ready ? (
                      <Tag icon="check" tone="good">
                        사용 가능
                      </Tag>
                    ) : (
                      <Tag icon="key">키 설정 필요</Tag>
                    )}
                  </span>
                </summary>
                <ul className="space-y-1 px-1.5 pb-1.5">
                  {list.map((v) => (
                    <VoiceRow key={v.id} v={v} on={v.id === selected} onPick={() => setVoicePrefs({ ttsVoice: v.id })} preview={preview} />
                  ))}
                </ul>
                {info && <p className="px-3 pb-3 text-[11px] text-muted">{info.freeTier}</p>}
              </details>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted">빠름·보통·느림 = 첫 소리까지 걸리는 느낌 · $ = 100만 자당 $20 미만, $$ = $50 미만, $$$ = 그 이상 (목록가)</p>
      </SettingCard>

      <RadioHosts voices={data.voices} auto={data.auto.radio} />
    </>
  );
}

function Choice({ on, onPick, title, desc }: { on: boolean; onPick(): void; title: string; desc: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick} className={optionRow(on)}>
      <span className="mt-0.5">
        <RadioDot on={on} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-caption text-muted">{desc}</span>
      </span>
    </button>
  );
}

function VoiceRow({ v, on, onPick, preview }: { v: VoiceInfo; on: boolean; onPick(): void; preview: Preview }) {
  const st = preview.state?.id === v.id ? preview.state.status : null;
  return (
    <li className={`flex items-center gap-2 rounded-xl border px-2 py-2 transition ${on ? "border-brand bg-lime-soft" : "border-transparent"} ${v.ready ? "" : "opacity-55"}`}>
      <button type="button" role="radio" aria-checked={on} disabled={!v.ready} onClick={onPick} className="flex min-h-10 min-w-0 flex-1 items-start gap-2.5 text-left disabled:cursor-not-allowed">
        <span className="mt-0.5">
          <RadioDot on={on} />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-sm font-semibold text-ink">{v.label_ko}</span>
            <Tag>{v.modelLabel}</Tag>
            <Tag icon={v.speed === "fast" ? "zap" : undefined} tone={v.speed === "fast" ? "good" : "plain"}>
              {SPEED_LABEL[v.speed]}
            </Tag>
            <Tag>{PRICE_LABEL[v.priceTier]}</Tag>
          </span>
          <span className="mt-0.5 block text-caption leading-snug text-muted">{v.desc_ko}</span>
        </span>
      </button>
      {/* 키가 없으면 묶음 제목에 "키 설정 필요" — 줄마다 되풀이하지 않는다 */}
      {v.ready && (
        <button
          type="button"
          onClick={() => preview.play(v.id)}
          className={`grid size-10 shrink-0 place-items-center rounded-full transition active:scale-95 ${st === "playing" ? "bg-brand text-on-brand" : st === "error" ? "bg-diet-no/10 text-diet-no" : "bg-lime text-on-lime"}`}
          aria-label={st === "playing" ? `${v.label_ko} 미리듣기 멈추기` : `${v.label_ko} 미리듣기`}
          title={st === "error" ? "지금은 들을 수 없어요" : undefined}
        >
          {st === "loading" ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          ) : (
            <Icon name={st === "playing" ? "stop" : st === "error" ? "warn" : "play"} className="size-4" fill={st === "playing" || !st ? "currentColor" : "none"} />
          )}
        </button>
      )}
    </li>
  );
}

/** 라디오 2인 진행 (design/11 문서 §4): 긴 이야기 = 이야기꾼, 오프닝·연결 멘트 = 진행자. "자동"은 역할 이름(host-a/b)으로 저장 → 서버가 고른다 */
function RadioHosts({ voices, auto }: { voices: VoiceInfo[]; auto: [string, string] | null }) {
  const hosts = useVoicePrefs((p) => p.radioHosts);
  const ready = voices.filter((v) => v.ready);
  const set = (i: 0 | 1, value: string) => {
    const next = HOST_ROLES.map((role, j) => (j === i ? (value === "auto" ? role : value) : (hosts?.[j] ?? role))) as [string, string];
    setVoicePrefs({ radioHosts: next.every((x) => !isVoiceId(x)) ? null : next });
  };
  return (
    <SettingCard icon="radio" title="라디오 진행자" desc="두 사람이 번갈아 진행해요 — 이야기는 이야기꾼이, 오프닝·다음 나라 소개는 진행자가.">
      <div className="grid grid-cols-2 gap-2">
        {HOST_ROLES.map((role, i) => {
          const value = isVoiceId(hosts?.[i]) ? hosts![i] : "auto";
          const autoName = findVoice(auto?.[i])?.label_ko;
          return (
            <label key={role} className="min-w-0 space-y-1.5">
              <span className="flex items-center gap-1.5 text-caption font-semibold text-ink-soft">
                <Icon name={i === 0 ? "book" : "mic"} className="size-4 text-leaf" />
                {HOST_LABEL[role]}
              </span>
              <select value={value} onChange={(e) => set(i as 0 | 1, e.target.value)} disabled={!ready.length} className="h-11 w-full rounded-xl border border-line bg-surface px-2.5 text-sm text-ink focus:border-brand disabled:opacity-60">
                <option value="auto">자동{autoName ? ` (${autoName})` : ""}</option>
                {TTS_PROVIDERS.map((p) => {
                  const list = ready.filter((v) => v.provider === p);
                  return list.length ? (
                    <optgroup key={p} label={PROVIDER_LABEL[p]}>
                      {list.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label_ko} · {v.modelLabel}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
          );
        })}
      </div>
    </SettingCard>
  );
}

type Preview = { state: { id: string; status: "loading" | "playing" | "error" } | null; play(id: string): void };

/** 미리듣기: 짧은 문장을 그 목소리로만. 다시 누르면 멈춤. 푸디·라디오 소리와 겹치지 않게 먼저 멈춘다 */
function usePreview(): Preview {
  const [state, setState] = useState<Preview["state"]>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);
  const current = useRef<string | null>(null);

  const halt = () => {
    ctrl.current?.abort();
    audio.current?.pause();
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    current.current = null;
  };
  useEffect(() => halt, []);

  const play = async (id: string) => {
    const again = current.current === id;
    halt();
    setState(null);
    if (again) return; // 같은 걸 다시 누르면 멈춤
    stopSpeaking();
    beforeSpeak.forEach((f) => f()); // 라디오 멈춤
    const c = (ctrl.current = new AbortController());
    current.current = id;
    setState({ id, status: "loading" });
    const timer = setTimeout(() => c.abort(), 15_000); // Gemini 처럼 다 만든 뒤 주는 목소리도 기다릴 만큼
    try {
      const res = await fetch("/api/foodi/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: SAMPLE, voice: id, exact: true }), signal: c.signal });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (c.signal.aborted) return;
      const el = (audio.current ??= new Audio());
      url.current = URL.createObjectURL(blob);
      el.src = url.current;
      el.onended = () => {
        if (current.current !== id) return;
        halt();
        setState(null);
      };
      await el.play();
      if (current.current === id) setState({ id, status: "playing" });
    } catch {
      // 다른 걸 눌렀거나 멈춘 거면 조용히. 실패(키 오류·시간 초과)면 표시하고, 다시 누르면 재시도
      if (current.current !== id) return;
      current.current = null;
      setState({ id, status: "error" });
    } finally {
      clearTimeout(timer);
    }
  };
  return { state, play: (id) => void play(id) };
}
