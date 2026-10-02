"use client";
// 음성 인식 방식 고르기 (STT, 10 문서 §6): 빠르게(브라우저) / 정확하게(서버 — 사투리·외국어) + 언어 힌트 + 엔진 직접 고르기.
// 서버 엔진 준비 상태는 GET /api/foodi/stt 로 본다 (키 값은 오지 않는다).
import { useEffect, useState } from "react";
import { setVoicePrefs, useVoicePrefs, type VoicePrefs } from "@/lib/client/voice-prefs";

type Engine = { id: string; label_ko: string; desc_ko: string; ready: boolean; langs: ("ko" | "auto")[] };
type Status = { engines: Engine[]; chains: { ko: string[]; auto: string[] }; normalize: boolean };

const MODES: { id: VoicePrefs["sttMode"]; title: string; desc: string }[] = [
  { id: "auto", title: "빠르게 (브라우저)", desc: "말하는 동안 글자가 바로 보여요. 무료예요." },
  { id: "server", title: "정확하게 · 사투리/외국어 (서버)", desc: "말을 마치면 1~3초 뒤에 알아들어요. 인식 비용이 조금 들어요." },
];
const LANGS: { id: VoicePrefs["sttLang"]; label: string }[] = [
  { id: "ko", label: "한국어(사투리 포함)" },
  { id: "auto", label: "자동 감지(외국어)" },
];

const chip = (on: boolean, disabled = false) =>
  `rounded-full border px-3 py-1.5 text-sm ${disabled ? "border-line bg-surface text-muted opacity-60" : on ? "border-mint-500 bg-mint-100 font-medium text-green-800" : "border-line bg-surface text-charcoal/80"}`;

export function RecognitionSetting() {
  const mode = useVoicePrefs((p) => p.sttMode);
  const lang = useVoicePrefs((p) => p.sttLang);
  const engine = useVoicePrefs((p) => p.sttEngine);
  const [status, setStatus] = useState<Status | null | "error">(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/foodi/stt")
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : Promise.reject()))
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, []);

  const s = status && status !== "error" ? status : null;
  const readyIds = new Set(s?.engines.filter((e) => e.ready).map((e) => e.id) ?? []);
  // 서버와 같은 규칙: 고른 엔진(준비됨 + 이 언어 지원)이 맨 앞, 나머지는 기본 체인 순서
  const picked = s?.engines.find((e) => e.id === engine && e.ready && e.langs.includes(lang))?.id;
  const order = [...new Set([...(picked ? [picked] : []), ...(s?.chains[lang] ?? []).filter((id) => readyIds.has(id))])];
  const label = (id: string) => s?.engines.find((e) => e.id === id)?.label_ko ?? id;
  const server = mode === "server";

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-green-800">알아듣기</p>
      <div role="radiogroup" aria-label="음성 인식 방식" className="grid gap-2">
        {MODES.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setVoicePrefs({ sttMode: m.id })}
              className={`rounded-2xl border px-4 py-3 text-left ${on ? "border-mint-500 bg-mint-100" : "border-line bg-surface"}`}
            >
              <span className={`block text-[15px] font-semibold ${on ? "text-green-800" : "text-charcoal"}`}>
                {on ? "● " : "○ "}
                {m.title}
              </span>
              <span className="mt-0.5 block text-caption text-muted">{m.desc}</span>
            </button>
          );
        })}
      </div>

      <div className={server ? "space-y-3" : "space-y-3 opacity-60"}>
        <div>
          <p className="pb-1.5 text-caption text-muted">무슨 말로 말할까요?</p>
          <div role="radiogroup" aria-label="언어 힌트" className="flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} onClick={() => setVoicePrefs({ sttLang: l.id })} className={chip(lang === l.id)}>
                {lang === l.id ? "✓ " : ""}
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="pb-1.5 text-caption text-muted">인식 엔진</p>
          <div role="radiogroup" aria-label="인식 엔진" className="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={!engine} onClick={() => setVoicePrefs({ sttEngine: null })} className={chip(!engine)}>
              {!engine ? "✓ " : ""}자동 (추천)
            </button>
            {s?.engines.map((e) => {
              const on = engine === e.id;
              const fits = e.langs.includes(lang);
              return (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!e.ready}
                  onClick={() => setVoicePrefs({ sttEngine: e.id })}
                  title={e.ready ? e.desc_ko : "서버에 키가 없어서 쓸 수 없어요"}
                  className={chip(on, !e.ready)}
                >
                  {on ? "✓ " : ""}
                  {e.label_ko}
                  <span className="ml-1 text-caption text-muted">
                    · {e.ready ? (fits ? e.desc_ko : "한국어 전용") : "키 없음"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-caption text-muted">
          {status === null
            ? "서버 엔진 상태를 확인하고 있어요…"
            : status === "error"
              ? "서버 엔진 상태를 못 불러왔어요. 잠시 뒤 다시 열어 주세요."
              : order.length
                ? `지금 순서: ${order.map(label).join(" → ")} (안 되면 다음 엔진으로 넘어가요)`
                : "준비된 서버 엔진이 아직 없어요. 지금은 브라우저 인식을 써 주세요."}
        </p>
      </div>
      <p className="text-caption text-muted">녹음은 알아듣는 데만 쓰고 저장하지 않아요. 사투리·외국어는 표준어로 바꿔 묻고, 들은 말도 함께 보여 드려요.</p>
    </div>
  );
}
