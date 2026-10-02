/**
 * 음성 지연 측정 · TTS 후보 비교 (로드맵 P0 "질문 종료 → 음성 응답 시작 3초 이내", P1 "Chirp 3 HD vs gpt-4o-mini-tts")
 *
 * 실행:  pnpm --filter web bench:voice            (apps/web 에서는 pnpm bench:voice)
 *        pnpm --filter web bench:voice -- --live-db   Supabase 실제 DB 로 /ask 파이프라인 측정 (대화·사용량 행이 기록됨)
 *
 * - 환경변수: Next 와 같은 규칙(@next/env)으로 apps/web/.env*.local 을 읽는다. 키 값은 출력하지 않고 "있음/없음"만 적는다.
 * - 키가 없는 제공자는 아예 호출하지 않고 "키 없음 — 건너뜀" 행으로 남긴다 → 키가 하나도 없어도 끝까지 돌고 문서를 쓴다.
 * - 결과: 표를 출력하고 docs/design/08_음성_지연_측정.md 의 자동 생성 구역(<!-- bench:start --> ~ end)만 갈아 끼운다.
 *   문서의 청취 메모·결정 칸은 다시 돌려도 보존된다.
 * - 오디오: apps/web/bench-out/<후보>-<번호>.mp3 (gitignore) — 같은 문장을 후보별로 들어 보는 청취 비교용.
 *
 * "server-only" 처리: lib/* 는 import "server-only" 를 한다. 이 패키지는 exports 조건 "react-server" 에서 빈 모듈을 주므로
 *   package.json 스크립트가 `tsx --conditions=react-server` 로 실행한다 (Next 서버 번들과 같은 조건 → 별도 로더·별칭이 필요 없다).
 *   tsx 는 tsconfig 의 "@/…" 경로도 그대로 푼다. lib/env.ts 가 import 시점에 process.env 를 읽으므로, 환경변수를 먼저 읽고 동적 import 한다.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { BENCH_SENTENCES, FIRST_AUDIO_TARGET_MS } from "@/lib/bench/sentences";
import { charErrorRate, fmtMs, markdownTable, mp3DurationSec, summarize } from "@/lib/bench/stats";
import type { TTSProvider, Usage } from "@/lib/providers/types";
import type { FoodisRepo } from "@/lib/foodi/repo";
import { isWav, readWavHeader } from "@/lib/voice/wav";

// ── 가격 (USD). 2026-10 확인 필요 — 목록가 기준, 월 무료 구간은 빼고 계산한다
// Google Cloud TTS: https://cloud.google.com/text-to-speech/pricing  (WaveNet·Standard 월 400만 자, Neural2·Chirp 3 HD 월 100만 자 무료)
const GOOGLE_PER_1M_CHARS: [RegExp, number][] = [
  [/Chirp3-HD/i, 30],
  [/Studio/i, 160],
  [/Neural2|Polyglot/i, 16],
  [/Wavenet|Standard/i, 4],
];
// OpenAI: https://platform.openai.com/docs/pricing  gpt-4o-mini-tts ≈ $0.015/분 (텍스트 $0.60/1M 토큰 + 오디오 $12/1M 토큰 환산)
const OPENAI_TTS_PER_MIN = 0.015;
// STT: lib/providers/openai.ts 주석 기준 분당 $0.0045 (gpt-transcribe) — 같은 페이지에서 확인
const OPENAI_STT_PER_MIN = 0.0045;

const LIVE_DB = process.argv.includes("--live-db");
const WEB_DIR = process.cwd();
const OUT_DIR = path.join(WEB_DIR, "bench-out");
const DOC = path.resolve(WEB_DIR, "../../docs/design/08_음성_지연_측정.md");
const now = () => performance.now();

/** 오류 메시지에 키 조각이 섞여 나오는 경우(OpenAI 401 "Incorrect API key provided: sk-…")를 가린다 */
const hideKeys = (m: string) => m.replace(/sk-[\w*-]+/g, "sk-***").replace(/AIza[\w-]+/g, "AIza***");
const redact = (m: string) => hideKeys(m).replace(/\s+/g, " ").slice(0, 120);

