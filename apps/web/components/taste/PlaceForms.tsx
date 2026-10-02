"use client";
// 평점 남기기 · 정보 제보 — 둘 다 로그인 필요. 제보는 확인 전까지 내용이 공개되지 않는다.
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "@/lib/client/account";
import { OFFER_LABEL } from "@/lib/places/offers";
import type { ReportKind } from "@/lib/places/types";

type Target = { id: string; name: string; example: boolean };

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; preview?: boolean; message?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, status: 0, message: "연결이 안 돼요. 잠시 뒤 다시 해주세요." };
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, preview: data.preview, message: data?.error?.message };
}

function LoginNeeded({ what }: { what: string }) {
  return (
    <p className="rounded-xl bg-mint-100 px-3 py-2.5 text-sm text-green-800">
      {what}은(는) 로그인한 뒤에 할 수 있어요.{" "}
      <Link href="/login" className="font-semibold underline">
        로그인하기
      </Link>
    </p>
  );
}

export function RateForm({ target, foodSlug, onDone }: { target: Target; foodSlug: string; onDone: () => void }) {
  const account = useAccount();
  const [stars, setStars] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  if (target.example) return <p className="text-sm text-muted">예시 데이터라 평점을 저장하지 않아요.</p>;
  if (account.status !== "user") return <LoginNeeded what="평점 남기기" />;
  if (state === "done") return <p className="rounded-xl bg-mint-100 px-3 py-2 text-sm text-green-800">고마워요! 별 {stars}개를 남겼어요. {note}</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{target.name}, 어땠나요?</p>
      <p className="text-caption text-muted">직접 가서 먹어본 곳만 평가해 주세요. 다시 매기면 이전 점수를 바꿔요.</p>
      <div className="flex gap-1" role="radiogroup" aria-label="별점">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`별 ${n}개`} onClick={() => setStars(n)} className={`text-3xl transition active:scale-90 ${n <= stars ? "text-diet-warn" : "text-line"}`}>
            ★
          </button>
        ))}
      </div>
      {state === "error" && <p className="text-caption text-diet-no">{note}</p>}
      <button
        type="button"
        disabled={!stars || state === "sending"}
        onClick={async () => {
          setState("sending");
          const r = await post(`/api/places/${target.id}/rating`, { stars, food: foodSlug });
          if (r.ok) {
            setNote(r.preview ? "(DB 연결 전이라 실제로 저장되진 않아요)" : "");
            setState("done");
            onDone();
          } else {
            setNote(r.status === 429 ? "너무 자주 보냈어요. 잠시 뒤에 다시 해주세요." : (r.message ?? "저장하지 못했어요."));
            setState("error");
          }
        }}
        className="rounded-full bg-green-800 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-40"
      >
        {state === "sending" ? "보내는 중…" : "평점 남기기"}
      </button>
    </div>
  );
}

const KINDS: ReportKind[] = ["coupon", "event", "group_buy", "takeout", "info"];

export function ReportPlaceForm({ target, onDone }: { target: Target; onDone: () => void }) {
  const account = useAccount();
  const [kind, setKind] = useState<ReportKind>("coupon");
  const [text, setText] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  if (target.example) return <p className="text-sm text-muted">예시 데이터라 제보를 받지 않아요.</p>;
  if (account.status !== "user") return <LoginNeeded what="정보 제보" />;
  if (state === "done") return <p className="rounded-xl bg-mint-100 px-3 py-2 text-sm text-green-800">고마워요! 푸디팀이 확인한 뒤에 보여드릴게요. {note}</p>;
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        const r = await post(`/api/places/${target.id}/report`, { kind, text, ends_on: endsOn || undefined });
        if (r.ok) {
          setNote(r.preview ? "(DB 연결 전이라 실제로 저장되진 않아요)" : "");
          setState("done");
          onDone();
        } else {
          setNote(r.status === 429 ? "제보가 너무 많아요. 잠시 뒤에 다시 해주세요." : (r.message ?? "보내지 못했어요."));
          setState("error");
        }
      }}
    >
      <p className="text-sm font-semibold">{target.name}에 대해 알려주세요</p>
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 text-caption ${kind === k ? "border-green-800 bg-green-800 text-ivory" : "border-line"}`}>
            {k === "takeout" ? "포장" : OFFER_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} required minLength={2} maxLength={300} rows={2} placeholder={kind === "info" ? "예: 폐업했어요 / 이 메뉴는 이제 안 팔아요" : "어디서 봤는지(가게 안내문, 앱 공지 등) 알려주면 확인이 빨라요"} className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
      {(kind === "coupon" || kind === "event") && (
        <label className="flex items-center gap-2 text-caption text-muted">
          언제까지인가요? (알면)
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="rounded-lg border border-line px-2 py-1 text-sm text-charcoal" />
        </label>
      )}
      <p className="text-caption text-muted">제보는 푸디팀이 확인하기 전까지 &lsquo;이용자 제보 · 확인 전&rsquo;으로만 표시돼요.</p>
      {state === "error" && <p className="text-caption text-diet-no">{note}</p>}
      <button disabled={state === "sending"} className="rounded-full bg-green-800 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-50">
        {state === "sending" ? "보내는 중…" : "제보 보내기"}
      </button>
    </form>
  );
}
