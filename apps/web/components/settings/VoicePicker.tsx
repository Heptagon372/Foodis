"use client";
// 푸디 목소리 · 라디오 진행자 고르기 (design/11 문서). 목소리 하나 = 제공자 · TTS 모델 · 음성 → 고르면 곧 모델 선택.
// 목록·준비 여부는 /api/foodi/voices, 미리듣기는 /api/foodi/tts { voice, exact } — 그 목소리만 (다른 목소리로 대신하지 않음)
import { useEffect, useRef, useState } from "react";
import { beforeSpeak, stopSpeaking } from "@/lib/client/voice";
import { setVoicePrefs, useVoicePrefs } from "@/lib/client/voice-prefs";
import { useVoices } from "@/lib/client/voices";
import { findVoice, HOST_LABEL, HOST_ROLES, isVoiceId, PRICE_LABEL, PROVIDER_LABEL, SPEED_LABEL, TTS_PROVIDERS, type VoiceInfo } from "@/lib/voice/catalog";

const SAMPLE = "안녕하세요, 저는 푸디예요. 오늘은 어느 나라 음식 이야기를 들어 볼까요?";

export function VoicePicker() {
  const data = useVoices();
  const selected = useVoicePrefs((p) => p.ttsVoice);
  const preview = usePreview();

  if (data === undefined) return <div className="h-24 animate-pulse rounded-2xl bg-line/50" aria-busy="true" aria-label="목소리 목록 불러오는 중" />;
  if (data === null) return <p className="text-sm text-muted">목소리 목록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>;

  const anyReady = data.voices.some((v) => v.ready);
  const pickedInfo = data.voices.find((v) => v.id === selected);
  const autoVoice = findVoice(data.auto.foodi);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">푸디 목소리</h3>
          <p className="text-caption text-muted">목소리마다 쓰는 TTS 모델이 달라요. ▶ 로 먼저 들어 보세요.</p>
        </div>
        {!anyReady && <p className="rounded-xl bg-line/40 px-3 py-2 text-caption text-charcoal/70">서버에 음성 키가 아직 없어서 지금은 브라우저 음성으로 말해요.</p>}
        {pickedInfo && !pickedInfo.ready && <p className="rounded-xl bg-diet-warn/10 px-3 py-2 text-caption">고른 목소리({pickedInfo.label_ko})는 지금 쓸 수 없어서 기본 목소리로 말해요.</p>}

        <div role="radiogroup" aria-label="푸디 목소리" className="space-y-2">
          <Choice on={!isVoiceId(selected)} onPick={() => setVoicePrefs({ ttsVoice: null })} title="자동 (추천)" desc={autoVoice ? `지금은 ${autoVoice.label_ko} · ${PROVIDER_LABEL[autoVoice.provider]} ${autoVoice.modelLabel}` : anyReady ? "서버 기본 목소리를 따라요" : "브라우저 음성"} />
          {TTS_PROVIDERS.map((p) => {
            const list = data.voices.filter((v) => v.provider === p);
            const info = data.providers.find((x) => x.id === p);
            const hasPicked = list.some((v) => v.id === selected);
            return (
              <details key={p} open={hasPicked || undefined} className="group rounded-2xl border border-line bg-surface">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="text-muted transition group-open:rotate-90" aria-hidden>
                    ›
                  </span>
                  {PROVIDER_LABEL[p]}
                  <span className="text-caption font-normal text-muted">{list.length}개</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${info?.ready ? "bg-mint-100 text-green-800" : "bg-line/70 text-muted"}`}>{info?.ready ? "사용 가능" : "키 설정 필요"}</span>
                </summary>
                <ul className="space-y-1 px-1.5 pb-1.5">
                  {list.map((v) => (
                    <VoiceRow key={v.id} v={v} on={v.id === selected} onPick={() => setVoicePrefs({ ttsVoice: v.id })} preview={preview} />
                  ))}
                </ul>
                {info && <p className="px-3 pb-2.5 text-[11px] text-muted">{info.freeTier}</p>}
              </details>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted">빠름·보통·느림 = 첫 소리까지 걸리는 느낌 · $ = 100만 자당 $20 미만, $$ = $50 미만, $$$ = 그 이상 (목록가)</p>
      </div>

      <RadioHosts voices={data.voices} auto={data.auto.radio} />
    </div>
  );
}

function Choice({ on, onPick, title, desc }: { on: boolean; onPick(): void; title: string; desc: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${on ? "bg-mint-100 ring-1 ring-mint-500" : "border border-line bg-surface"}`}>
      <Dot on={on} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-caption text-muted">{desc}</span>
      </span>
    </button>
  );
}

function Dot({ on }: { on: boolean }) {
  return <span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${on ? "border-green-800" : "border-line"}`}>{on && <span className="size-2 rounded-full bg-green-800" />}</span>;
}

function Badge({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <span className={`rounded-full px-1.5 py-px text-[10.5px] font-medium leading-4 ${strong ? "bg-green-800 text-ivory" : "bg-line/70 text-charcoal/70"}`}>{children}</span>;
}

function VoiceRow({ v, on, onPick, preview }: { v: VoiceInfo; on: boolean; onPick(): void; preview: Preview }) {
  const st = preview.state?.id === v.id ? preview.state.status : null;
  return (
    <li className={`flex items-center gap-2 rounded-xl px-2 py-2 transition ${on ? "bg-mint-100 ring-1 ring-mint-500" : ""} ${v.ready ? "" : "opacity-55"}`}>
      <button type="button" role="radio" aria-checked={on} disabled={!v.ready} onClick={onPick} className="flex min-w-0 flex-1 items-start gap-2.5 text-left disabled:cursor-not-allowed">
        <span className="mt-0.5">
          <Dot on={on} />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-sm font-semibold">{v.label_ko}</span>
            <Badge>{v.modelLabel}</Badge>
            <Badge strong={v.speed === "fast"}>{SPEED_LABEL[v.speed]}</Badge>
            <Badge>{PRICE_LABEL[v.priceTier]}</Badge>
          </span>
          <span className="mt-0.5 block text-caption leading-snug text-muted">{v.desc_ko}</span>
        </span>
      </button>
      {/* 키가 없으면 묶음 제목에 "키 설정 필요" — 줄마다 되풀이하지 않는다 */}
      {v.ready && (
        <button
          type="button"
          onClick={() => preview.play(v.id)}
          className={`grid size-9 shrink-0 place-items-center rounded-full text-sm transition active:scale-95 ${st === "playing" ? "bg-green-800 text-ivory" : st === "error" ? "bg-diet-no/10 text-diet-no" : "bg-mint-500 text-green-800"}`}
          aria-label={st === "playing" ? `${v.label_ko} 미리듣기 멈추기` : `${v.label_ko} 미리듣기`}
          title={st === "error" ? "지금은 들을 수 없어요" : undefined}
        >
          {st === "loading" ? <span className="size-3 animate-spin rounded-full border-2 border-green-800 border-t-transparent" aria-hidden /> : st === "playing" ? "■" : st === "error" ? "!" : "▶"}
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
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">라디오 진행자</h3>
        <p className="text-caption text-muted">두 사람이 번갈아 진행해요 — 이야기는 이야기꾼이, 오프닝·다음 나라 소개는 진행자가.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {HOST_ROLES.map((role, i) => {
          const value = isVoiceId(hosts?.[i]) ? hosts![i] : "auto";
          const autoName = findVoice(auto?.[i])?.label_ko;
          return (
            <label key={role} className="space-y-1">
              <span className="block text-caption font-semibold text-charcoal/70">
                {i === 0 ? "🎙 " : "🎤 "}
                {HOST_LABEL[role]}
              </span>
              <select value={value} onChange={(e) => set(i as 0 | 1, e.target.value)} disabled={!ready.length} className="w-full rounded-xl border border-line bg-surface px-2.5 py-2 text-sm disabled:opacity-60">
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
    </div>
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
