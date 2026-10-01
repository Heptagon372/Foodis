"use client";
// 상세 화면 "정보가 틀렸나요?" → /api/reports → 어드민 신고 큐 (F-ADM-03)
import { useState } from "react";

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
      <button type="button" onClick={() => setOpen(true)} className="text-caption text-muted underline decoration-line underline-offset-2">
        정보가 틀렸나요? 신고하기
      </button>
    );
  if (state === "done") return <p className="rounded-xl bg-mint-100 px-3 py-2 text-sm text-green-800">고마워요! 검수팀이 확인할게요. {note}</p>;

  return (
    <form
      className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm"
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
      <p className="text-sm font-semibold">어떤 정보가 틀렸나요?</p>
      <div className="flex flex-wrap gap-1.5">
        {FIELDS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setField(k)} className={`rounded-full border px-3 py-1 text-caption ${field === k ? "border-green-800 bg-green-800 text-ivory" : "border-line"}`}>
            {label}
          </button>
        ))}
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2} placeholder="어디서 확인했는지 알려주면 큰 도움이 돼요 (선택)" className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
      {state === "error" && <p className="text-caption text-diet-no">{note}</p>}
      <div className="flex gap-2">
        <button disabled={state === "sending"} className="rounded-full bg-green-800 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-50">
          {state === "sending" ? "보내는 중…" : "신고 보내기"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm text-muted">
          취소
        </button>
      </div>
    </form>
  );
}