type Sample = { id: string; chars: number; ttfb: number; total: number; bytes: number; sec: number; file: string } | { id: string; error: string };
type Candidate = { key: string; label: string; voice: string; skip?: string; make?: () => TTSProvider; usdFor?: (chars: number, sec: number) => number; samples: Sample[] };
const ok = (s: Sample): s is Extract<Sample, { ttfb: number }> => "ttfb" in s;

async function readAll(stream: ReadableStream<Uint8Array>, t0: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let ttfb = NaN;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (Number.isNaN(ttfb)) ttfb = now() - t0;
    chunks.push(value);
  }
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) bytes.set(c, (o += c.length) - c.length);
  return { bytes, ttfb, total: now() - t0 };
}

/**
 * 합성 1회: 첫 바이트(앱은 받는 대로 재생 → 이때 소리가 난다) · 전체 수신(다 받은 뒤 재생하던 이전 방식·미리 받은 라디오 구간).
 * /api/foodi/tts 와 같은 경로: 흘려보낼 수 있는 제공자(OpenAI)는 stream, 아니면(Google) synthesize — 그래서 Google 은 첫 바이트 ≈ 전체.
 */
async function synth(tts: TTSProvider, text: string, voice: string) {
  const t0 = now();
  const audio = tts.stream ? (await tts.stream(text, { voice })).stream : (await tts.synthesize(text, { voice })).audio;
  return readAll(audio, t0);
}

