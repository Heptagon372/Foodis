"use client";
// S8 My Table (F-REC-04, 07 문서 "탐험한 음식이 가상 식탁 일러스트에 쌓이는 화면").
// 위에서 내려다본 원목 식탁 + 리넨 러너 위에 접시를 한상차림처럼 엇갈려 놓는다. 배치는 lib/table/my-table.ts (테스트로 겹침 검사).
// 식탁 일러스트는 콘텐츠라 고유 색을 쓰고, 둘레(머리·범례·버튼·카드)는 v2 토큰만 — 다크에서는 식탁만 살짝 어둡게.
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Country } from "@/lib/content/types";
import { exploredCountries, useHydrated, useLocal, type PassportStatus } from "@/lib/client/passport";
import { drawTableCard } from "@/lib/client/table-card";
import { shareOrDownload } from "@/lib/client/share-card";
import { CONTINENT_COLOR, CONTINENT_LABEL, MAX_PLATES, setTable, tableLayout, toTableCountry, type TableCountry, type TableFood, type TablePlate } from "@/lib/table/my-table";
import { useFoodi } from "./FoodiSheet";
import { ImageCredit } from "./ImageCredit";
import { PreviewBanner } from "./bits";
import { Icon, type IconName } from "./icons";
import { TopBar } from "./TopBar";
import { Eyebrow, IconButton, btn } from "./ui";

// 접시 위 상태 표시 (흰 원 + 라인 아이콘). 탐험은 모든 접시의 기본 상태라 표시하지 않는다
const MARK: Partial<Record<PassportStatus, { icon: IconName; tone: string }>> = {
  liked: { icon: "heart", tone: "text-brand" },
  tried: { icon: "stamp", tone: "text-brand" },
  saved: { icon: "bookmark", tone: "text-ink" },
};
const STATUS_TEXT: Record<PassportStatus, string> = { explored: "탐험", tried: "먹어봤어요", liked: "좋아요", saved: "저장" };
const STATUS_ICON: Record<PassportStatus, IconName> = { explored: "compass", tried: "stamp", liked: "heart", saved: "bookmark" };

// 식탁 재질: 이미지 없이 그라데이션으로 (원목 결 + 리넨 짜임) — 일러스트 고유 색
const WOOD: CSSProperties = {
  backgroundColor: "#b17847",
  backgroundImage: [
    "repeating-linear-gradient(90deg, rgb(70 35 10 / 0.07) 0 1px, transparent 1px 11px)",
    "repeating-linear-gradient(90deg, rgb(255 240 220 / 0.06) 0 2px, transparent 2px 29px)",
    "linear-gradient(90deg, #a8703f, #ba804b 28%, #ad7442 52%, #c08851 78%, #a56d3d)",
  ].join(","),
  boxShadow: "0 22px 40px -24px rgb(40 60 30 / 0.55)",
};
const LINEN: CSSProperties = {
  backgroundColor: "#f1ecdd",
  backgroundImage: "repeating-linear-gradient(0deg, rgb(120 95 60 / 0.06) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgb(120 95 60 / 0.05) 0 1px, transparent 1px 4px)",
};
const EDGE: CSSProperties = { boxShadow: "inset 0 0 0 5px rgb(80 45 20 / 0.26), inset 0 12px 30px -12px rgb(40 20 5 / 0.38)" };
// 흰 자기 접시 (옅은 초록 기운) — 일러스트 고유 색이라 테마와 무관
const PLATE: CSSProperties = { background: "radial-gradient(circle at 34% 28%, #fff 0%, #f3f6ef 62%, #dce3d6 100%)", boxShadow: "0 4px 9px -3px rgb(40 35 15 / 0.5), inset 0 -1px 2px rgb(80 100 70 / 0.2)" };
// 다크 테마: 일러스트(원목·접시)가 어두운 화면에서 튀지 않게 살짝 낮춘다
const DIM = "dark:brightness-[0.84] dark:saturate-[0.92]";

// 화면 식탁 좌표계: 100 × 130 (세로로 긴 식탁), 가장자리 6 은 비워 둔다 → 접시는 88 × 118 안에
const TW = 100;
const TH = 130;
const PAD = 6;

