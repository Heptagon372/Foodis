"use client";
// S3 푸디 대화 시트 (05 문서 §4): 홈·상세 위에 겹치는 바텀 시트 → 맥락 유지.
// 채팅 UI 가 아니라 "말하는 카드 피드": 인식 텍스트(탭해서 수정) → 자막 → 카드 1~3 → 추천 질문 → 🎙 재질문
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AskResponse, PassportSummary } from "@/lib/foodi/schema";
import { answerFromPack, cachedAudio, isDemoMode } from "@/lib/client/demo";
import { getState, guestProfile, record } from "@/lib/client/passport";
import { listen, speak, stopSpeaking, type ListenHandle } from "@/lib/client/voice";
import { pauseRadio } from "@/lib/client/radio";
import { FoodCard } from "./FoodCard";
import { FollowUpChip } from "./bits";
import { VoiceButton, type VoiceState } from "./VoiceButton";
import { InAppNotice, MicHelp } from "./MicHelp";
import { PhotoAskButton, PhotoTurnView, type PhotoTurn } from "./PhotoAsk";

type OpenOpts = { contextFoodId?: string; contextName?: string; listen?: boolean; question?: string };
type Turn = { id: number; q: string; mode: "voice" | "text"; res?: AskResponse; error?: string; contextFoodId?: string; offline?: boolean; photo?: PhotoTurn };

const Ctx = createContext<{ open(o?: OpenOpts): void } | null>(null);
export const useFoodi = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("FoodiProvider 밖에서 useFoodi 사용");
  return c;
};

const ERRORS: Record<string, string> = {
  mic_denied: "마이크 권한이 꺼져 있어요. 아래에 글로 물어봐도 돼요.",
  no_speech: "잘 못 들었어요. 한 번 더 말해줄래요?",
  recognition_failed: "한 번 더 들어볼게요. 글로 입력해도 돼요.",
  unsupported: "이 브라우저는 음성 입력을 지원하지 않아요. 글로 물어봐 주세요.",
};

const STARTERS = ["오늘은 어디로 떠나볼까?", "비건으로 먹을 수 있는 음식 추천해줘", "만두 같은 음식 다른 나라에도 있어?"];