async function main() {
  loadEnvConfig(WEB_DIR, true, { info: () => {}, error: (...a: unknown[]) => console.error(...a) });
  const has = {
    openai: Boolean(process.env.OPENAI_API_KEY),
    google: Boolean(process.env.GOOGLE_TTS_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  let lib;
  try {
    lib = {
      ...(await import("@/lib/env")),
      ...(await import("@/lib/providers/google-tts")),
      ...(await import("@/lib/providers/openai")),
      ...(await import("@/lib/content")),
      ...(await import("@/lib/foodi/deps")),
      ...(await import("@/lib/foodi/orchestrator")),
      ...(await import("@/lib/foodi/eval/cases")),
      ...(await import("@/lib/preview/foods")),
      ...(await import("@/lib/preview/source")),
    };
  } catch (e) {
    if (String(e).includes("server-only") || String(e).includes("Client Component"))
      console.error('lib/* 가 "server-only" 를 import 합니다. `tsx --conditions=react-server scripts/bench-voice.ts` 로 실행하세요 (pnpm bench:voice).');
    throw e;
  }
  const { env, isLive, googleTTS, openaiTTS, openaiSTT, getOrchestratorDeps, ask, EVAL_CASES, PREVIEW_FOODS, previewId, previewRepo } = lib;
  mkdirSync(OUT_DIR, { recursive: true });
  const log = (s: string) => console.log(`  ${s}`);
  console.log(`\n음성 지연 측정 — 키: ${Object.entries(has).map(([k, v]) => `${k} ${v ? "있음" : "없음"}`).join(" · ")}\n`);

  // ── 1. TTS 후보 정하기. Google 음성은 추측하지 않고 listVoices 로 실제 있는지 확인
  const googleUsd = (voice: string) => (chars: number) => (chars * (GOOGLE_PER_1M_CHARS.find(([re]) => re.test(voice))?.[1] ?? NaN)) / 1e6;
  const candidates: Candidate[] = [];
  const chirpWanted = process.env.BENCH_GOOGLE_CHIRP_VOICE || "ko-KR-Chirp3-HD-Aoede";
  if (!has.google) {
    candidates.push({ key: "google-default", label: "Google 현재 기본", voice: env.googleTtsVoice, skip: "키 없음 — 건너뜀", samples: [] });
    candidates.push({ key: "google-chirp3hd", label: "Google Chirp 3 HD", voice: chirpWanted, skip: "키 없음 — 건너뜀", samples: [] });
  } else {
    let names: string[] = [];
    let listErr = "";
    try {
      const { TextToSpeechClient } = await import("@google-cloud/text-to-speech");
      const client = new TextToSpeechClient(env.googleTtsCredentials ? { credentials: JSON.parse(env.googleTtsCredentials) } : {});
      const [res] = await client.listVoices({ languageCode: "ko-KR" });
      names = (res.voices ?? []).map((v) => v.name ?? "").filter(Boolean);
      log(`Google ko-KR 음성 ${names.length}개 (Chirp 3 HD ${names.filter((n) => /Chirp3-HD/i.test(n)).length}개)`);
    } catch (e) {
      listErr = redact((e as Error).message);
    }
    const chirp = names.includes(chirpWanted) ? chirpWanted : names.find((n) => /Chirp3-HD/i.test(n));
    const add = (key: string, label: string, voice: string | undefined, missing: string) =>
      candidates.push({
        key, label, voice: voice ?? "—",
        skip: listErr ? `음성 목록 실패: ${listErr}` : !voice || !names.includes(voice) ? missing : undefined,
        make: googleTTS, usdFor: googleUsd(voice ?? ""), samples: [],
      });
    add("google-default", "Google 현재 기본", env.googleTtsVoice, "음성 목록에 없음 — 건너뜀");
    if (chirp !== env.googleTtsVoice) add("google-chirp3hd", "Google Chirp 3 HD", chirp, "ko-KR Chirp 3 HD 음성 없음 — 건너뜀");
  }
  candidates.push({
    key: "openai-mini-tts", label: "OpenAI gpt-4o-mini-tts", voice: env.openaiTtsVoice,
    skip: has.openai ? undefined : "키 없음 — 건너뜀",
    make: openaiTTS, usdFor: (_c, sec) => (sec / 60) * OPENAI_TTS_PER_MIN, samples: [],
  });
  candidates.push(...(await catalogTtsCandidates()));

  // ── 2. TTS 측정: 후보마다 워밍업 1회(콜드 스타트·TLS 제외) 후 데모 문장 10개를 순서대로
  for (const c of candidates) {
    if (c.skip || !c.make) {
      log(`TTS ${c.label}: ${c.skip}`);
      continue;
    }
    const tts = c.make();
    try {
      await synth(tts, "안녕하세요, 푸디예요.", c.voice);
    } catch (e) {
      c.skip = `실패: ${redact((e as Error).message)}`;
      log(`TTS ${c.label}: ${c.skip}`);
      continue;
    }
    for (const [i, s] of BENCH_SENTENCES.entries()) {
      try {
        const r = await synth(tts, s.answer, c.voice);
        const wav = isWav(r.bytes); // Gemini 는 WAV
        const file = `${c.key}-${String(i + 1).padStart(2, "0")}.${wav ? "wav" : "mp3"}`;
        writeFileSync(path.join(OUT_DIR, file), r.bytes);
        c.samples.push({ id: s.id, chars: s.answer.length, ttfb: r.ttfb, total: r.total, bytes: r.bytes.length, sec: wav ? (readWavHeader(r.bytes)?.seconds ?? 0) : mp3DurationSec(r.bytes), file });
      } catch (e) {
        c.samples.push({ id: s.id, error: redact((e as Error).message) });
      }
    }
    log(`TTS ${c.label} (${c.voice}): ${c.samples.filter(ok).length}/10`);
  }
  const measured = candidates.filter((c) => c.samples.some(ok));

  // ── 3. /ask 의존성: 기본은 미리보기 데이터(메모리). 캐시는 끄고(데모 첫 질문 기준) 사용량은 가로채 비용을 센다
  const base = await getOrchestratorDeps();
  const dbLive = LIVE_DB && (await isLive());
  if (LIVE_DB && !dbLive) log("--live-db: Supabase 가 live 가 아니어서 미리보기 데이터로 잽니다");
  const repo0: FoodisRepo = dbLive ? base.repo : previewRepo();
  const usages: Usage[] = [];
  const repo: FoodisRepo = {
    ...repo0,
    cacheGet: async () => null,
    cacheSet: async () => {},
    recordUsage: async (u, conv) => {
      usages.push(...u);
      if (dbLive) await repo0.recordUsage(u, conv);
    },
  };
  const deps = { ...base, repo, dailyBudgetUsd: Math.max(base.dailyBudgetUsd, 999) };
  const names = await repo.allFoodNames();

  // ── 4. STT: 질문을 TTS 로 만들어 다시 받아 적기 (종단 간 추정용 지연) + 답변 음성 받아 적기 (외국 음식명 인식 → CER)
  const previewNames = names.map((f) => f.name_ko); // stt 라우트와 같은 키워드 힌트
  type SttRow = { label: string; skip?: string; lat: number[]; cer: number[]; sec: number; perId: Map<string, { lat: number; cer: number }> };
  const sttRows: SttRow[] = [
    { label: "질문 10개 (종단 간 추정에 사용)", lat: [], cer: [], sec: 0, perId: new Map() },
    { label: "답변 10개 (외국 음식명 인식)", lat: [], cer: [], sec: 0, perId: new Map() },
  ];
  const sttSource = measured[0];
  if (!has.openai) for (const r of sttRows) r.skip = "OPENAI_API_KEY 없음 — 건너뜀";
  else if (!sttSource) for (const r of sttRows) r.skip = "받아 적을 TTS 음성 없음 — 건너뜀";
  else {
    const stt = openaiSTT();
    const tts = sttSource.make!();
    const transcribe = async (row: SttRow, id: string, bytes: Uint8Array, ref: string) => {
      const t0 = now();
      const { text } = await stt.transcribe(new Blob([bytes as BlobPart], { type: "audio/mpeg" }), { lang: "ko", keywords: previewNames });
      const lat = now() - t0;
      const cer = charErrorRate(ref, text);
      row.lat.push(lat);
      row.cer.push(cer);
      row.sec += mp3DurationSec(bytes) || 0;
      row.perId.set(id, { lat, cer });
    };
    try {
      await transcribe({ ...sttRows[0], lat: [], cer: [], perId: new Map() }, "warmup", (await synth(tts, "안녕하세요.", sttSource.voice)).bytes, "안녕하세요");
    } catch (e) {
      for (const r of sttRows) r.skip = `실패: ${redact((e as Error).message)}`;
    }
    if (!sttRows[0].skip) {
      for (const [i, s] of BENCH_SENTENCES.entries()) {
        try {
          const q = await synth(tts, s.question, sttSource.voice);
          writeFileSync(path.join(OUT_DIR, `question-${String(i + 1).padStart(2, "0")}.mp3`), q.bytes);
          await transcribe(sttRows[0], s.id, q.bytes, s.question);
          const a = sttSource.samples[i];
          if (a && ok(a)) await transcribe(sttRows[1], s.id, readFileSync(path.join(OUT_DIR, a.file)), s.answer);
        } catch (e) {
          log(`STT ${s.id} 실패: ${redact((e as Error).message)}`);
        }
      }
      log(`STT: 질문 ${sttRows[0].lat.length}/10 · 답변 ${sttRows[1].lat.length}/10 (원본 음성: ${sttSource.label})`);
    }
  }

  // ── 5. /ask 파이프라인: 데모 필수 10문항(D01~D10)을 실제 ask() 로
  const idOf = (slug: string) => {
    const f = PREVIEW_FOODS.find((x) => x.slug === slug);
    if (!f) return undefined;
    // 실제 DB 는 id 가 달라 이름으로 찾는다
    return dbLive ? names.find((n) => n.name_ko === f.name_ko)?.id : previewId(f.n);
  };
  const demoCases = EVAL_CASES.filter((c) => c.category === "demo");
  const askOnce = (c: (typeof demoCases)[number]) =>
    ask(
      deps,
      {
        text: c.text,
        input_mode: "voice",
        context_food_id: c.context ? idOf(c.context) : undefined,
        guest: c.guest
          ? { diet: c.guest.diet ?? [], allergens: c.guest.allergens ?? [], explored_countries: c.guest.explored_countries ?? [], explored_foods: (c.guest.explored_foods ?? []).flatMap((s) => idOf(s) ?? []) }
          : undefined,
      },
      null,
    );
  await askOnce(demoCases[0]).catch(() => null); // 워밍업 (모듈 초기화·첫 연결)
  usages.length = 0;
  const askLat = new Map<string, number>();
  const speechLen: number[] = [];
  let askFail = 0;
  for (const c of demoCases) {
    const t0 = now();
    try {
      const r = await askOnce(c);
      askLat.set(c.id, now() - t0);
      speechLen.push(r.speech.length);
    } catch (e) {
      askFail++;
      log(`/ask ${c.id} 실패: ${redact((e as Error).message)}`);
    }
  }
  const usingLLM = has.anthropic;
  const pathLabel = `${usingLLM ? `LLM (${env.llmModelFast} 의도 + ${env.llmModelSmart} 답변)` : "템플릿 — LLM 키 없음"} · ${dbLive ? "실제 DB" : "미리보기 데이터"}`;
  log(`/ask: ${askLat.size}/10 (${pathLabel})`);

  // ── 6. 표 만들기
  const S = (xs: number[]) => summarize(xs);
  const usd = (n: number) => (n === 0 ? "$0" : Number.isFinite(n) ? `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}` : "—");
  const date = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);

  const ttsTable = markdownTable(
    ["후보", "음성", "상태", "첫 바이트 p50", "p95", "전체 합성 p50", "p95", "평균 길이", "말 속도", "평균 크기", "10문장 비용", "1,000답변 비용"],
    candidates.map((c) => {
      const g = c.samples.filter(ok);
      if (!g.length) return [c.label, c.voice, c.skip ?? "전부 실패", "—", "—", "—", "—", "—", "—", "—", "—", "—"];
      const chars = g.reduce((n, s) => n + s.chars, 0);
      const sec = g.reduce((n, s) => n + (s.sec || 0), 0);
      const cost = c.usdFor ? c.usdFor(chars, sec) : NaN;
      const fails = c.samples.length - g.length;
      return [
        c.label, c.voice, fails ? `${g.length}/10 (실패 ${fails})` : "측정 10/10",
        fmtMs(S(g.map((s) => s.ttfb)).p50), fmtMs(S(g.map((s) => s.ttfb)).p95),
        fmtMs(S(g.map((s) => s.total)).p50), fmtMs(S(g.map((s) => s.total)).p95),
        sec ? `${(sec / g.length).toFixed(1)}초` : "—", sec ? `${(chars / sec).toFixed(1)}자/초` : "—",
        `${Math.round(g.reduce((n, s) => n + s.bytes, 0) / g.length / 1024)}KB`,
        usd(cost), usd((cost / g.length) * 1000),
      ];
    }),
  );

  const perSentence = markdownTable(
    ["#", "글자", ...measured.map((c) => `${c.label} 첫 바이트 / 전체`), ...(sttRows[1].lat.length ? ["답변 STT CER"] : [])],
    BENCH_SENTENCES.map((s, i) => [
      s.id,
      s.answer.length,
      ...measured.map((c) => {
        const x = c.samples[i];
        return !x ? "—" : ok(x) ? `${fmtMs(x.ttfb)} / ${fmtMs(x.total)} (\`${x.file}\`)` : `실패: ${x.error}`;
      }),
      ...(sttRows[1].lat.length ? [sttRows[1].perId.get(s.id) ? `${(sttRows[1].perId.get(s.id)!.cer * 100).toFixed(1)}%` : "—"] : []),
    ]),
  );

  const sttTable = markdownTable(
    ["대상", "모델", "상태", "지연 p50", "p95", "CER 평균", "CER 최대", "비용"],
    sttRows.map((r) =>
      r.skip || !r.lat.length
        ? [r.label, env.sttModel, r.skip ?? "측정 0건", "—", "—", "—", "—", "—"]
        : [
            r.label, env.sttModel, `측정 ${r.lat.length}/10`, fmtMs(S(r.lat).p50), fmtMs(S(r.lat).p95),
            `${(S(r.cer).mean * 100).toFixed(1)}%`, `${(S(r.cer).max * 100).toFixed(1)}%`, usd((r.sec / 60) * OPENAI_STT_PER_MIN),
          ],
    ),
  );

  const askS = S([...askLat.values()]);
  const llmUsd = usages.reduce((n, u) => n + u.costUsd, 0);
  const askTable = markdownTable(
    ["경로", "측정", "p50", "p95", "최대", "답 평균 글자", "질문당 AI 비용"],
    [[pathLabel, `${askS.n}/10${askFail ? ` (실패 ${askFail})` : ""}`, fmtMs(askS.p50), fmtMs(askS.p95), fmtMs(askS.max), speechLen.length ? `${Math.round(S(speechLen).mean)}자` : "—", askS.n ? usd(llmUsd / askS.n) : "—"]],
  );

  // 종단 간: 같은 번호(D01~D10)끼리 STT(질문) + /ask + TTS 를 더한다. 클라이언트↔서버 왕복·디코딩은 빠져 있다 → /demo 패널로 기기에서 잰다
  const sttQ = sttRows[0].perId;
  const sttLabel = sttQ.size ? `${env.sttModel} 실측` : "제외 (Web Speech: 기기 내 인식 가정)";
  const verdict = (p95: number) => (!Number.isFinite(p95) ? "—" : p95 <= FIRST_AUDIO_TARGET_MS ? "✅ 통과" : "❌ 초과");
  const e2eRows: (string | number)[][] = measured.map((c) => {
    const stream: number[] = [];
    const full: number[] = [];
    BENCH_SENTENCES.forEach((s, i) => {
      const t = c.samples[i];
      const a = askLat.get(s.id);
      if (!t || !ok(t) || a === undefined) return;
      const stt = sttQ.get(s.id)?.lat ?? 0;
      stream.push(stt + a + t.ttfb);
      full.push(stt + a + t.total);
    });
    return [`${c.label} (${c.voice})`, sttLabel, fmtMs(S(stream).p50), fmtMs(S(stream).p95), fmtMs(S(full).p50), fmtMs(S(full).p95), verdict(S(stream).p95)];
  });
  e2eRows.push(["브라우저 speechSynthesis (서버 TTS 없음)", "제외 (Web Speech 가정)", `${fmtMs(askS.p50)} + 음성 시작`, `${fmtMs(askS.p95)} + 음성 시작`, "—", "—", "기기에서 측정 (/demo)"]);
  for (const c of candidates.filter((x) => !measured.includes(x))) e2eRows.push([`${c.label} (${c.voice})`, sttLabel, "—", "—", "—", "—", c.skip ?? "측정 없음"]);
  const e2eTable = markdownTable(["조합", "STT", "첫 음성 p50 (받는 대로 재생 — 현재 앱)", "p95", "첫 음성 p50 (다 받은 뒤 재생 — 이전 방식)", "p95", `목표 p95 ≤ ${FIRST_AUDIO_TARGET_MS / 1000}초 (현재 앱)`], e2eRows);

  const keysLine = Object.entries({ OPENAI_API_KEY: has.openai, "GOOGLE_TTS_CREDENTIALS_JSON·GOOGLE_APPLICATION_CREDENTIALS": has.google, ANTHROPIC_API_KEY: has.anthropic, "Supabase 서비스 키": has.supabase })
    .map(([k, v]) => `${k} ${v ? "있음" : "없음"}`)
    .join(" · ");

  const block = [
    `### 측정 환경 (${date} KST)`,
    "",
    `- 명령: \`pnpm --filter web bench:voice${LIVE_DB ? " -- --live-db" : ""}\` (apps/web/scripts/bench-voice.ts)`,
    `- 기기: ${os.type()} ${os.release()} · ${os.cpus()[0]?.model.trim() ?? "CPU ?"} · Node ${process.version}`,
    `- 키: ${keysLine}`,
    `- 설정: TTS_PROVIDER=${env.ttsProvider} · GOOGLE_TTS_VOICE=${env.googleTtsVoice} · OPENAI_TTS_VOICE=${env.openaiTtsVoice} · STT_MODEL=${env.sttModel} · LLM ${env.llmModelFast} / ${env.llmModelSmart} (effort ${env.llmSmartEffort})`,
    "- 표본: 후보마다 워밍업 1회 뒤 데모 문장 10개를 1회씩, 순서대로. 10개 표본의 p95 는 사실상 최대값에 가깝다.",
    "",
    "### TTS 후보 비교 (데모 답변 10문장)",
    "",
    ttsTable,
    "",
    "- 첫 바이트 = 합성 요청 → 오디오 첫 조각 도착 (/api/foodi/tts 와 같은 경로: OpenAI 는 `stream()`, Google 은 `synthesize()`). Google `synthesizeSpeech` 는 한 번에 돌려줘서 첫 바이트 ≈ 전체 합성이다 (`streamingSynthesize` 를 안 쓰는 이유는 §6).",
    "- 비용은 목록가 기준(무료 구간 제외). OpenAI 는 재생 길이 × 분당 단가 추정. 가격 상수는 스크립트 상단 — 2026-10 확인 필요.",
    "",
    "<details><summary>문장별 상세 · 청취용 파일 (apps/web/bench-out/)</summary>",
    "",
    perSentence,
    "",
    "</details>",
    "",
    "### STT (TTS 음성을 다시 받아 적기)",
    "",
    sttTable,
    "",
    "- CER = 글자 편집 거리 ÷ 원문 글자 수 (공백·문장부호 무시). 음식명 키워드 힌트(미리보기 음식명)를 넣은 실제 앱과 같은 호출.",
    "- 합성 음성은 실제 사람 목소리·소음보다 쉽다 → CER 은 하한선으로 본다. 실제 발화는 /demo 마이크로 따로 확인.",
    "",
    "### Foodi /ask 파이프라인 (데모 필수 D01~D10, 캐시 끔)",
    "",
    askTable,
    "",
    "### 종단 간 추정: 질문 종료 → 첫 음성",
    "",
    e2eTable,
    "",
    "- 같은 번호끼리 STT(질문) + /ask + TTS 를 더한 서버 측 합. 기기↔서버 왕복·오디오 디코딩·브라우저 재생 시작은 빠져 있다 → `/demo` 의 \"지연 측정\" 패널로 발표 기기에서 따로 잰다.",
    "- \"받는 대로 재생\" = 현재 앱 (lib/client/stream-audio.ts — `speak()`·라디오가 MediaSource 에 첫 조각부터 붙여 재생, 서버 첫 바이트 기준). \"다 받은 뒤 재생\" = 이전 방식 · MediaSource 미지원 브라우저 · 미리 받은 라디오 구간.",
  ].join("\n");

  console.log(`\n${block}\n`);
  writeDoc(block);
  console.log(`\n→ ${path.relative(path.resolve(WEB_DIR, "../.."), DOC)} 갱신 · 오디오 ${path.relative(WEB_DIR, OUT_DIR)}/`);
}

const START = "<!-- bench:start -->";
const END = "<!-- bench:end -->";

/** 자동 생성 구역만 교체. 사람이 쓴 청취 메모·결정은 그대로 둔다 */
/**
 * 목소리 카탈로그의 다른 제공자 (docs/design/11_목소리_카탈로그.md) — 키가 없으면 "키 없음 — 건너뜀" 행만 남는다.
 * 환경변수를 읽은 뒤(main 안에서) 불러야 한다: lib/env.ts 가 import 시점에 process.env 를 읽는다.
 * MP3 제공자를 앞에 둔다 — STT 측정은 measured[0] 의 음성을 audio/mpeg 로 보낸다 (Gemini 는 WAV).
 */
async function catalogTtsCandidates(): Promise<Candidate[]> {
  const [{ elevenlabsTTS }, { clovaTTS }, { geminiTTS }, { ttsCostUsd }] = await Promise.all([
    import("@/lib/providers/elevenlabs-tts"),
    import("@/lib/providers/clova-tts"),
    import("@/lib/providers/gemini-tts"),
    import("@/lib/voice/pricing"),
  ]);
  const skip = (...keys: string[]) => (keys.every((k) => process.env[k]) ? undefined : "키 없음 — 건너뜀");
  const geminiModel = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
  return [
    { key: "elevenlabs-flash", label: "ElevenLabs Flash v2.5", voice: "Talia", skip: skip("ELEVENLABS_API_KEY"), make: () => elevenlabsTTS(), usdFor: (c) => ttsCostUsd("elevenlabs", "eleven_flash_v2_5", c), samples: [] },
    { key: "clova-premium", label: "NAVER CLOVA Voice Premium", voice: "vara", skip: skip("CLOVA_VOICE_KEY_ID", "CLOVA_VOICE_KEY"), make: () => clovaTTS(), usdFor: (c) => ttsCostUsd("clova", "vara", c), samples: [] },
    { key: "gemini-tts", label: `Gemini TTS (${geminiModel})`, voice: "Sulafat", skip: skip("GEMINI_API_KEY"), make: () => geminiTTS(), usdFor: (c) => ttsCostUsd("gemini", geminiModel, c), samples: [] },
  ];
}

function writeDoc(block: string) {
  const auto = `${START}\n<!-- 이 구역은 pnpm --filter web bench:voice 가 덮어쓴다. 직접 고치지 말 것 -->\n\n${block}\n\n${END}`;
  const cur = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  const next = cur.includes(START) && cur.includes(END) ? cur.slice(0, cur.indexOf(START)) + auto + cur.slice(cur.indexOf(END) + END.length) : template(auto);
  writeFileSync(DOC, next);
}

function template(auto: string) {
  const listen = markdownTable(
    ["#", "글자", "Google 현재 기본", "Google Chirp 3 HD", "OpenAI gpt-4o-mini-tts", "메모 (외국 음식명 발음 · 억양 · 끊김)"],
    BENCH_SENTENCES.map((s) => [s.id, s.answer.length, "", "", "", ""]),
  );
  return `# 08. 음성 지연 측정 · TTS 후보 비교

> 로드맵 P0 "STT / TTS 기술 선정 및 지연시간 측정 — 목표: 질문 종료 → 음성 응답 시작 3초 이내"
> 로드맵 P1 "TTS 후보 비교 (Google Chirp 3 HD 한국어 vs OpenAI gpt-4o-mini-tts) — 데모 문장 10개 첫 음성 시간·청취 비교표"
> 관련: 03 문서 §3(데모 10문장)·§4(3초 목표), 09 문서 §5(외부 API 후보), 11 문서 §6(TTS fallback 체인)

## 1. 측정 방법

| 구간 | 도구 | 재는 것 |
|---|---|---|
| 서버 (TTS·STT·/ask) | \`pnpm --filter web bench:voice\` → 이 문서 §2 자동 갱신 | TTS 첫 바이트·전체 합성, STT 지연·CER, /ask 파이프라인 지연, 종단 간 합 |
| 발표 기기 (실제 경로) | \`/demo\` → "지연 측정" 패널 → 표 복사 → §3 에 붙여넣기 | \`/api/foodi/tts\` 요청 → \`<audio>\` playing, 브라우저 speechSynthesis → utterance start |

- 문장: \`lib/bench/sentences.ts\` — 03 문서 §3 의 푸디 답변 예시 10개 (60~200자, 외국 음식명 포함). 서버·기기 측정이 같은 문장을 쓴다.
- 키가 없는 제공자는 호출하지 않고 "키 없음 — 건너뜀" 으로 남는다. 키를 \`apps/web/.env.local\` 에 넣고 다시 돌리면 같은 표가 채워진다.
- Chirp 3 HD 음성은 \`listVoices(ko-KR)\` 로 실제 목록을 확인한 뒤 고른다 (기본 \`ko-KR-Chirp3-HD-Aoede\`, \`BENCH_GOOGLE_CHIRP_VOICE\` 로 바꿀 수 있음).
- 청취용 MP3 는 \`apps/web/bench-out/\` 에 저장된다 (git 에 올리지 않음).

## 2. 서버 측 측정 결과 (자동 생성)

${auto}

## 3. 발표 기기 측정 (/demo "지연 측정" 패널 붙여넣기)

> 기기·브라우저·네트워크마다 한 번씩. 패널의 "마크다운 복사" 결과를 그대로 아래에 붙인다.

(아직 없음)

## 4. 청취 비교 (사람이 채움)

> bench-out/ 의 같은 번호 파일을 이어서 듣고 1~5점. 5 = 사람 같음, 3 = 기계 같지만 거슬리지 않음, 1 = 알아듣기 어려움.

${listen}

## 5. 결정 (측정 후 작성)

| 기준 | 목표 | Google 현재 기본 | Google Chirp 3 HD | OpenAI gpt-4o-mini-tts |
|---|---|---|---|---|
| 첫 음성 p95 (종단 간, 기기 측정) | ≤ 3초 | | | |
| 한국어 자연스러움 (§4 평균) | ≥ 4.0 | | | |
| 외국 음식명 발음 (힌칼리·살테냐·피에로기 등) | 틀린 것 0 | | | |
| 비용 (1,000답변당 · 무료 구간) | 데모 규모 ≈ 0원 | | | |

- **TTS 결정:** (미정) → \`TTS_PROVIDER=…\` · \`GOOGLE_TTS_VOICE=…\` / \`OPENAI_TTS_VOICE=…\`
- **STT 결정:** (미정) — 1순위 Web Speech(기기 내) · fallback \`STT_MODEL=…\`
- **3초 목표 대응:** (예: TTS 스트리밍 재생 / 첫 문장 먼저 합성 / 데모 10문항 음성 미리 만들기)
- **근거:**
`;
}

main().catch((e) => {
  console.error(hideKeys(String(e?.stack ?? e)));
  process.exit(1);
});
