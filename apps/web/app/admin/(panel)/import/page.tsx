"use client";
// 검수 시트 가져오기 (F-ADM-02): s07 export 로 만든 review_sheet.csv → 미리보기 → 저장 (전부 검수 대기)
import Link from "next/link";
import { useState } from "react";
import { callApi } from "@/components/admin/ui";

type Result = { applied: boolean; total: number; create: number; update: number; skipped: number; errors: number; items: { slug: string; action: string; message?: string }[] };
const ACTION: Record<string, [string, string]> = {
  create: ["새로 추가", "text-diet-ok"],
  update: ["갱신 (검수 대기로)", "text-green-800"],
  skip_verified: ["건너뜀 (검수 완료)", "text-muted"],
  error: ["오류", "text-diet-no"],
};

export default function ImportPage() {
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (apply: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      setRes((await callApi("/api/admin/import", "POST", { csv, apply, overwriteVerified: overwrite })) as Result);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-h2 font-semibold">검수 시트 가져오기</h1>
        <p className="text-sm text-muted">
          FOODIS 콘솔 <b>P → E</b> (s07 검수 시트 만들기)로 생긴 <code>foodis-data/data/draft/review_sheet.csv</code> 를 올리세요. 엑셀에서 고쳐도 돼요. 가져온 음식은 모두 <b>검수 대기</b>로 들어가고,
          식이 값은 사람이 적은 <code>final_*</code> 열만 쓰며 AI 초안(<code>draft_*</code>)은 버려요.
        </p>
      </div>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface px-6 py-8 text-center hover:border-mint-500">
        <span className="text-3xl" aria-hidden>
          📄
        </span>
        <span className="font-semibold">{name || "CSV 파일 선택"}</span>
        <span className="text-caption text-muted">{csv ? `${csv.split(/\r?\n/).length - 1}행` : "review_sheet.csv (UTF-8)"}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setName(file.name);
            setCsv(await file.text());
            setRes(null);
          }}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
        이미 검수 완료된 음식도 덮어쓰기 (덮어쓰면 다시 검수 대기)
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={!csv || busy} onClick={() => run(false)} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-40">
          ① 미리보기
        </button>
        <button type="button" disabled={!res || res.applied || busy || res.create + res.update === 0} onClick={() => run(true)} className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-40">
          ② {res ? `${res.create + res.update}건 저장` : "저장"}
        </button>
        {busy && <span className="self-center text-sm text-muted">처리 중…</span>}
      </div>
      {err && <p className="whitespace-pre-line rounded-xl bg-diet-no/10 px-3 py-2 text-sm text-diet-no">{err}</p>}
      {res && (
        <div className="space-y-3">
          <p className={`rounded-xl px-3 py-2 text-sm ${res.applied ? "bg-mint-100 text-green-800" : "bg-surface"}`}>
            {res.applied ? "저장 완료" : "미리보기"} — 새로 {res.create} · 갱신 {res.update} · 건너뜀 {res.skipped} · 오류 {res.errors}
            {res.applied && (
              <>
                {" · "}
                <Link href="/admin/foods?status=pending" className="underline">
                  검수 대기 목록으로
                </Link>
              </>
            )}
          </p>
          <div className="max-h-96 overflow-y-auto rounded-2xl bg-surface p-2 text-sm shadow-sm">
            {res.items.map((i) => (
              <div key={i.slug + i.action} className="flex gap-3 border-b border-line px-2 py-1.5 last:border-0">
                <span className="w-40 shrink-0 font-mono text-caption">{i.slug}</span>
                <span className={`w-36 shrink-0 text-caption font-semibold ${ACTION[i.action]?.[1]}`}>{ACTION[i.action]?.[0] ?? i.action}</span>
                <span className="text-caption text-muted">{i.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