export function FoodiProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [context, setContext] = useState<{ id?: string; name?: string }>({});
  const [turns, setTurns] = useState<Turn[]>([]);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [micHelp, setMicHelp] = useState<"mic_denied" | "unsupported" | null>(null);
  const [draft, setDraft] = useState("");
  const [muted, setMuted] = useState(false);
  const [typeFirst, setTypeFirst] = useState(false);
  const listenRef = useRef<ListenHandle | null>(null);
  // 이번 대화에서 카드로 보여준 음식 — "다른 거 추천"이 같은 음식을 반복하지 않게 서버에 알려준다. 시트를 닫으면 새 대화
  const seen = useRef<string[]>([]);
  const router = useRouter();
  const seq = useRef(0);
  const feedEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = useCallback(
    async (q: string, mode: "voice" | "text", contextFoodId?: string) => {
      const text = q.trim();
      if (!text) return;
      setHint(null);
      setMicHelp(null);
      setInterim("");
      pauseRadio(); // 푸디가 답하는 동안 라디오는 잠시 멈춤
      const id = ++seq.current;
      setTurns((t) => [...t, { id, q: text, mode, contextFoodId }]);
      setVoice("thinking");
      const s = getState();
      const fromServer = async (): Promise<AskResponse> => {
        const res = await fetch("/api/foodi/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, input_mode: mode, context_food_id: contextFoodId, seen_food_ids: seen.current.slice(-30), guest: guestProfile(s) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? "푸디가 잠시 쉬고 있어요.");
        return data as AskResponse;
      };
      try {
        // 데모 모드: 발표 기기에 저장한 팩에서 먼저 (네트워크 0). 평소: 서버가 안 되면 팩이 대신 (06 문서 §6)
        let r: AskResponse;
        let packItem: string | null = null;
        let offline = false;
        const demo = isDemoMode() ? await answerFromPack(text, contextFoodId) : null;
        if (demo) ({ response: r, itemId: packItem } = demo);
        else {
          try {
            r = await fromServer();
          } catch (e) {
            const fb = await answerFromPack(text, contextFoodId).catch(() => null);
            if (!fb) throw e;
            ({ response: r, itemId: packItem } = fb);
            offline = true;
          }
        }
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, res: r, offline } : x)));
        seen.current = [...seen.current, ...r.cards.map((c) => c.food_id)];
        // 카드로 보여준 음식은 '탐험함'으로 Passport 에 기록 (F-REC-02)
        for (const c of r.cards) record({ id: c.food_id, slug: c.slug, name_ko: c.name_ko, flag: c.country.flag, country_code: c.country.code, taste_tags: [] }, "explored");
        if (muted) setVoice("idle");
        else {
          setVoice("speaking");
          const audio = packItem ? await cachedAudio(packItem).catch(() => null) : null;
          await speak(r.speech, () => setVoice((v) => (v === "speaking" ? "idle" : v)), audio);
        }
      } catch (e) {
        // fetch 의 TypeError = 네트워크 끊김. 브라우저 원문("Failed to fetch") 대신 사람 말로
        const message = e instanceof TypeError ? "인터넷 연결이 끊겼어요. 연결되면 다시 물어봐 주세요." : (e as Error).message;
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: message } : x)));
        setVoice("idle");
      }
    },
    [muted],
  );

  const startListening = useCallback(
    (contextFoodId?: string) => {
      stopSpeaking();
      pauseRadio();
      setHint(null);
      setMicHelp(null);
      setVoice("listening");
      setInterim("");
      listenRef.current = listen({
        onInterim: setInterim,
        onFinal: (t) => void ask(t, "voice", contextFoodId),
        onError: (reason) => {
          setVoice("idle");
          setInterim("");
          // 권한·지원 문제는 한 줄 안내 대신 "어디서 뭘 누르면 되는지" 카드로
          if (reason === "mic_denied" || reason === "unsupported") return setMicHelp(reason);
          setHint(ERRORS[reason] ?? ERRORS.recognition_failed);
          if (reason !== "no_speech") inputRef.current?.focus();
        },
      });
    },
    [ask],
  );

  const onVoicePress = () => {
    if (voice === "listening") return listenRef.current?.stop();
    if (voice === "speaking") return (stopSpeaking(), setVoice("idle"));
    if (voice === "thinking") return;
    startListening(context.id);
  };

  const open = useCallback(
    (o: OpenOpts = {}) => {
      setContext({ id: o.contextFoodId, name: o.contextName });
      setOpen(true);
      // "글로 입력"으로 열면 바로 타이핑할 수 있게 입력창에 포커스
      setTypeFirst(!o.listen && !o.question);
      if (o.question) void ask(o.question, "text", o.contextFoodId);
      else if (o.listen) startListening(o.contextFoodId);
    },
    [ask, startListening],
  );

  const close = () => {
    seen.current = [];
    listenRef.current?.cancel();
    stopSpeaking();
    setVoice("idle");
    setOpen(false);
  };

  // 중괄호 필수: 최신 Chromium 의 scrollIntoView 는 Promise 를 반환해 cleanup 으로 오인된다
  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, interim]);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // 사진 질문(F-VIS-01)도 같은 피드의 한 턴: 같은 key 면 갱신. 첫 카드를 맥락으로 남겨 이어지는 질문이 그 음식을 가리키게
  const photoTurn = (p: PhotoTurn) =>
    setTurns((t) => {
      const next = { q: "사진으로 물어봤어요", mode: "text" as const, photo: p, contextFoodId: p.res?.cards[0]?.food_id };
      return t.some((x) => x.photo?.key === p.key) ? t.map((x) => (x.photo?.key === p.key ? { ...x, ...next } : x)) : [...t, { id: ++seq.current, ...next }];
    });

  const editTurn = (t: Turn) => {
    setDraft(t.q);
    inputRef.current?.focus();
  };

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="푸디와 대화">
          <button type="button" aria-label="닫기" onClick={close} className="absolute inset-0 bg-charcoal/30 backdrop-blur-[2px]" />
          <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] max-w-md animate-sheet flex-col rounded-t-[28px] bg-ivory shadow-[0_-12px_40px_-12px_#00000055]">
            <div className="flex items-center justify-between px-5 pt-3">
              <span className="mx-auto h-1.5 w-10 rounded-full bg-line" aria-hidden />
            </div>
            <div className="flex items-center justify-between px-5 pb-2 pt-1">
              <p className="text-sm font-semibold text-green-800">
                푸디{context.name && <span className="font-normal text-muted"> · {context.name} 보는 중</span>}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => (setMuted((m) => !m), stopSpeaking(), setVoice((v) => (v === "speaking" ? "idle" : v)))} className="rounded-full px-2.5 py-1 text-caption text-muted hover:bg-line/60" aria-pressed={muted}>
                  {muted ? "🔇 음성 끔" : "🔊 음성 켬"}
                </button>
                <button type="button" onClick={close} className="rounded-full px-2.5 py-1 text-caption text-muted hover:bg-line/60">
                  닫기
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-4">
              {turns.length === 0 && voice !== "listening" && (
                <div className="space-y-3 pt-2">
                  <p className="font-display text-h2 font-semibold">무엇이든 물어보세요</p>
                  {!micHelp && <InAppNotice />}
                  <div className="flex flex-wrap gap-2">
                    {(context.id ? ["문화 이야기 들려줘", "비슷한 음식 있어?", "비건으로 먹을 수 있어?"] : STARTERS).map((s) => (
                      <FollowUpChip key={s} onClick={() => void ask(s, "text", context.id)}>
                        {s}
                      </FollowUpChip>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((t) => (
                <TurnView
                  key={t.id}
                  t={t}
                  onEdit={() => editTurn(t)}
                  onFollowUp={(q) => {
                    if (q.includes("패스포트")) return (close(), router.push("/passport"));
                    void ask(q, "text", t.res?.cards[0]?.food_id ?? t.contextFoodId);
                  }}
                  onKnown={(foodId) => void ask("다른 거 추천", "text", foodId)}
                />
              ))}
              {voice === "listening" && <p className="text-right text-subtitle text-charcoal/70">{interim || "듣고 있어요…"}</p>}
              {micHelp && <MicHelp reason={micHelp} onType={() => (setMicHelp(null), inputRef.current?.focus())} />}
              {hint && <p className="rounded-xl bg-surface px-3 py-2 text-sm text-charcoal/80">{hint}</p>}
              <div ref={feedEnd} />
            </div>

            <div className="border-t border-line bg-ivory/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <div className="flex items-center gap-3">
                <form
                  className="flex flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(draft, "text", context.id);
                    setDraft("");
                  }}
                >
                  <PhotoAskButton onTurn={photoTurn} disabled={voice === "listening"} />
                  <input ref={inputRef} autoFocus={typeFirst} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="글로 물어보기" maxLength={300} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" enterKeyHint="send" />
                  {draft && (
                    <button type="submit" className="text-sm font-semibold text-green-800">
                      보내기
                    </button>
                  )}
                </form>
                <VoiceButton state={voice} onPress={onVoicePress} size="md" />
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// 추천 계열 답의 카드에는 "이미 알아요" — 아는 음식이 나오면 바로 다른 추천 (07 문서 사용자 여정의 이탈 대응)
const KNOWN_INTENTS = new Set(["recommend", "filter_by_diet", "compare_similar", "out_of_scope"]);

function TurnView({ t, onEdit, onFollowUp, onKnown }: { t: Turn; onEdit: () => void; onFollowUp: (q: string) => void; onKnown: (foodId: string) => void }) {
  if (t.photo) return <PhotoTurnView p={t.photo} onFollowUp={onFollowUp} />;
  return (
    <div className="animate-rise space-y-3">
      <button type="button" onClick={onEdit} className="ml-auto block max-w-[85%] text-right text-subtitle text-charcoal/70" title="탭해서 고치기">
        “{t.q}” <span className="text-caption text-muted">✎</span>
      </button>
      {!t.res && !t.error && <p className="text-sm text-muted">푸디가 지도를 보고 있어요…</p>}
      {t.error && <p className="rounded-xl bg-surface px-3 py-2 text-sm">{t.error}</p>}
      {t.res && (
        <>
          {t.offline && <p className="w-fit rounded-full bg-diet-warn/15 px-3 py-1 text-caption text-[#7a5a10]">📦 연결이 불안정해 저장된 답으로 보여드려요</p>}
          {t.res.not_in_map && <p className="w-fit rounded-full bg-line/60 px-3 py-1 text-caption text-charcoal/70">🗺 ‘{t.res.not_in_map}’ — 아직 FOODIS 지도에 없어요</p>}
          <p className="text-subtitle font-medium">{t.res.speech}</p>
          {t.res.passport && <PassportCard p={t.res.passport} />}
          {t.res.cards.length > 0 && (
            <div className="snap-row -mx-5 px-5">
              {t.res.cards.map((c) => (
                <div key={c.food_id} className="w-[82%]">
                  <FoodCard
                    size="L"
                    reason={c.reason}
                    food={{ slug: c.slug, name_ko: c.name_ko, flag: c.country.flag, accent: c.country.accent, summary: c.summary, image_url: c.image_url, image_credit: c.image_credit, diet: Object.fromEntries(c.diet_badges.map((b) => [b.key, b.level])) as never }}
                    action={
                      KNOWN_INTENTS.has(t.res!.intent) ? (
                        <>
                          <Link href={`/food/${c.slug}`} className="rounded-full bg-mint-100 px-3 py-1.5 text-sm font-semibold text-green-800">
                            자세히
                          </Link>
                          <button type="button" onClick={() => onKnown(c.food_id)} className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-line/50">
                            이미 알아요 · 다른 거
                          </button>
                        </>
                      ) : undefined
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {t.res.follow_ups.map((f) => (
              <FollowUpChip key={f} onClick={() => onFollowUp(f)}>
                {f}
              </FollowUpChip>
            ))}
          </div>
          {t.res.sources.length > 0 && (
            <p className="truncate text-caption text-muted">
              출처:{" "}
              {t.res.sources.map((s, i) => (
                <a key={s.url + i} href={s.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2">
                  {s.title ?? "링크"}
                  {i < t.res!.sources.length - 1 ? ", " : ""}
                </a>
              ))}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** passport_status 답에 붙는 요약 카드 (03 문서 #7) */
function PassportCard({ p }: { p: PassportSummary }) {
  return (
    <div className="space-y-2 rounded-2xl bg-green-800 p-4 text-ivory">
      <p className="font-display text-xl font-semibold">
        📕 {p.countries}개국 · {p.foods}개 음식
      </p>
      {p.by_continent.map((c) => (
        <div key={c.key} className="flex items-center gap-2 text-caption">
          <span className="w-24 shrink-0">{c.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ivory/20">
            <span className="block h-full rounded-full bg-mint-500" style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} />
          </span>
          <span className="w-9 text-right tabular-nums">
            {c.done}/{c.total}
          </span>
        </div>
      ))}
    </div>
  );
}
