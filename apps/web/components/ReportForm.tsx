"use client";
// 상세 화면 "정보가 틀렸나요?" → /api/reports → 어드민 신고 큐 (F-ADM-03)
import { useState } from "react";
import { Icon } from "./icons";
import { btn, chip } from "./ui";

const FIELDS: [string, string][] = [
  ["diet_vegan", "비건 정보"],
  ["diet_vegetarian", "채식 정보"],
  ["diet_halal", "할랄 정보"],
  ["diet_gluten_free", "글루텐 정보"],
  ["diet_dairy_free", "유제품 정보"],
  ["allergens", "알레르기 정보"],
  ["summary", "설명"],
  ["origin", "나라·기원"],
  ["other", "기타"],
];

export function ReportForm({ foodId }: { foodId: string }) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(FIELDS[0][0]);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [note, setNote] = useState("");

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 text-caption text-muted underline decoration-line underline-offset-2 hover:text-ink-soft">
        <Icon name="warn" className="size-4 shrink-0" />
        정보가 틀렸나요? 신고하기
      </button>
    );
  if (state === "done")
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-lime-soft px-3.5 py-2.5 text-sm text-ink" role="status">
        <Icon name="check-circle" className="mt-px size-[18px] shrink-0 text-leaf" />
        <span className="min-w-0">고마워요! 검수팀이 확인할게요. {note}</span>
      </p>
    );

  return (
    <form
      className="card space-y-3 rounded-3xl p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        const res = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ food_id: foodId, field, message: message || undefined }) }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (res?.ok) {
          setNote(data.preview ? "(미리보기 모드라 실제로 저장되진 않아요)" : "");
          setState("done");
        } else {
          setNote(res?.status === 429 ? "신고가 너무 많아요. 잠시 뒤에 다시 해주세요." : "보내지 못했어요. 잠시 뒤에 다시 해주세요.");
          setState("error");
        }
      }}
    >
      <p className="text-sm font-semibold text-ink">어떤 정보가 틀렸나요?</p>
      <div className="flex flex-wrap gap-2">
        {FIELDS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setField(k)} aria-pressed={field === k} className={chip(field === k)}>
            {field === k && <Icon name="check" className="-ml-1 size-4" />}
            {label}
          </button>
        ))}
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2} placeholder="어디서 확인했는지 알려주면 큰 도움이 돼요 (선택)" aria-label="확인한 곳 (선택)" className="w-full rounded-2xl border border-line bg-sunken px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-leaf/50 focus:ring-2 focus:ring-leaf/25" />
      {state === "error" && (
        <p className="flex items-center gap-1.5 text-caption text-diet-no" role="alert">
          <Icon name="warn" className="size-4 shrink-0" />
          {note}
        </p>
      )}
      <div className="flex gap-2">
        <button disabled={state === "sending"} className={btn("primary", "sm")}>
          {state === "sending" ? "보내는 중…" : "신고 보내기"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn("ghost", "sm")}>
          취소
        </button>
      </div>
    </form>
  );
}
