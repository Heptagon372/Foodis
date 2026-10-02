"use client";
// S8 My Table (F-REC-04, 07 문서 "탐험한 음식이 가상 식탁 일러스트에 쌓이는 화면").
// 위에서 내려다본 원목 식탁 + 리넨 러너 위에 접시를 한상차림처럼 엇갈려 놓는다. 배치는 lib/table/my-table.ts (테스트로 겹침 검사).
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Country } from "@/lib/content/types";
import { exploredCountries, useHydrated, useLocal, type PassportStatus } from "@/lib/client/passport";
import { drawTableCard } from "@/lib/client/table-card";
import { shareOrDownload } from "@/lib/client/share-card";
import { CONTINENT_COLOR, CONTINENT_LABEL, setTable, tableLayout, toTableCountry, type TableCountry, type TableFood, type TablePlate } from "@/lib/table/my-table";
import { useFoodi } from "./FoodiSheet";
import { ImageCredit } from "./ImageCredit";
import { PreviewBanner } from "./bits";
import { MicIcon } from "./VoiceButton";

const BADGE: Partial<Record<PassportStatus, string>> = { liked: "❤️", tried: "📕", saved: "🔖" };
const STATUS_TEXT: Record<PassportStatus, string> = { explored: "탐험", tried: "먹어봤어요", liked: "좋아요", saved: "저장" };
const STATUS_LABEL = (s: PassportStatus) => (BADGE[s] ? `${BADGE[s]} ${STATUS_TEXT[s]}` : STATUS_TEXT[s]);

// 식탁 재질: 이미지 없이 그라데이션으로 (원목 결 + 리넨 짜임)
const WOOD: CSSProperties = {
  backgroundColor: "#b17847",
  backgroundImage: [
    "repeating-linear-gradient(90deg, rgb(70 35 10 / 0.07) 0 1px, transparent 1px 11px)",
    "repeating-linear-gradient(90deg, rgb(255 240 220 / 0.06) 0 2px, transparent 2px 29px)",
    "linear-gradient(90deg, #a8703f, #ba804b 28%, #ad7442 52%, #c08851 78%, #a56d3d)",
  ].join(","),
  boxShadow: "0 22px 40px -24px rgb(70 40 15 / 0.7)",
};
const LINEN: CSSProperties = {
  backgroundColor: "#efe6d2",
  backgroundImage: "repeating-linear-gradient(0deg, rgb(120 95 60 / 0.06) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgb(120 95 60 / 0.05) 0 1px, transparent 1px 4px)",
};
const EDGE: CSSProperties = { boxShadow: "inset 0 0 0 5px rgb(80 45 20 / 0.28), inset 0 12px 30px -12px rgb(40 20 5 / 0.4)" };

// 화면 식탁 좌표계: 100 × 130 (세로로 긴 식탁), 가장자리 6 은 비워 둔다 → 접시는 88 × 118 안에
const TW = 100;
const TH = 130;
const PAD = 6;

