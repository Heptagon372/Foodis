"use client";
// 푸랜드 1:1 대화방: 위에 상대 정보(음식·한마디·나이·성별) → 메시지 → 입력. 2.5초마다 새 메시지를 묻는다.
// '대화 종료'를 누르면 둘 다 더는 보낼 수 없고, 상대 화면에도 종료됐다고 뜬다.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { endChat, fetchChat, markSeen, sendChat } from "@/lib/client/buddy";
import { ApiError } from "@/lib/client/community";
import { BUDDY_LIMITS, type ChatView, type MessageView } from "@/lib/buddy/types";
import { Icon } from "../../icons";
import { TopBar } from "../../TopBar";
import { btn } from "../../ui";
import { LoginPrompt } from "../parts";
import { ProfileCard } from "./BuddyTab";

const POLL_MS = 2_500;
const KST = "Asia/Seoul";
const clock = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export function BuddyChat({ id }: { id: string }) {
  const [chat, setChat] = useState<ChatView | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const after = useRef<string | null>(null);
  const bottom = useRef<HTMLLIElement>(null);

  const merge = useCallback((list: MessageView[]) => {
    if (!list.length) return;
    setMessages((cur) => {
      const ids = new Set(cur.map((m) => m.id));
      const next = [...cur, ...list.filter((m) => !ids.has(m.id))].sort((a, b) => a.created_at.localeCompare(b.created_at));
      after.current = next.at(-1)?.created_at ?? after.current;
      return next;
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const r = await fetchChat(id, after.current);
      setChat(r.chat);
      merge(r.messages);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setError(e.message);
    }
  }, [id, merge]);

  useEffect(() => {
    poll();
    const t = setInterval(() => document.visibilityState === "visible" && poll(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // 새 메시지가 오면 아래로 + 읽음 표시
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    const last = messages.at(-1);
    if (last) markSeen(id, last.created_at);
  }, [messages, id]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const r = await sendChat(id, body);
      merge([r.message]);
      setText("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setLogin(err.message);
      else setNotice((err as Error).message);
      if (err instanceof ApiError && err.code === "chat_ended") poll();
    } finally {
      setSending(false);
    }
  };

  const end = async () => {
    try {
      const r = await endChat(id);
      setChat(r.chat);
      setConfirmEnd(false);
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  if (error)
    return (
      <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:mx-auto lg:max-w-2xl lg:pt-8">
        <TopBar back={{ href: "/community?tab=buddy", label: "푸랜드" }} />
        <div className="card space-y-3 rounded-3xl p-6 text-center">
          <p className="text-sm text-ink-soft">{error}</p>
          <Link href="/community?tab=buddy" className={btn("primary", "sm")}>
            푸랜드로 돌아가기
          </Link>
        </div>
      </main>
    );

  const ended = Boolean(chat?.ended_at);

  return (
    <main className="flex min-h-[calc(100dvh-5rem)] flex-col gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 lg:mx-auto lg:min-h-[calc(100dvh_-_var(--desk-nav)_-_2rem)] lg:max-w-2xl lg:pt-8">
      <TopBar back={{ href: "/community?tab=buddy", label: "푸랜드" }}>
        {chat && !ended && (
          <button type="button" className={btn("outline", "sm")} onClick={() => setConfirmEnd(true)}>
            <Icon name="close" className="size-4" />
            대화 종료
          </button>
        )}
      </TopBar>

      {/* 상대 정보 — 대화하며 알아 가는 사람 */}
      {chat ? (
        <section className="meadow-panel rounded-3xl p-4" aria-label="상대 정보">
          <div className="flex items-start justify-between gap-2">
            {showInfo ? (
              <ProfileCard name={chat.partner.name} profile={chat.partner} />
            ) : (
              <p className="text-[15px] font-bold text-ink">{chat.partner.name}</p>
            )}
            <button type="button" onClick={() => setShowInfo((v) => !v)} className="shrink-0 text-caption font-semibold text-leaf" aria-expanded={showInfo}>
              {showInfo ? "접기" : "정보 보기"}
            </button>
          </div>
        </section>
      ) : (
        <div className="h-28 animate-pulse rounded-3xl bg-sunken/70" />
      )}

      {confirmEnd && (
        <div role="alertdialog" aria-label="대화 종료" className="card space-y-3 rounded-2xl p-4">
          <p className="text-sm text-ink">대화를 종료할까요? 종료하면 둘 다 더는 메시지를 보낼 수 없어요.</p>
          <div className="flex gap-2">
            <button type="button" className={btn("outline", "sm")} onClick={() => setConfirmEnd(false)}>
              계속 대화하기
            </button>
            <button type="button" className={`${btn("primary", "sm")} flex-1`} onClick={end}>
              대화 종료
            </button>
          </div>
        </div>
      )}

      <ol className="flex-1 space-y-2 overflow-y-auto py-2" aria-live="polite" aria-label="메시지">
        {chat && (
          <li className="py-1 text-center text-caption text-muted">
            푸랜드가 연결됐어요 · {clock(chat.created_at)}
            <br />
            처음 만날 땐 사람 많은 식당에서, 돈 거래·개인정보 요청은 거절하세요.
          </li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`flex items-end gap-1.5 ${m.mine ? "flex-row-reverse" : ""}`}>
            <p className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap ${m.mine ? "rounded-br-md bg-brand text-on-brand" : "rounded-bl-md bg-surface text-ink ring-1 ring-line"}`}>{m.body}</p>
            <span className="shrink-0 text-[10px] text-muted">{clock(m.created_at)}</span>
          </li>
        ))}
        {ended && (
          <li className="py-2 text-center text-caption font-semibold text-muted">
            {chat!.ended_by_me ? "대화를 종료했어요." : `${chat!.partner.name}님이 대화를 종료했어요.`}
          </li>
        )}
        <li ref={bottom} aria-hidden />
      </ol>

      {login && <LoginPrompt message={login} onClose={() => setLogin(null)} />}
      {notice && (
        <p role="alert" className="text-sm text-diet-no">
          {notice}
        </p>
      )}

      {ended ? (
        <Link href="/community?tab=buddy" className={`${btn("outline")} w-full`}>
          다른 푸랜드 찾기
        </Link>
      ) : (
        <form onSubmit={send} className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] flex gap-2 lg:bottom-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={BUDDY_LIMITS.chat}
            placeholder={chat ? `${chat.partner.name}님에게 메시지` : "연결 중…"}
            disabled={!chat}
            aria-label="메시지"
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-sm text-ink outline-none focus:border-brand"
          />
          <button type="submit" className={`${btn("primary")} shrink-0`} disabled={!text.trim() || sending || !chat} aria-label="보내기">
            <Icon name="send" className="size-5" />
          </button>
        </form>
      )}
    </main>
  );
}