export function MyTableView({ countries, preview }: { countries: TableCountry[]; preview: boolean }) {
  const { open } = useFoodi();
  const hydrated = useHydrated();
  const entries = useLocal((s) => s.entries);
  const nCountries = useLocal(exploredCountries).length;
  // 사진·국가색 조회표: 식탁에 올라갈 최근 MAX_PLATES 개 기록만 서버에서 받아 온다 (id 와 slug 둘 다 — 미리보기 ↔ 실DB 로 id 가 바뀐 기록도 찾게)
  const keys = useMemo(() => {
    const recent = Object.entries(entries).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_PLATES);
    return [...new Set(recent.flatMap(([id, e]) => [id, e.slug]))].sort().join(",");
  }, [entries]);
  const [foods, setFoods] = useState<TableFood[] | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (!keys) return setFoods([]);
    const ctrl = new AbortController();
    fetch(`/api/foods/table?keys=${encodeURIComponent(keys)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<TableFood[]>) : []))
      .then(setFoods)
      .catch(() => {
        // 조회에 실패해도 식탁은 차린다 (사진 없이 아이콘 접시)
        if (!ctrl.signal.aborted) setFoods([]);
      });
    return () => ctrl.abort();
  }, [hydrated, keys]);
  // 기록을 읽고 조회표까지 받은 뒤에 접시를 놓는다 (사진 없는 접시가 먼저 깜빡이지 않게)
  const ready = hydrated && foods !== null;
  const { plates, hidden } = useMemo(() => setTable(entries, foods ?? [], countries), [entries, foods, countries]);
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
  const empty = ready && total === 0;

  return (
    <main className="space-y-6 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:mx-auto lg:max-w-4xl lg:pt-8">
      <TopBar back={{ href: "/passport", label: "Passport" }} />
      {preview && <PreviewBanner />}

      <div className="space-y-2">
        <Eyebrow>My Table</Eyebrow>
        {/* 하이드레이션 전에는 저장된 기록을 모른다 → 빈 식탁 문구가 깜빡이지 않게 중립 문구 */}
        <h1 className="text-h1 font-bold text-balance text-ink">
          {!ready ? "식탁을 차리는 중…" : empty ? "아직 빈 식탁이에요" : (
            <>
              <span className="text-leaf">{nCountries}개국 · {total}개</span> 음식이 차려졌어요
            </>
          )}
        </h1>
        <p className="text-sm text-ink-soft">{empty ? "푸디에게 물어보면 첫 접시가 놓여요." : "처음 탐험한 음식부터 차례로 놓였어요. 접시를 눌러 보세요."}</p>
      </div>

      <TableTop plates={ready ? plates : []} ghosts={empty} selId={selId} onSelect={(id) => setSelId((s) => (s === id ? null : id))} />

      {empty && (
        <button type="button" onClick={() => open({ listen: true })} className={`${btn("lime", "md")} w-full`}>
          <Icon name="mic" className="size-5" /> 푸디에게 첫 음식 추천받기
        </button>
      )}

      {cur ? (
        <PlateCard key={cur.id} p={cur} onClose={() => setSelId(null)} />
      ) : (
        ready &&
        total > 0 && (
          <p className="flex items-center justify-center gap-1.5 text-center text-caption text-muted">
            <Icon name="info" className="size-4 shrink-0" />
            접시를 누르면 어떤 음식인지 볼 수 있어요
          </p>
        )
      )}

      {legend.length > 0 && (
        <section className="card space-y-3 rounded-3xl p-5">
          <h2 className="text-title font-bold text-ink">오늘의 한 상</h2>
          <div className="flex flex-wrap gap-2">
            {legend.map((c) => (
              <span key={c.key} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-sunken/60 px-3 text-sm text-ink-soft">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: CONTINENT_COLOR[c.key] }} aria-hidden />
                {CONTINENT_LABEL[c.key]}
                <b className="tabular-nums text-leaf">{c.n}</b>
              </span>
            ))}
          </div>
          {counts.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
              {counts.map((c) => (
                <span key={c.s} className="inline-flex items-center gap-1">
                  <Icon name={STATUS_ICON[c.s]} className="size-4 text-leaf" />
                  {STATUS_TEXT[c.s]} <b className="tabular-nums text-ink">{c.n}</b>
                </span>
              ))}
            </p>
          )}
          <p className="text-caption text-muted">
            접시 테두리 색은 대륙, 안쪽 색은 나라예요.
            {plates.some((p) => p.image) && " 사진 출처는 접시를 누르면 볼 수 있어요."}
            {hidden > 0 && ` 식탁이 꽉 차서 최근 ${plates.length}개만 올렸어요 (+${hidden}).`}
          </p>
        </section>
      )}

      {ready && total > 0 && <TableCardButton plates={plates} countries={nCountries} foods={total} />}
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
    <div className={`relative aspect-[100/130] w-full overflow-hidden rounded-[28px] ${DIM}`} style={WOOD} role="group" aria-label={ghosts ? "빈 식탁" : `식탁 위 음식 ${plates.length}개`}>
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-[34%] -translate-x-1/2" style={LINEN}>
        <span className="absolute inset-y-0 inset-x-[5%] border-x-2 border-dashed border-[#d8cdb0]" />
      </span>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[28px]" style={EDGE} />
      {ghosts
        ? pos.map((_, i) => <span key={i} aria-hidden className="absolute aspect-square rounded-full border-2 border-dashed border-white/70 bg-white/10" style={box(i)} />)
        : plates.map((p, i) => {
            const on = p.id === selId;
            const badges = p.statuses.filter((s) => MARK[s]);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                aria-pressed={on}
                aria-label={[p.name, p.country, ...badges.map((s) => STATUS_TEXT[s])].filter(Boolean).join(" · ")}
                className={`@container plate-set absolute aspect-square rounded-full transition-[scale] active:scale-95 ${on ? "z-10 ring-[3px] ring-lime ring-offset-2 ring-offset-[#b17847]" : ""}`}
                style={{ ...box(i), animationDelay: `${delay(i)}ms` }}
              >
                <PlateFace p={p} />
              </button>
            );
          })}
    </div>
  );
}

/** 접시 한 장: 흰 테두리 · 대륙 색 띠 · 안쪽(사진 또는 국가색 + 흰 음식 모양) · 국기 · 상태 표시. 크기는 부모(@container) 기준 */
function PlateFace({ p, photo = true, badges = true }: { p: TablePlate; photo?: boolean; badges?: boolean }) {
  const band = p.continent ? CONTINENT_COLOR[p.continent] : undefined;
  const img = photo ? p.image : null;
  const marks = badges ? p.statuses.filter((s) => MARK[s]) : [];
  return (
    <>
      <span aria-hidden className="absolute inset-0 rounded-full" style={PLATE} />
      {band && <span aria-hidden className="absolute inset-[8%] rounded-full" style={{ boxShadow: `inset 0 0 0 max(1.5px, 2.5cqw) ${band}` }} />}
      <span
        aria-hidden
        className="absolute inset-[15%] grid place-items-center overflow-hidden rounded-full shadow-[inset_0_2px_6px_rgb(11_26_16/0.22)]"
        style={img ? { backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: `${p.accent}55` } : { background: `radial-gradient(circle at 38% 32%, ${p.accent}99, ${p.accent} 78%)` }}
      >
        {/* 사진이 없으면 음식 모양 라인 아이콘 (밝은 국가색에서도 보이게 옅은 그늘) */}
        {!img && <Icon name={p.icon} strokeWidth={2} className="size-[44cqw] text-white drop-shadow-[0_1px_1.5px_rgb(11_26_16/0.45)]" />}
      </span>
      {p.flag ? (
        <span aria-hidden className="absolute -bottom-[3%] -left-[3%] text-[max(12px,26cqw)] leading-none drop-shadow">
          {p.flag}
        </span>
      ) : (
        <span aria-hidden className="absolute -bottom-[3%] -left-[3%] grid size-[max(16px,26cqw)] place-items-center rounded-full bg-surface text-muted shadow-sm">
          <Icon name="pin" className="size-[62%]" />
        </span>
      )}
      {marks.length > 0 && (
        <span aria-hidden className="absolute -right-[5%] -top-[5%] flex">
          {marks.map((s) => (
            <span key={s} className={`grid size-[max(16px,26cqw)] place-items-center rounded-full bg-surface shadow-sm ${MARK[s]!.tone}`}>
              <Icon name={MARK[s]!.icon} strokeWidth={2.25} className="size-[62%]" />
            </span>
          ))}
        </span>
      )}
    </>
  );
}

function PlateCard({ p, onClose }: { p: TablePlate; onClose: () => void }) {
  return (
    <div className="card animate-rise space-y-3 rounded-3xl p-4">
      <div className="flex items-center gap-3">
        <span className={`@container relative aspect-square w-16 shrink-0 ${DIM}`}>
          <PlateFace p={p} badges={false} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-title font-bold text-ink">{p.name}</p>
          <p className="flex items-center gap-1 text-caption text-ink-soft">
            {p.flag ? <span aria-hidden>{p.flag}</span> : <Icon name="pin" className="size-3.5 text-muted" />} {p.country || "나라 정보 없음"}
          </p>
          <p className="flex flex-wrap gap-1">
            {p.statuses.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-lime-soft px-2 py-0.5 text-[11px] font-semibold text-leaf">
                <Icon name={STATUS_ICON[s]} className="size-3" strokeWidth={2} />
                {STATUS_TEXT[s]}
              </span>
            ))}
          </p>
        </div>
        <IconButton icon="close" label="닫기" onClick={onClose} variant="ghost" className="-mr-1 -mt-1 self-start" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <ImageCredit credit={p.image ? p.credit : null} />
        <Link href={`/food/${p.slug}`} className={`${btn("primary", "sm")} ml-auto whitespace-nowrap`}>
          음식 이야기 보기
          <Icon name="next" className="-mr-1 size-4" />
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
      <button type="button" onClick={make} disabled={busy} className={`${btn("outline", "md")} w-full`}>
        <Icon name={img && !busy ? "replay" : "image"} className={`size-5 text-leaf ${busy ? "animate-pulse" : ""}`} />
        {busy ? "식탁 그리는 중…" : img ? "이미지 다시 만들기" : "식탁 이미지로 저장"}
      </button>
      {img && (
        <div className="animate-rise space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 blob 이미지 */}
          <img src={img.url} alt={`나의 식탁 — ${countries}개국 ${foods}개 음식`} className="w-full rounded-3xl border border-line shadow-lift" />
          <button type="button" onClick={share} className={`${btn("primary", "md")} w-full`}>
            <Icon name="share" className="size-5" />
            공유하기 · 저장
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className="text-center text-caption text-muted">
          {msg}
        </p>
      )}
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
    <Link href="/passport/table" className="card block overflow-hidden rounded-3xl transition active:scale-[0.99]">
      <div className={`relative flex h-24 items-center justify-center gap-[3%] px-4 ${DIM}`} style={WOOD}>
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-[52%] -translate-y-1/2" style={LINEN} />
        <span aria-hidden className="pointer-events-none absolute inset-0" style={EDGE} />
        {shown.length
          ? shown.map((p) => (
              <span key={p.id} className="@container relative aspect-square w-[13%] max-w-14 shrink-0">
                <PlateFace p={p} photo={false} badges={false} />
              </span>
            ))
          : [0, 1, 2].map((i) => <span key={i} aria-hidden className="relative aspect-square w-[13%] max-w-14 rounded-full border-2 border-dashed border-white/70 bg-white/10" />)}
      </div>
      <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Icon name="table" className="size-[18px] shrink-0 text-leaf" />
          {total ? (
            <span>
              <b className="text-ink">{total}개 음식</b>이 식탁에 올라 있어요
            </span>
          ) : (
            "첫 접시를 기다리는 식탁이에요"
          )}
        </p>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-leaf">
          식탁 보기
          <Icon name="next" className="size-4" />
        </span>
      </div>
    </Link>
  );
}
