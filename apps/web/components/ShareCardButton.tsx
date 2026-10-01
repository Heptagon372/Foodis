"use client";
// Passport 공유 카드 만들기 → 미리보기 → 공유(휴대폰) 또는 저장
import { useState } from "react";
import type { Country } from "@/lib/content/types";
import { drawShareCard, shareOrDownload } from "@/lib/client/share-card";

export function ShareCardButton({ explored, countries, foodCount, dna }: { explored: string[]; countries: Country[]; foodCount: number; dna: Record<string, number> }) {
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const byCode = new Map(countries.map((c) => [c.code, c]));
      const blob = await drawShareCard({
        countries: explored.flatMap((code) => (byCode.has(code) ? [{ code, flag: byCode.get(code)!.flag_emoji, name: byCode.get(code)!.name_ko }] : [])),
        foodCount,
        topTags: Object.entries(dna)
          .sort((a, b) => b[1] - a[1])
          .map(([t]) => t),
      });
      if (img) URL.revokeObjectURL(img.url);
      setImg({ url: URL.createObjectURL(blob), blob });
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={make} disabled={busy} className="w-full rounded-2xl border border-ivory/30 bg-ivory/10 py-3 font-semibold text-ivory transition active:scale-[0.98] disabled:opacity-50">
        {busy ? "카드 만드는 중…" : img ? "카드 다시 만들기" : "📤 공유 카드 만들기"}
      </button>
      {img && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 blob 이미지 */}
          <img src={img.url} alt={`나의 Food Passport — ${explored.length}개국 ${foodCount}가지 음식`} className="w-full rounded-2xl shadow-lg" />
          <button type="button" onClick={async () => setMsg((await shareOrDownload(img.blob, explored.length)) === "shared" ? "공유했어요" : "이미지를 저장했어요")} className="w-full rounded-2xl bg-mint-500 py-3 font-semibold text-green-800">
            공유하기 · 저장
          </button>
        </div>
      )}
      {msg && <p className="text-center text-caption text-ivory/80">{msg}</p>}
    </div>
  );
}