export function MyTableView({ foods, countries, preview }: { foods: TableFood[]; countries: TableCountry[]; preview: boolean }) {
  const { open } = useFoodi();
  const hydrated = useHydrated();
  const entries = useLocal((s) => s.entries);
  const nCountries = useLocal(exploredCountries).length;
  const { plates, hidden } = useMemo(() => setTable(entries, foods, countries), [entries, foods, countries]);
  const total = plates.length + hidden;
  const [selId, setSelId] = useState<string | null>(null);
  const cur = plates.find((p) => p.id === selId) ?? null;

  useEffect(() => {
    if (!selId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selId]);

  // 오늘의 한 상: 코스 정보가 기록에 없어 대륙별로 묶는다 (접시 테두리 색과 같은 색)
  const legend = Object.keys(CONTINENT_LABEL)
    .map((k) => ({ key: k, n: plates.filter((p) => p.continent === k).length }))
    .filter((c) => c.n);
  const counts = (["liked", "tried", "saved"] as const).map((s) => ({ s, n: plates.filter((p) => p.statuses.includes(s)).length })).filter((c) => c.n);
  const empty = hydrated && total === 0;

  return (
    <main className="space-y-6 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Link href="/passport" className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
          ← Passport
        </Link>
        <span className="text-sm font-semibold text-green-800">🍽️ My Table</span>
      </header>
      {preview && <PreviewBanner />}

      <div className="space-y-1.5">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted">My Table</p>
        {/* 하이드레이션 전에는 저장된 기록을 모른다 → 빈 식탁 문구가 깜빡이지 않게 중립 문구 */}
        <h1 className="font-display text-h1 font-semibold text-balance">
          {!hydrated ? "식탁을 차리는 중…" : empty ? "아직 빈 식탁이에요" : `${nCountries}개국 · ${total}개 음식이 차려졌어요`}
        </h1>
        <p className="text-sm text-charcoal/70">{empty ? "푸디에게 물어보면 첫 접시가 놓여요." : "처음 탐험한 음식부터 차례로 놓였어요. 접시를 눌러 보세요."}</p>
      </div>

      <TableTop plates={hydrated ? plates : []} ghosts={empty} selId={selId} onSelect={(id) => setSelId((s) => (s === id ? null : id))} />

      {empty && (
        <button type="button" onClick={() => open({ listen: true })} className="flex w-full items-center justify-center gap-2 rounded-full bg-mint-500 py-4 font-semibold text-green-800 transition active:scale-[0.98]">
          <MicIcon className="size-5" /> 푸디에게 첫 음식 추천받기
        </button>
      )}

      {cur ? (
        <PlateCard key={cur.id} p={cur} onClose={() => setSelId(null)} />
      ) : (
        hydrated && total > 0 && <p className="text-center text-caption text-muted">접시를 누르면 어떤 음식인지 볼 수 있어요</p>
      )}

      {legend.length > 0 && (
        <section className="space-y-2.5 rounded-3xl bg-surface p-4 shadow-sm">
          <h2 className="text-[15px] font-semibold tracking-tight text-charcoal/90">오늘의 한 상</h2>
          <div className="flex flex-wrap gap-2">
            {legend.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: CONTINENT_COLOR[c.key] }} aria-hidden />
                {CONTINENT_LABEL[c.key]}
                <b className="tabular-nums text-green-800">{c.n}</b>
              </span>
            ))}
          </div>
          {counts.length > 0 && (
            <p className="text-sm text-charcoal/80">
              {counts.map((c) => `${STATUS_LABEL(c.s)} ${c.n}`).join(" · ")}
            </p>
          )}
          <p className="text-caption text-muted">
            접시 테두리 색은 대륙, 안쪽 색은 나라예요.
            {plates.some((p) => p.image) && " 사진 출처는 접시를 누르면 볼 수 있어요."}
            {hidden > 0 && ` 식탁이 꽉 차서 최근 ${plates.length}개만 올렸어요 (+${hidden}).`}
          </p>
        </section>
      )}

      {hydrated && total > 0 && <TableCardButton plates={plates} countries={nCountries} foods={total} />}
    </main>
  );
}

