"use client";
// /demo "지연 측정" 패널 (로드맵 P0: 질문 종료 → 첫 음성 3초). 발표 기기에서 실제 재생 경로의 '첫 소리'까지 잰다.
// 서버 TTS: /api/foodi/tts 요청 → <audio> playing (lib/client/voice.ts speak() 와 같이 MP3 를 다 받은 뒤 재생)
// 브라우저 음성: speechSynthesis.speak → utterance start. 휴대폰에선 이게 fallback 이라 같이 본다.
// 서버 쪽 구간(STT·/ask·합성)은 pnpm bench:voice 가 docs/design/08 문서에 정리한다 — 여기 표는 그 문서 §3 에 붙인다.
import { useState } from "react";
import { BENCH_SENTENCES, FIRST_AUDIO_TARGET_MS } from "@/lib/bench/sentences";
import { fmtMs, markdownTable, summarize } from "@/lib/bench/stats";
import { stopSpeaking } from "@/lib/client/voice";

type Mode = "server" | "browser";
type Row = { id: string; first?: number; headers?: number; received?: number; source?: string; error?: string };

const MODE_LABEL: Record<Mode, string> = { server: "서버 TTS (/api/foodi/tts)", browser: "브라우저 speechSynthesis" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms))]);

async function measureServer(text: string, audio: HTMLAudioElement, listen: boolean): Promise<Row & { fatal?: boolean }> {
  const t0 = performance.now();
  const res = await fetch("/api/foodi/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  const headers = performance.now() - t0;
  // 503 = 서버 TTS 키 없음·전부 실패, 429 = 분당 20회 제한 → 나머지 문장도 같은 결과라 멈춘다
  if (res.status === 503 || res.status === 429)
    return { id: "", error: res.status === 503 ? "서버 TTS 없음 (503) — 앱은 브라우저 음성으로 대체" : "속도 제한 (429) — 1분 뒤 다시", fatal: true };
  if (!res.ok) return { id: "", error: `HTTP ${res.status}` };
  const blob = await res.blob();
  const received = performance.now() - t0;
  const url = URL.createObjectURL(blob);
  try {
    const first = await withTimeout(
      new Promise<number>((resolve, reject) => {
        audio.onplaying = () => resolve(performance.now() - t0);
        audio.onerror = () => reject(new Error("재생 오류"));
        audio.src = url;
        audio.play().catch(reject);
      }),
      15_000,
      "playing 이벤트 없음 (15초)",
    );
    if (listen) await new Promise<void>((r) => (audio.onended = audio.onerror = () => r()));
    else audio.pause();
    return { id: "", first, headers, received, source: res.headers.get("X-TTS-Provider") ?? "?" };
  } finally {
    audio.onplaying = audio.onended = audio.onerror = null;
    URL.revokeObjectURL(url);
  }
}

function measureBrowser(text: string, listen: boolean): Promise<number> {
  const synth = window.speechSynthesis;
  return new Promise((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 1.05; // speak() 와 같은 값
    let first = NaN;
    const timer = setTimeout(() => (synth.cancel(), reject(new Error("start 이벤트 없음 (10초)"))), listen ? 60_000 : 10_000);
    u.onstart = () => {
      first = performance.now() - t0;
      if (listen) return;
      clearTimeout(timer);
      synth.cancel();
      resolve(first);
    };
    u.onend = () => (clearTimeout(timer), resolve(first));
    u.onerror = (e) => (clearTimeout(timer), Number.isNaN(first) ? reject(new Error(e.error)) : resolve(first));
    const t0 = performance.now();
    synth.speak(u);
  });
}

export function VoiceBench() {
  const [rows, setRows] = useState<Partial<Record<Mode, Row[]>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [listen, setListen] = useState(false);
  const [md, setMd] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const run = async (mode: Mode) => {
    stopSpeaking();
    window.speechSynthesis?.cancel();
    setCopied(null);
    setMd(null);
    const out: Row[] = [];
    setRows((r) => ({ ...r, [mode]: out }));
    const audio = new Audio(); // 한 요소를 재사용 — iOS 는 첫 재생 허용을 요소 단위로 기억한다
    try {
      for (const [i, s] of BENCH_SENTENCES.entries()) {
        setBusy(`${MODE_LABEL[mode]} ${i + 1}/${BENCH_SENTENCES.length}`);
        let row: Row & { fatal?: boolean };
        try {
          if (mode === "server") row = await measureServer(s.answer, audio, listen);
          else if (!window.speechSynthesis) row = { id: "", error: "speechSynthesis 지원 안 함", fatal: true };
          else row = { id: "", first: await measureBrowser(s.answer, listen), source: window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("ko"))?.name ?? "기본 음성" };
        } catch (e) {
          row = { id: "", error: (e as Error).message || String(e) };
        }
        out.push({ ...row, id: s.id });
        setRows((r) => ({ ...r, [mode]: [...out] }));
        if (row.fatal) break;
        await sleep(300);
      }
    } finally {
      audio.pause();
      setBusy(null);
    }
  };

  const summaryRows = (Object.keys(MODE_LABEL) as Mode[]).flatMap((m) => {
    const rs = rows[m];
    if (!rs) return [];
    const good = rs.filter((r) => r.first !== undefined && Number.isFinite(r.first));
    const s = summarize(good.map((r) => r.first!));
    const errors = [...new Set(rs.filter((r) => r.error).map((r) => r.error!))];
    return [
      {
        mode: m,
        cells: [
          MODE_LABEL[m],
          `${good.length}/${BENCH_SENTENCES.length}`,
          fmtMs(s.p50),
          fmtMs(s.p95),
          fmtMs(summarize(good.map((r) => r.headers ?? NaN)).p50),
          fmtMs(summarize(good.map((r) => r.received ?? NaN)).p50),
          [...new Set(good.map((r) => r.source))].join(", ") || "—",
        ],
        p95: s.p95,
        errors,
      },
    ];
  });
  const HEAD = ["경로", "측정", "첫 소리 p50", "p95", "응답 헤더 p50", "전체 수신 p50", "음성 · 비고"];

  const toMarkdown = () => {
    const detail = markdownTable(
      ["#", "글자", ...summaryRows.map((r) => MODE_LABEL[r.mode])],
      BENCH_SENTENCES.map((s) => [
        s.id,
        s.answer.length,
        ...summaryRows.map(({ mode }) => {
          const r = rows[mode]?.find((x) => x.id === s.id);
          return !r ? "—" : r.error ? `실패: ${r.error}` : fmtMs(r.first ?? NaN);
        }),
      ]),
    );
    return [
      `#### 기기 측정 — ${new Date().toLocaleString("sv-SE").slice(0, 16)} · ${location.host}`,
      "",
      `- 브라우저: ${navigator.userAgent}`,
      "- 첫 소리 = 요청 시작 → `<audio>` playing / utterance start. 질문 인식(STT)·/ask 시간은 빠져 있다 (서버 측 표와 더해서 본다).",
      "",
      markdownTable(HEAD, summaryRows.map((r) => [...r.cells.slice(0, -1), [r.cells.at(-1), ...r.errors].filter((x) => x && x !== "—").join(" / ") || "—"])),
      "",
      detail,
    ].join("\n");
  };

  const copy = async () => {
    const text = toMarkdown();
    try {
      await navigator.clipboard.writeText(text);
      setCopied("마크다운을 복사했어요. docs/design/08 문서 §3 에 붙여 넣으세요.");
    } catch {
      // http://192.168… 로 연 휴대폰은 보안 컨텍스트가 아니라 클립보드가 막힌다 → 직접 선택해서 복사
      setMd(text);
      setCopied("자동 복사가 막혀 있어요. 아래 글을 길게 눌러 복사하세요.");
    }
  };

  return (
    <section className="space-y-2">
      <h2 className="text-[15px] font-semibold">지연 측정 — 데모 문장 10개 첫 소리까지</h2>
      <p className="text-caption text-muted">
        이 기기에서 실제 재생 경로를 잽니다. 목표: 질문 종료 → 첫 음성 {FIRST_AUDIO_TARGET_MS / 1000}초 (여기 값 + 서버 측 STT·답변 시간). 서버 TTS 는 분당 20회 제한이 있어요.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => run("server")} disabled={!!busy} className="rounded-2xl bg-surface px-3 py-3 text-sm font-semibold text-green-800 shadow-sm disabled:opacity-40">
          서버 TTS 측정
        </button>
        <button type="button" onClick={() => run("browser")} disabled={!!busy} className="rounded-2xl bg-surface px-3 py-3 text-sm font-semibold text-green-800 shadow-sm disabled:opacity-40">
          브라우저 음성 측정
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={listen} onChange={(e) => setListen(e.target.checked)} disabled={!!busy} className="size-4 accent-green-800" />
        끝까지 듣기 (청취 비교 — 꺼 두면 첫 소리만 내고 바로 멈춰요)
      </label>
      {busy && <p className="rounded-xl bg-mint-100 px-3 py-2 text-sm text-green-800">{busy} 측정 중…</p>}

      {summaryRows.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="text-muted">
                <tr>
                  {HEAD.map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summaryRows.map((r) => (
                  <tr key={r.mode}>
                    {r.cells.map((c, i) => (
                      <td key={i} className={`whitespace-nowrap px-3 py-2 ${i === 3 && Number.isFinite(r.p95) ? (r.p95 <= FIRST_AUDIO_TARGET_MS ? "text-green-800" : "font-semibold text-diet-no") : ""} ${i === 0 ? "font-semibold" : ""}`}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summaryRows
            .filter((r) => r.errors.length)
            .map((r) => (
              <p key={r.mode} className="text-caption text-diet-no">
                {MODE_LABEL[r.mode]}: {r.errors.join(" / ")}
              </p>
            ))}
          <button type="button" onClick={copy} disabled={!!busy} className="rounded-full border border-line px-3 py-1.5 text-sm disabled:opacity-40">
            마크다운으로 복사
          </button>
          {copied && <p className="text-caption text-muted">{copied}</p>}
          {md && <textarea readOnly value={md} rows={8} className="w-full rounded-xl border border-line bg-surface p-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />}
        </div>
      )}
    </section>
  );
}
