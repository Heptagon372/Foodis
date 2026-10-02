"use client";
// 발표자 페이지 (06 문서 §6 데모 리스크 대비): 리허설 체크리스트 + 데모 팩·음성·오프라인 준비 + 마이크가 안 될 때 탭으로 질문.
// 일반 사용자 메뉴에는 없다. 발표 기기에서 /demo 로 직접 연다.
import { Download, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useFoodi } from "@/components/FoodiSheet";
import { Wordmark } from "@/components/bits";
import { Icon, type IconName } from "@/components/icons";
import { btn } from "@/components/ui";
import { VoiceBench } from "@/components/VoiceBench";
import { audioCount, cachedPageCount, isDemoMode, loadPack, precachePages, savePack, setDemoMode, warmAudio } from "@/lib/client/demo";
import { update, useHydrated } from "@/lib/client/passport";
import { canRecord, canWebSpeech } from "@/lib/client/voice";
import type { DemoPack } from "@/lib/demo/pack";

type Health = { ok: boolean; keys: Record<string, boolean>; db: { ok: boolean }; models: Record<string, string> } | null;
type Status = "ok" | "warn" | "bad" | "idle";

// 상태 = 아이콘 + 글자 + 의미색 (색만으로 말하지 않게)
const STATUS: Record<Status, [IconName, string, string]> = {
  ok: ["check-circle", "준비됨", "bg-diet-ok/12 text-diet-ok"],
  warn: ["warn", "확인 필요", "bg-diet-warn/15 text-diet-warn-ink"],
  bad: ["close", "안 됨", "bg-diet-no/12 text-diet-no"],
  idle: ["help", "아직", "bg-sunken text-muted"],
};

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
  const rows: { label: string; status: Status; detail: ReactNode }[] = [
    {
      label: "서버 · 키",
      status: !health ? "bad" : health.ok ? "ok" : "warn",
      detail: !health ? (
        "연결 안 됨 — 데모 팩으로 진행"
      ) : (
        <span className="flex flex-wrap gap-x-2.5 gap-y-0.5">
          {Object.entries(health.keys).map(([k, v]) => (
            <span key={k} className={`inline-flex items-center gap-0.5 ${v ? "" : "text-diet-no"}`}>
              <Icon name={v ? "check" : "close"} className="size-3.5" strokeWidth={2.25} />
              {k} {v ? "있음" : "없음"}
            </span>
          ))}
        </span>
      ),
    },
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-soft px-3 py-1.5 text-sm font-semibold text-leaf">
          <Icon name="mic" className="size-4" />
          발표자 모드
        </span>
      </header>

      <section className="space-y-2">
        <h1 className="text-h2 font-bold text-ink">리허설 체크리스트</h1>
        <ul className="card divide-y divide-line overflow-hidden rounded-3xl">
          {rows.map((r) => {
            const [icon, label, tone] = STATUS[r.status];
            return (
              <li key={r.label} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{r.label}</p>
                  <div className="text-caption text-ink-soft">{r.detail}</div>
                </div>
                <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold ${tone}`}>
                  <Icon name={icon} className="size-3.5" strokeWidth={2} />
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Btn onClick={buildPack} disabled={!!busy} icon={<Icon name="package" />}>
          ① 데모 팩 만들기
        </Btn>
        <Btn onClick={buildAudio} disabled={!!busy || !pack} icon={<Icon name="volume-on" />}>
          ② 음성 미리 만들기
        </Btn>
        <Btn onClick={buildOffline} disabled={!!busy || !pack} icon={<WifiOff aria-hidden className="size-5" strokeWidth={1.75} />}>
          ③ 오프라인 준비
        </Btn>
        <Btn onClick={askMic} disabled={!!busy} icon={<Icon name="mic" />}>
          ④ 마이크 권한
        </Btn>
      </section>
      {(busy || msg) && (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-lime-soft px-4 py-3 text-sm text-leaf">
          <Icon name={busy ? "replay" : "info"} className={`mt-px size-[18px] shrink-0 ${busy ? "animate-spin-slow" : ""}`} />
          <span>{busy ? `${busy} 진행 중…` : msg}</span>
        </p>
      )}

      {/* 화면의 주인공 면 하나 = 숲 패널 (글자 흰색) */}
      <section className="forest-panel flex items-center justify-between gap-3 rounded-3xl px-5 py-4">
        <div>
          <p className="font-semibold">데모 모드</p>
          <p className="text-caption text-white/75">켜면 10문항은 저장된 답으로 즉시 (네트워크 0). 그 밖의 질문은 평소처럼</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-caption font-semibold" aria-hidden>
            {demoOn ? "켜짐" : "꺼짐"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={demoOn}
            aria-label="데모 모드"
            onClick={() => (setDemoMode(!demoOn), setDemoOn(!demoOn))}
            className={`relative h-10 w-[68px] shrink-0 rounded-full border transition ${demoOn ? "border-lime bg-lime" : "border-white/25 bg-white/15"}`}
          >
            <span className={`absolute top-1 grid size-8 place-items-center rounded-full bg-white text-forest shadow-soft transition-all ${demoOn ? "left-[30px]" : "left-1"}`}>
              {demoOn && <Icon name="check" className="size-4" strokeWidth={2.25} />}
            </span>
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-title font-bold text-ink">무대용 질문 — 마이크가 안 될 때 탭</h2>
        <ol className="space-y-1.5">
          {(pack?.items ?? []).map((i) => (
            <li key={i.id}>
              {i.context_slug ? (
                <Link href={`/food/${i.context_slug}`} className={QUESTION}>
                  <span className="inline-flex items-center gap-1 text-caption text-muted">
                    {i.id} · {i.context_slug} 화면에서 <Icon name="mic" className="size-3.5" /> 마이크로
                    <Icon name="next" className="size-3.5" />
                  </span>{" "}
                  “{i.text}”
                </Link>
              ) : (
                <button type="button" onClick={() => open({ question: i.text })} className={`${QUESTION} w-full text-left`}>
                  <span className="text-caption text-muted">{i.id}</span> “{i.text}”
                </button>
              )}
            </li>
          ))}
          {!pack && <li className="text-sm text-muted">데모 팩을 만들면 여기에 10문항이 나와요.</li>}
        </ol>
      </section>

      <VoiceBench />

      <section className="flex flex-wrap gap-2 pb-4 text-sm">
        <Link href="/intro" className={btn("outline", "sm")}>
          <Icon name="replay" className="size-4" />
          인트로 다시 보기
        </Link>
        <button type="button" onClick={resetLocal} className={btn("outline", "sm")}>
          첫 방문 상태로 초기화
        </button>
        {pack && (
          <button type="button" onClick={download} className={btn("outline", "sm")}>
            <Download aria-hidden className="size-4" strokeWidth={1.75} />
            팩 JSON 내려받기 (백업)
          </button>
        )}
      </section>
    </main>
  );
}

const QUESTION = "card block rounded-2xl px-4 py-3 text-sm text-ink transition hover:border-leaf/40";

function Btn({ children, icon, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode }) {
  return (
    <button type="button" {...p} className="card flex min-h-14 items-center gap-2 break-keep rounded-2xl px-3 py-3 text-left text-sm font-semibold text-ink transition active:scale-[0.98] disabled:opacity-40">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lime-soft text-leaf">{icon}</span>
      {children}
    </button>
  );
}