function TableTop({ plates, ghosts, selId, onSelect }: { plates: TablePlate[]; ghosts: boolean; selId: string | null; onSelect: (id: string) => void }) {
  const { r, plates: pos } = useMemo(() => tableLayout(ghosts ? 3 : plates.length, TW - PAD * 2, TH - PAD * 2), [ghosts, plates.length]);
  const box = (i: number): CSSProperties => ({
    left: `${PAD + pos[i].x - r}%`,
    top: `${((PAD + pos[i].y - r) / TH) * 100}%`,
    width: `${2 * r}%`,
  });
  // 최근 5개 접시만 차례로 내려놓는다 (나머지는 함께) — 전체가 0.5초 안에 끝나게
  const delay = (i: number) => Math.max(0, i - (plates.length - 5)) * 40;
  return (
    <div className="relative aspect-[100/130] w-full overflow-hidden rounded-[2rem]" style={WOOD} role="group" aria-label={ghosts ? "빈 식탁" : `식탁 위 음식 ${plates.length}개`}>
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-[34%] -translate-x-1/2" style={LINEN}>
        <span className="absolute inset-y-0 inset-x-[5%] border-x-2 border-dashed border-[#d6c6a6]" />
      </span>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[2rem]" style={EDGE} />
      {ghosts
        ? pos.map((_, i) => <span key={i} aria-hidden className="absolute aspect-square rounded-full border-2 border-dashed border-ivory/70 bg-ivory/10" style={box(i)} />)
        : plates.map((p, i) => {
            const on = p.id === selId;
            const badges = p.statuses.filter((s) => BADGE[s]);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                aria-pressed={on}
                aria-label={[p.name, p.country, ...badges.map((s) => STATUS_TEXT[s])].filter(Boolean).join(" · ")}
                className={`@container plate-set absolute aspect-square rounded-full transition-[scale] active:scale-95 ${on ? "z-10 ring-[3px] ring-mint-500 ring-offset-2 ring-offset-[#b17847]" : ""}`}
                style={{ ...box(i), animationDelay: `${delay(i)}ms` }}
              >
                <PlateFace p={p} />
              </button>
            );
          })}
    </div>
  );
}

