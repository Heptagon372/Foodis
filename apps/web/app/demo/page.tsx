"use client";
// 발표자 페이지 (06 문서 §6 데모 리스크 대비): 리허설 체크리스트 + 데모 팩·음성·오프라인 준비 + 마이크가 안 될 때 탭으로 질문.
// 일반 사용자 메뉴에는 없다. 발표 기기에서 /demo 로 직접 연다.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFoodi } from "@/components/FoodiSheet";
import { Wordmark } from "@/components/bits";
import { audioCount, cachedPageCount, isDemoMode, loadPack, precachePages, savePack, setDemoMode, warmAudio } from "@/lib/client/demo";
import { update, useHydrated } from "@/lib/client/passport";
import { canRecord, canWebSpeech } from "@/lib/client/voice";
import type { DemoPack } from "@/lib/demo/pack";

type Health = { ok: boolean; keys: Record<string, boolean>; db: { ok: boolean }; models: Record<string, string> } | null;
type Status = "ok" | "warn" | "bad" | "idle";

export default function DemoPage() {
  return useHydrated() ? <Demo /> : <main className="min-h-dvh" />;
}

function Demo() {
  const { open } = useFoodi();
  const [health, setHealth] = useState<Health>(null);
  const [pack, setPack] = useState<DemoPack | null>(null);
  const [audio, setAudio] = useState(0);
  const [pages, setPages] = useState(0);
  const [sw, setSw] = useState(false);
  const [mic, setMic] = useState<string>("확인 전");
  const [demoOn, setDemoOn] = useState(isDemoMode());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
    const p = await loadPack();
    setPack(p);
    setAudio(p ? await audioCount(p) : 0);
    setPages(await cachedPageCount());
    setSw(Boolean(navigator.serviceWorker?.controller));
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((r) => setMic(r.state === "granted" ? "허용됨" : r.state === "denied" ? "차단됨" : "아직 안 물어봄"))
      .catch(() => setMic("확인 불가"));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(`실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const buildPack = () =>
    run("팩", async () => {
      const res = await fetch("/api/demo/pack", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? res.status);
      await savePack(data as DemoPack);
      return `데모 팩 저장: ${data.items.length}문항 (${data.mode === "live" ? "실제 DB·AI" : "미리보기 샘플"})`;
    });
  const buildAudio = () => run("음성", async () => `음성 ${await warmAudio(pack!, (d) => setBusy(`음성 ${d}/${pack!.items.length}`))}/${pack!.items.length}개 저장`);
  const buildOffline = () => run("오프라인", async () => `화면 ${await precachePages(pack!, (d, t) => setBusy(`화면 ${d}/${t}`))}개 저장`);
  const askMic = () =>
    run("마이크", async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return "마이크 권한 허용됨";
    });
  const resetLocal = () => {
    if (!confirm("이 기기의 탐험 기록·온보딩을 지우고 첫 방문 상태로 돌릴까요? (데모 팩은 남아요)")) return;
    update((s) => ({ ...s, introSeen: false, onboarded: false, diet: [], allergens: [], tastes: [], entries: {} }));
    setMsg("첫 방문 상태로 초기화했어요. 홈으로 가면 인트로부터 시작해요.");
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `foodis-demo-pack-${pack?.built_at.slice(0, 10)}.json` }).click();
    URL.revokeObjectURL(url);
  };

  const isDev = process.env.NODE_ENV !== "production";
  const n = pack?.items.length ?? 0;
  const rows: { label: string; status: Status; detail: string }[] = [
    { label: "서버 · 키", status: !health ? "bad" : health.ok ? "ok" : "warn", detail: !health ? "연결 안 됨 — 데모 팩으로 진행" : Object.entries(health.keys).map(([k, v]) => `${k} ${v ? "✓" : "✕"}`).join(" · ") },
    { label: "데모 팩", status: n >= 10 ? (pack?.mode === "live" ? "ok" : "warn") : n ? "warn" : "bad", detail: pack ? `${n}/10문항 · ${pack.mode === "live" ? "실제 DB·AI" : "미리보기 샘플"} · ${new Date(pack.built_at).toLocaleString("ko-KR")}` : "아직 없음" },
    { label: "미리 만든 음성", status: n && audio >= n ? "ok" : audio ? "warn" : "idle", detail: `${audio}/${n} — 없으면 현장에서 브라우저 음성으로` },
    { label: "오프라인 화면", status: isDev ? "warn" : sw && pages > 5 ? "ok" : pages ? "warn" : "idle", detail: isDev ? "개발 서버에서는 꺼져 있어요 → pnpm build && pnpm start 로 리허설" : `서비스 워커 ${sw ? "작동" : "대기"} · 화면 ${pages}개` },
    { label: "마이크", status: mic === "허용됨" ? "ok" : mic === "차단됨" ? "bad" : "warn", detail: mic },
    { label: "음성 인식", status: canWebSpeech() ? "ok" : canRecord() ? "warn" : "bad", detail: canWebSpeech() ? "브라우저 음성 인식" : canRecord() ? "녹음 → 서버 인식(STT 키 필요)" : "지원 안 함 — 글 입력·아래 질문 버튼" },
  ];

  return (
    <main className="space-y-7 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Wordmark />
        <span className="text-sm font-semibold text-green-800">🎤 발표자 모드</span>
      </header>

      <section className="space-y-2">
        <h1 className="font-display text-h2 font-semibold">리허설 체크리스트</h1>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start gap-3 px-4 py-3">
              <span aria-hidden className="mt-0.5">{{ ok: "🟢", warn: "🟡", bad: "🔴", idle: "⚪" }[r.status]}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{r.label}</p>
                <p className="text-caption text-muted">{r.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Btn onClick={buildPack} disabled={!!busy}>① 데모 팩 만들기</Btn>
        <Btn onClick={buildAudio} disabled={!!busy || !pack}>② 음성 미리 만들기</Btn>
        <Btn onClick={buildOffline} disabled={!!busy || !pack}>③ 오프라인 준비</Btn>
        <Btn onClick={askMic} disabled={!!busy}>④ 마이크 권한</Btn>
      </section>
      {(busy || msg) && <p className="rounded-xl bg-mint-100 px-3 py-2 text-sm text-green-800">{busy ? `${busy} 진행 중…` : msg}</p>}

      <section className="flex items-center justify-between rounded-2xl bg-green-800 px-4 py-4 text-ivory">
        <div>
          <p className="font-semibold">데모 모드</p>
          <p className="text-caption text-ivory/75">켜면 10문항은 저장된 답으로 즉시 (네트워크 0). 그 밖의 질문은 평소처럼</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={demoOn}
          onClick={() => (setDemoMode(!demoOn), setDemoOn(!demoOn))}
          className={`relative h-8 w-14 shrink-0 rounded-full transition ${demoOn ? "bg-mint-500" : "bg-ivory/30"}`}
        >
          <span className={`absolute top-1 size-6 rounded-full bg-ivory transition-all ${demoOn ? "left-7" : "left-1"}`} />
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold">무대용 질문 — 마이크가 안 될 때 탭</h2>
        <ol className="space-y-1.5">
          {(pack?.items ?? []).map((i) => (
            <li key={i.id}>
              {i.context_slug ? (
                <Link href={`/food/${i.context_slug}`} className="block rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
                  <span className="text-caption text-muted">{i.id} · {i.context_slug} 화면에서 🎙 →</span> “{i.text}”
                </Link>
              ) : (
                <button type="button" onClick={() => open({ question: i.text })} className="block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm">
                  <span className="text-caption text-muted">{i.id}</span> “{i.text}”
                </button>
              )}
            </li>
          ))}
          {!pack && <p className="text-sm text-muted">데모 팩을 만들면 여기에 10문항이 나와요.</p>}
        </ol>
      </section>

      <section className="flex flex-wrap gap-2 pb-4 text-sm">
        <Link href="/intro" className="rounded-full border border-line px-3 py-1.5">인트로 다시 보기</Link>
        <button type="button" onClick={resetLocal} className="rounded-full border border-line px-3 py-1.5">첫 방문 상태로 초기화</button>
        {pack && (
          <button type="button" onClick={download} className="rounded-full border border-line px-3 py-1.5">
            팩 JSON 내려받기 (백업)
          </button>
        )}
      </section>
    </main>
  );
}

function Btn({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...p} className="rounded-2xl bg-surface px-3 py-3.5 text-sm font-semibold text-green-800 shadow-sm transition active:scale-[0.98] disabled:opacity-40">
      {children}
    </button>
  );
}