/** 접시 한 장: 흰 테두리 · 대륙 색 띠 · 안쪽(사진 또는 국가색 + 음식 모양) · 국기 · 상태 배지. 크기는 부모(@container) 기준 */
function PlateFace({ p, photo = true, badges = true }: { p: TablePlate; photo?: boolean; badges?: boolean }) {
  const band = p.continent ? CONTINENT_COLOR[p.continent] : undefined;
  const img = photo ? p.image : null;
  const marks = badges ? p.statuses.filter((s) => BADGE[s]) : [];
  return (
    <>
      <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 34% 28%, #fff 0%, #f6f1e7 62%, #e2d9c8 100%)", boxShadow: "0 4px 9px -3px rgb(60 35 15 / 0.55), inset 0 -1px 2px rgb(120 90 50 / 0.2)" }} />
      {band && <span aria-hidden className="absolute inset-[8%] rounded-full" style={{ boxShadow: `inset 0 0 0 max(1.5px, 2.5cqw) ${band}` }} />}
      <span
        aria-hidden
        className="absolute inset-[15%] grid place-items-center overflow-hidden rounded-full shadow-[inset_0_2px_6px_rgb(0_0_0/0.22)]"
        style={img ? { backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: `${p.accent}55` } : { background: `radial-gradient(circle at 38% 32%, ${p.accent}99, ${p.accent} 78%)` }}
      >
        {!img && <span className="text-[32cqw] leading-none drop-shadow-sm">{p.glyph}</span>}
      </span>
      <span aria-hidden className="absolute -bottom-[3%] -left-[3%] text-[max(12px,26cqw)] leading-none drop-shadow">
        {p.flag}
      </span>
      {marks.length > 0 && (
        <span aria-hidden className="absolute -right-[5%] -top-[5%] flex">
          {marks.map((s) => (
            <span key={s} className="grid size-[max(16px,26cqw)] place-items-center rounded-full bg-surface text-[max(9px,15cqw)] leading-none shadow-sm">
              {BADGE[s]}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

function PlateCard({ p, onClose }: { p: TablePlate; onClose: () => void }) {
  return (
    <div className="animate-rise space-y-2 rounded-3xl bg-surface p-3 shadow-[0_1px_0_#0000000a,0_12px_28px_-16px_#00000055]">
      <div className="flex items-center gap-3">
        <span className="@container relative aspect-square w-16 shrink-0">
          <PlateFace p={p} badges={false} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-semibold">{p.name}</p>
          <p className="text-caption text-muted">
            <span aria-hidden>{p.flag}</span> {p.country || "나라 정보 없음"}
          </p>
          <p className="flex flex-wrap gap-1">
            {p.statuses.map((s) => (
              <span key={s} className="rounded-full bg-mint-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                {STATUS_LABEL(s)}
              </span>
            ))}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="self-start rounded-full px-2 py-1 text-muted hover:bg-line/60">
          ✕
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ImageCredit credit={p.image ? p.credit : null} className="bg-charcoal/60" />
        <Link href={`/food/${p.slug}`} className="ml-auto whitespace-nowrap rounded-full bg-green-800 px-3.5 py-2 text-sm font-semibold text-ivory transition active:scale-95">
          음식 이야기 보기 →
        </Link>
      </div>
    </div>
  );
}

/** 식탁 이미지 만들기 → 미리보기 → 공유(휴대폰) 또는 저장. 공유 시트는 사용자 탭 직후에만 열리므로 두 단계 (ShareCardButton 과 같다) */
function TableCardButton({ plates, countries, foods }: { plates: TablePlate[]; countries: number; foods: number }) {
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const blob = await drawTableCard({ plates, countries, foods });
      if (img) URL.revokeObjectURL(img.url);
      setImg({ url: URL.createObjectURL(blob), blob });
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    const r = await shareOrDownload(img!.blob, countries, { name: `foodis-table-${foods}.png`, title: "나의 식탁 — FOODIS", text: `${countries}개국 ${foods}개 음식이 차려진 나의 식탁 — FOODIS` });
    setMsg(r === "shared" ? "공유했어요" : "이미지를 저장했어요");
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={make} disabled={busy} className="w-full rounded-2xl border border-line bg-surface py-3 font-semibold text-green-800 transition active:scale-[0.98] disabled:opacity-50">
        {busy ? "식탁 그리는 중…" : img ? "이미지 다시 만들기" : "🖼 식탁 이미지로 저장"}
      </button>
      {img && (
        <div className="animate-rise space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 blob 이미지 */}
          <img src={img.url} alt={`나의 식탁 — ${countries}개국 ${foods}개 음식`} className="w-full rounded-2xl shadow-lg" />
          <button type="button" onClick={share} className="w-full rounded-2xl bg-mint-500 py-3 font-semibold text-green-800">
            공유하기 · 저장
          </button>
        </div>
      )}
      {msg && <p className="text-center text-caption text-muted">{msg}</p>}
    </div>
  );
}

/** Passport 안 미리보기 카드: 최근 접시 6장 + 식탁 보기 링크 (사진 없이 국가색 접시만 — 가볍게) */
export function MyTablePreview({ countries }: { countries: Country[] }) {
  const entries = useLocal((s) => s.entries);
  const tc = useMemo(() => countries.map(toTableCountry), [countries]);
  const { plates, hidden } = useMemo(() => setTable(entries, [], tc), [entries, tc]);
  const total = plates.length + hidden;
  const shown = plates.slice(-6);
  return (
    <Link href="/passport/table" className="block overflow-hidden rounded-3xl bg-surface shadow-sm transition active:scale-[0.99]">
      <div className="relative flex h-24 items-center justify-center gap-[3%] px-4" style={WOOD}>
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-[52%] -translate-y-1/2" style={LINEN} />
        <span aria-hidden className="pointer-events-none absolute inset-0" style={EDGE} />
        {shown.length
          ? shown.map((p) => (
              <span key={p.id} className="@container relative aspect-square w-[13%] max-w-14 shrink-0">
                <PlateFace p={p} photo={false} badges={false} />
              </span>
            ))
          : [0, 1, 2].map((i) => <span key={i} aria-hidden className="relative aspect-square w-[13%] max-w-14 rounded-full border-2 border-dashed border-ivory/70" />)}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-charcoal/80">{total ? <><b className="text-green-800">{total}개 음식</b>이 식탁에 올라 있어요</> : "첫 접시를 기다리는 식탁이에요"}</p>
        <span className="shrink-0 text-sm font-semibold text-green-800">식탁 보기 →</span>
      </div>
    </Link>
  );
}
