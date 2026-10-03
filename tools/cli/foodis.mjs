#!/usr/bin/env node
// FOODIS 개발 콘솔 — FOODIS.bat 더블클릭 또는 `pnpm foodis`
// 실행하면 개발 서버가 자동으로 켜지고, 키 하나로 재시작·GitHub·테스트·데이터 파이프라인·발표 리허설을 다룬다.
// 외부 패키지 없이 Node 내장 모듈만 쓴다.
//   --status    상태만 한 번 출력하고 종료 (서버를 켜지 않음)
//   --once      서버를 켜고 준비되면 화면 한 장을 그린 뒤 종료 (점검용)
//   --no-server 서버를 켜지 않고 콘솔만
//   --keys=g,esc 키 입력을 흉내 내 화면 전환을 점검 (서버 없이)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = path.join(ROOT, "apps/web");
const DATA = path.join(ROOT, "foodis-data");
const REPO_URL = "https://github.com/Heptagon372/Foodis";
const IS_WIN = process.platform === "win32";
const args = new Set(process.argv.slice(2));

// ───────────────────────── 색·글자 폭
const rgb = (r, g, b) => (s) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
const C = {
  green: rgb(31, 95, 70),
  mint: rgb(127, 209, 174),
  mintD: rgb(95, 191, 150),
  ivory: rgb(251, 248, 241),
  muted: rgb(150, 150, 140),
  warn: rgb(224, 165, 38),
  bad: rgb(220, 90, 80),
  ok: rgb(46, 158, 107),
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  inv: (s) => `\x1b[7m${s}\x1b[27m`,
};
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
/** 한글·전각은 터미널에서 2칸 */
const width = (s) => [...stripAnsi(s)].reduce((w, ch) => w + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const pad = (s, n) => s + " ".repeat(Math.max(0, n - width(s)));
const clip = (s, n) => {
  if (width(s) <= n) return s;
  let out = "";
  for (const ch of stripAnsi(s)) {
    if (width(out + ch) > n - 1) break;
    out += ch;
  }
  return out + "…";
};

// ───────────────────────── 로고 (FOOD 은 딥그린→민트 그라데이션, IS 는 민트)
const LETTERS = {
  F: ["██████", "██    ", "█████ ", "██    ", "██    "],
  O: [" ████ ", "██  ██", "██  ██", "██  ██", " ████ "],
  D: ["█████ ", "██  ██", "██  ██", "██  ██", "█████ "],
  I: ["██", "██", "██", "██", "██"],
  S: [" █████", "██    ", " ████ ", "    ██", "█████ "],
};
function banner() {
  const word = "FOODIS";
  const rows = [];
  for (let r = 0; r < 5; r++) {
    let line = "";
    let col = 0;
    const foodWidth = 4 * 7;
    for (const [i, ch] of [...word].entries()) {
      for (const px of LETTERS[ch][r]) {
        if (px === " ") line += " ";
        else if (i < 4) {
          const t = Math.min(1, col / foodWidth);
          line += rgb(Math.round(31 + (127 - 31) * t), Math.round(95 + (209 - 95) * t), Math.round(70 + (174 - 70) * t))("█");
        } else line += C.mintD("█");
        col++;
      }
      line += " ";
      col++;
    }
    rows.push("  " + line);
  }
  return rows;
}

// ───────────────────────── 상태
const S = {
  server: null, // ChildProcess
  port: 3000,
  phase: "stopped", // stopped | starting | ready | stopping | crashed
  startedAt: 0,
  logs: [],
  health: null,
  healthErr: null,
  git: { branch: "?", sha: "?", dirty: 0, ahead: 0 },
  screen: "main", // main | logs | github | keys | tests | pipeline
  msg: "",
  busy: false,
};
const log = (line) => {
  for (const l of String(line).split(/\r?\n/)) if (l.trim()) S.logs.push(stripAnsi(l).slice(0, 400));
  if (S.logs.length > 600) S.logs.splice(0, S.logs.length - 600);
  schedule();
};

// ───────────────────────── git
function git(...a) {
  const r = spawnSync("git", a, { cwd: ROOT, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trimEnd(), err: (r.stderr || "").trim() };
}
function refreshGit() {
  const head = git("rev-parse", "--abbrev-ref", "HEAD");
  const sha = git("rev-parse", "--short", "HEAD");
  const st = git("status", "--porcelain");
  const ab = git("rev-list", "--count", "@{u}..HEAD");
  S.git = { branch: head.out || "?", sha: sha.out || "?", dirty: st.out ? st.out.split("\n").length : 0, ahead: ab.ok ? Number(ab.out) : 0 };
}

// ───────────────────────── 키 파일 (값은 절대 출력하지 않는다)
function readEnv(file) {
  if (!existsSync(file)) return null;
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    // "KEY=   # 설명" 처럼 값 없이 주석만 있는 줄은 빈 값 (Next.js 의 dotenv 와 같은 해석)
    if (!/^["']/.test(v)) v = v.startsWith("#") ? "" : v.replace(/\s+#.*$/, "");
    out[m[1]] = v.replace(/^["']|["']$/g, "").trim();
  }
  return out;
}
const KEY_ROWS = [
  ["apps/web/.env.local", "NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"],
  ["apps/web/.env.local", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase 공개 키"],
  ["apps/web/.env.local", "SUPABASE_SERVICE_ROLE_KEY", "Supabase 서버 키"],
  ["apps/web/.env.local", "GEMINI_API_KEY", "Gemini (푸디 답변 1순위)"],
  ["apps/web/.env.local", "OPENAI_API_KEY", "OpenAI (답변 2순위·임베딩·STT)"],
  ["apps/web/.env.local", "ANTHROPIC_API_KEY", "Anthropic (선택)"],
  ["apps/web/.env.local", "GOOGLE_TTS_CREDENTIALS_JSON", "Google TTS"],
  ["foodis-data/.env", "SUPABASE_URL", "데이터: Supabase URL"],
  ["foodis-data/.env", "SUPABASE_SERVICE_ROLE_KEY", "데이터: Supabase 서버 키"],
  ["foodis-data/.env", "GEMINI_API_KEY", "데이터: Gemini (s05 기본·s09)"],
  ["foodis-data/.env", "OPENAI_API_KEY", "데이터: OpenAI (s05·s09)"],
  ["foodis-data/.env", "ANTHROPIC_API_KEY", "데이터: Anthropic (s05, 선택)"],
];
const mask = (v) => (v ? (v.length > 10 ? `${v.slice(0, 6)}…(${v.length}자)` : "설정됨") : "");

// ───────────────────────── 서버
/** 누가 이미 그 포트에서 응답하면 사용 중. IPv4·IPv6 둘 다 확인 (Next 는 "::" 에 뜬다) */
const answers = (host, port) =>
  new Promise((res) => {
    const sock = net.connect({ host, port });
    sock.setTimeout(700);
    sock.once("connect", () => (sock.destroy(), res(true)));
    sock.once("timeout", () => (sock.destroy(), res(false)));
    sock.once("error", () => res(false));
  });
const portFree = async (port) => !(await answers("127.0.0.1", port)) && !(await answers("::1", port));

async function startServer() {
  if (S.server) return;
  let port = 3000;
  while (!(await portFree(port)) && port < 3010) port++;
  if (port !== 3000) log(`ℹ 포트 3000 을 다른 프로그램이 쓰고 있어 ${port} 로 켭니다`);
  S.port = port;
  S.phase = "starting";
  S.startedAt = Date.now();
  S.health = null;
  log(`▶ 개발 서버 시작 (포트 ${port})`);
  const child = spawn("pnpm", ["--filter", "web", "dev", "--port", String(port)], {
    cwd: ROOT,
    shell: true,
    env: { ...process.env, FORCE_COLOR: "0", NEXT_TELEMETRY_DISABLED: "1" },
    windowsHide: true,
  });
  S.server = child;
  const onData = (d) => {
    const text = d.toString();
    log(text);
    if (/Ready in|ready started|Local:/i.test(text) && S.phase === "starting") {
      S.phase = "ready";
      setTimeout(refreshHealth, 1500);
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", (code) => {
    if (S.server === child) {
      S.server = null;
      S.phase = S.phase === "stopping" ? "stopped" : "crashed";
      log(S.phase === "crashed" ? `✕ 서버가 종료됨 (코드 ${code}) — R 로 다시 켜기` : "■ 서버 중지됨");
    }
  });
  schedule();
}

function killTree(pid) {
  if (IS_WIN) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  else
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      /* 이미 종료 */
    }
}

async function stopServer() {
  const child = S.server;
  if (!child) return;
  S.phase = "stopping";
  schedule();
  const done = new Promise((r) => child.once("exit", r));
  killTree(child.pid);
  await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
  S.server = null;
  S.phase = "stopped";
}

async function restartServer() {
  S.msg = "서버를 다시 시작합니다…";
  await stopServer();
  await startServer();
  S.msg = "";
}

async function refreshHealth() {
  if (S.phase !== "ready") return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const r = await fetch(`http://localhost:${S.port}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    S.health = await r.json();
    S.healthErr = null;
  } catch (e) {
    S.healthErr = e.name === "AbortError" ? "응답 없음 (첫 컴파일 중일 수 있어요)" : e.message;
  }
  schedule();
}

const openUrl = (url) => (IS_WIN ? spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }) : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" })).unref();
const openFile = (file) => (IS_WIN ? spawn("notepad", [file], { detached: true, stdio: "ignore" }).unref() : openUrl(file));

// ───────────────────────── 화면
const cols = () => Math.max(60, Math.min(process.stdout.columns || 100, 110));
const rule = (title = "") => C.muted(`── ${title} ${"─".repeat(Math.max(2, cols() - width(title) - 6))}`);
const dot = (st) => ({ ok: C.ok("●"), warn: C.warn("●"), bad: C.bad("●"), idle: C.muted("○") })[st];
const key = (k, label) => `${C.inv(C.bold(` ${k} `))} ${label}`;
function menuRows(items) {
  const w = cols() - 4;
  const rows = [];
  let line = "  ";
  for (const it of items) {
    if (width(line) + width(it) + 3 > w) {
      rows.push(line);
      line = "  ";
    }
    line += it + "   ";
  }
  rows.push(line);
  return rows;
}

function serverLines() {
  const up = S.startedAt ? Math.round((Date.now() - S.startedAt) / 1000) : 0;
  const upText = up > 90 ? `${Math.floor(up / 60)}분 ${up % 60}초` : `${up}초`;
  const ph = {
    ready: `${dot("ok")} 실행 중   ${C.bold(C.mint(`http://localhost:${S.port}`))}   ${C.muted(`${upText} 전 시작`)}`,
    starting: `${dot("warn")} 시작하는 중… ${C.muted("(첫 실행은 30초쯤 걸려요)")}`,
    stopping: `${dot("warn")} 멈추는 중…`,
    stopped: `${dot("idle")} 꺼져 있음 ${C.muted("— S 로 켜기")}`,
    crashed: `${dot("bad")} 비정상 종료 ${C.muted("— 로그 확인(L) 후 R")}`,
  }[S.phase];
  const h = S.health;
  const lines = [`  ${ph}`];
  if (h) {
    const k = h.keys || {};
    const mark = (b, label) => (b ? C.ok(`✓ ${label}`) : C.muted(`✕ ${label}`));
    lines.push(`  데이터  ${h.content?.live ? C.ok("실제 DB") : C.warn("미리보기 샘플")} ${C.muted(`· ${h.content?.reason ?? ""}`)}`);
    lines.push(`  DB      ${h.db?.ok ? C.ok(`연결됨 · 국가 ${h.db.countries}개`) : C.bad(h.db?.error || "연결 안 됨")}`);
    // 영역별 준비된 제공자 (/api/health providers — 키 값은 없다)
    const ready = (area) => (h.providers?.[area] ?? []).filter((p) => p.ready).map((p) => p.id);
    const llm = ready("llm");
    lines.push(`  키      ${mark(k.supabase, "Supabase")}  ${mark(llm.length, `LLM ${llm.join("→") || ""}`.trim())}  ${mark(ready("embed").length, "임베딩")}  ${mark(ready("tts").length, "TTS")}`);
  } else if (S.phase === "ready") lines.push(`  ${C.muted(S.healthErr ? `상태 확인 실패: ${S.healthErr}` : "상태 확인 중…")}`);
  return lines;
}

function frame() {
  const L = [];
  L.push("", ...banner());
  const g = S.git;
  L.push(`  ${C.muted("Different Cultures, One Table.")}   ${C.muted(`${g.branch}@${g.sha}`)}${g.dirty ? C.warn(`  변경 ${g.dirty}개`) : C.muted("  깨끗함")}${g.ahead ? C.warn(`  push 안 한 커밋 ${g.ahead}개`) : ""}`);
  L.push("");

  if (S.screen === "main") {
    L.push(rule("서버"), ...serverLines(), "");
    L.push(rule("최근 로그"));
    const tail = S.logs.slice(-8);
    for (const l of tail) L.push("  " + C.dim(clip(l, cols() - 4)));
    for (let i = tail.length; i < 8; i++) L.push("");
    L.push("", rule("메뉴"));
    L.push(...menuRows([key("R", "재시작"), key("S", S.server ? "서버 끄기" : "서버 켜기"), key("O", "앱 열기"), key("D", "발표자"), key("A", "어드민"), key("L", "로그"), key("H", "새로고침")]));
    L.push(...menuRows([key("G", "GitHub"), key("K", "키 설정"), key("T", "테스트"), key("P", "데이터 파이프라인"), key("B", "발표 리허설 빌드"), key("Q", "종료")]));
  } else if (S.screen === "logs") {
    L.push(rule(`서버 로그 (마지막 ${Math.min(S.logs.length, 30)}줄)`));
    for (const l of S.logs.slice(-30)) L.push("  " + clip(l, cols() - 4));
    L.push("", ...menuRows([key("C", "로그 비우기"), key("ESC", "돌아가기")]));
  } else if (S.screen === "github") {
    L.push(rule("GitHub"));
    L.push(`  저장소   ${C.mint(REPO_URL)}`);
    L.push(`  브랜치   ${g.branch} @ ${g.sha}   ${g.ahead ? C.warn(`push 안 한 커밋 ${g.ahead}개`) : C.ok("원격과 같음")}`);
    const st = git("status", "--porcelain").out;
    L.push(`  변경     ${st ? C.warn(`${st.split("\n").length}개 파일`) : C.ok("없음")}`);
    for (const f of (st ? st.split("\n") : []).slice(0, 10)) L.push("    " + C.muted(clip(f, cols() - 6)));
    if (st && st.split("\n").length > 10) L.push("    " + C.muted(`… 외 ${st.split("\n").length - 10}개`));
    L.push("", ...menuRows([key("1", "변경 내용(diff 요약)"), key("2", "커밋 + push"), key("3", "pull (최신 받기)"), key("4", "push 만"), key("5", "최근 커밋"), key("6", "GitHub 열기"), key("ESC", "돌아가기")]));
  } else if (S.screen === "keys") {
    L.push(rule("키 설정 (값은 화면에 표시하지 않아요)"));
    const files = { "apps/web/.env.local": readEnv(path.join(WEB, ".env.local")), "foodis-data/.env": readEnv(path.join(DATA, ".env")) };
    let last = "";
    for (const [file, name, label] of KEY_ROWS) {
      if (file !== last) {
        L.push(`  ${C.bold(file)}${files[file] ? "" : C.bad("  (파일 없음 — 1/2 로 만들기)")}`);
        last = file;
      }
      const v = files[file]?.[name];
      L.push(`    ${v ? C.ok("✓") : C.muted("·")} ${pad(label, 30)} ${C.muted(v ? mask(v) : "비어 있음")}`);
    }
    L.push("", `  ${C.muted("키를 바꾼 뒤에는 R 로 서버를 다시 켜야 반영돼요.")}`);
    L.push("", ...menuRows([key("1", "앱 키 파일 열기"), key("2", "데이터 키 파일 열기"), key("3", "Supabase 대시보드"), key("R", "서버 재시작"), key("ESC", "돌아가기")]));
  } else if (S.screen === "tests") {
    L.push(rule("테스트"));
    L.push(`  ${C.muted("앱 테스트에는 할루시네이션 테스트 셋 30문항(오프라인)이 포함돼요.")}`);
    L.push("", ...menuRows([key("1", "앱 테스트"), key("2", "타입체크 + 린트"), key("3", "데이터 파이프라인 E2E"), key("4", "실제 Claude 30문항 (≈$0.3)"), key("ESC", "돌아가기")]));
  } else if (S.screen === "pipeline") {
    L.push(rule("데이터 파이프라인 (foodis-data)"));
    L.push(`  ${existsSync(path.join(DATA, ".venv")) ? C.ok("✓ 파이썬 가상환경 있음") : C.warn("! 가상환경 없음 — 0 으로 만들기")}`);
    L.push(`  ${C.muted("순서: 1→2 근거 수집 · 5 AI 초안 · 7 검수 시트 · 8 적재 · 9 임베딩")}`);
    L.push("", ...menuRows([key("0", "가상환경 설치"), key("T", "s00b TasteAtlas 발견"), key("1", "s01 Wikidata"), key("2", "s02 위키백과"), key("5", "s05 AI 초안"), key("6", "s06 관계 후보"), key("E", "s07 검수 시트 만들기"), key("I", "s07 검수 반영"), key("8", "s08 적재 (먼저 미리보기)"), key("9", "s09 임베딩"), key("ESC", "돌아가기")]));
  }

  if (S.msg) L.push("", "  " + C.mint(S.msg));
  return L;
}

let pending = false;
let paused = false;
function schedule() {
  if (pending || paused || !process.stdout.isTTY) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    if (paused) return;
    const lines = frame();
    process.stdout.write("\x1b[H" + lines.map((l) => l + "\x1b[K").join("\n") + "\x1b[J");
  }, 80);
}

// ───────────────────────── 앞에서 실행하는 명령 (출력을 그대로 보여 주고 키 입력 대기)
function pauseUi() {
  paused = true;
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause(); // 앞에서 도는 명령(git 로그인 등)이 키 입력을 받도록 콘솔을 넘겨준다
  process.stdout.write("\x1b[?25h\x1b[2J\x1b[H");
}
function resumeUi() {
  paused = false;
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write("\x1b[?25l\x1b[2J");
  refreshGit();
  schedule();
}
const waitKey = (text = "아무 키나 누르면 돌아가요") =>
  new Promise((res) => {
    process.stdout.write(`\n${C.mint(text)} `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => res());
  });
const ask = (q) =>
  new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => {
      rl.close(); // close 가 stdin 을 멈추므로 다음 키 입력을 위해 다시 연다
      process.stdin.resume();
      res(a.trim());
    });
  });

async function runForeground(title, cmd, cmdArgs, opts = {}) {
  pauseUi();
  console.log(C.bold(C.mint(`▶ ${title}`)) + C.muted(`   ${cmd} ${cmdArgs.join(" ")}`) + "\n");
  const r = spawnSync(cmd, cmdArgs, { cwd: opts.cwd ?? ROOT, stdio: "inherit", shell: true, env: { ...process.env, ...opts.env } });
  console.log("\n" + (r.status === 0 ? C.ok("✓ 완료") : C.bad(`✕ 실패 (코드 ${r.status})`)));
  await waitKey();
  resumeUi();
  return r.status === 0;
}

async function commitAndPush() {
  pauseUi();
  const st = git("status", "--short").out;
  if (!st) {
    console.log(C.ok("커밋할 변경이 없어요."));
    if (S.git.ahead && (await ask(`push 안 한 커밋 ${S.git.ahead}개를 올릴까요? (y/N) `)).toLowerCase() === "y") spawnSync("git", ["push"], { cwd: ROOT, stdio: "inherit" });
    await waitKey();
    return resumeUi();
  }
  console.log(C.bold("변경된 파일") + "\n" + st + "\n");
  const secret = st.split("\n").filter((l) => /\.env($|\.local)|\.pem$|credentials/i.test(l));
  if (secret.length) {
    console.log(C.bad("✕ 키 파일로 보이는 파일이 있어 멈춥니다:\n" + secret.join("\n")));
    await waitKey();
    return resumeUi();
  }
  const msg = await ask(C.mint("커밋 메시지 (비우면 취소): "));
  if (!msg) {
    console.log(C.muted("취소했어요."));
    await waitKey();
    return resumeUi();
  }
  if ((await ask(`위 파일 전부를 "${msg}" 로 커밋하고 push 할까요? (y/N) `)).toLowerCase() !== "y") {
    console.log(C.muted("취소했어요."));
    await waitKey();
    return resumeUi();
  }
  const steps = [
    ["git", ["add", "-A"]],
    ["git", ["commit", "-m", msg]],
    ["git", ["push"]],
  ];
  for (const [c, a] of steps) {
    console.log(C.muted(`$ ${c} ${a.join(" ")}`));
    const r = spawnSync(c, a, { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) {
      console.log(C.bad("✕ 여기서 멈췄어요"));
      break;
    }
  }
  await waitKey();
  resumeUi();
}

// ───────────────────────── 키 처리
const py = path.join(DATA, IS_WIN ? ".venv/Scripts/python" : ".venv/bin/python");
const pyRun = (title, script, extra = []) => runForeground(title, `"${py}"`, [script, ...extra], { cwd: path.join(DATA, "scripts"), env: { PYTHONIOENCODING: "utf-8" } });

async function onKey(k) {
  if (S.busy) return;
  const back = k === "\u001b" || k === "b";
  S.msg = "";
  if (k === "\u0003") return quit(); // Ctrl+C

  if (S.screen !== "main" && back) return ((S.screen = "main"), schedule());
  S.busy = true;
  try {
    if (S.screen === "main") {
      if (k === "q") return quit();
      if (k === "r") await restartServer();
      if (k === "s") S.server ? await stopServer() : await startServer();
      if (k === "o") openUrl(`http://localhost:${S.port}`);
      if (k === "d") openUrl(`http://localhost:${S.port}/demo`);
      if (k === "a") openUrl(`http://localhost:${S.port}/admin`);
      if (k === "h") (refreshGit(), await refreshHealth(), (S.msg = "상태를 새로 읽었어요"));
      if (k === "l") S.screen = "logs";
      if (k === "g") (refreshGit(), (S.screen = "github"));
      if (k === "k") S.screen = "keys";
      if (k === "t") S.screen = "tests";
      if (k === "p") S.screen = "pipeline";
      if (k === "b") {
        const ok = await runForeground("발표 리허설용 프로덕션 빌드 (.next-prod)", "pnpm", ["--filter", "web", "build"], { env: { NEXT_DIST_DIR: ".next-prod" } });
        if (ok) {
          spawn("pnpm", ["--filter", "web", "exec", "next", "start", "-p", "3100"], { cwd: ROOT, shell: true, detached: true, stdio: "ignore", env: { ...process.env, NEXT_DIST_DIR: ".next-prod", DEMO_MODE: "true" } }).unref();
          S.msg = "리허설 서버를 http://localhost:3100 에 켰어요 (서비스 워커·오프라인 동작). 3초 뒤 /demo 를 열어요";
          setTimeout(() => openUrl("http://localhost:3100/demo"), 3000);
        }
      }
    } else if (S.screen === "logs") {
      if (k === "c") S.logs = [];
    } else if (S.screen === "github") {
      if (k === "1") await runForeground("변경 내용", "git", ["--no-pager", "diff", "--stat"]);
      if (k === "2") await commitAndPush();
      if (k === "3") await runForeground("최신 받기", "git", ["pull", "--ff-only"]);
      if (k === "4") await runForeground("push", "git", ["push"]);
      if (k === "5") await runForeground("최근 커밋", "git", ["--no-pager", "log", "--oneline", "-15"]);
      if (k === "6") openUrl(REPO_URL);
    } else if (S.screen === "keys") {
      if (k === "1") openFile(path.join(WEB, existsSync(path.join(WEB, ".env.local")) ? ".env.local" : ".env.example"));
      if (k === "2") openFile(path.join(DATA, existsSync(path.join(DATA, ".env")) ? ".env" : ".env.example"));
      if (k === "3") openUrl("https://supabase.com/dashboard/projects");
      if (k === "r") await restartServer();
    } else if (S.screen === "tests") {
      if (k === "1") await runForeground("앱 테스트", "pnpm", ["--filter", "web", "test"]);
      if (k === "2") (await runForeground("타입체크", "pnpm", ["--filter", "web", "typecheck"])) && (await runForeground("린트", "pnpm", ["--filter", "web", "lint"]));
      if (k === "3") await runForeground("데이터 파이프라인 E2E", `"${py}"`, ["-m", "pytest", "tests", "-q"], { cwd: DATA });
      if (k === "4") await runForeground("실제 Claude 로 30문항", "pnpm", ["--filter", "web", "eval:live"]);
    } else if (S.screen === "pipeline") {
      if (k === "0") await runForeground("가상환경 설치", IS_WIN ? "py" : "python3", ["-m", "venv", ".venv", "&&", `"${py}"`, "-m", "pip", "install", "-r", "requirements.txt"], { cwd: DATA });
      if (k === "t") {
        const ok = await pyRun("s00b TasteAtlas 발견 (조회만)", "s00b_tasteatlas_discover.py");
        if (ok) {
          pauseUi();
          const yes = (await ask("새 후보를 dish_targets.csv 에 병합할까요? (y/N) ")).toLowerCase() === "y";
          resumeUi();
          if (yes) await pyRun("s00b TasteAtlas 병합", "s00b_tasteatlas_discover.py", ["--apply"]);
        }
      }
      if (k === "1") await pyRun("s01 Wikidata", "s01_wikidata.py");
      if (k === "2") await pyRun("s02 위키백과", "s02_wikipedia.py");
      if (k === "5") {
        const ok = await pyRun("s05 AI 초안 비용 추정 (호출 안 함)", "s05_llm_draft.py", ["--dry-run"]);
        if (ok) {
          pauseUi();
          const yes = (await ask("남은 초안을 실제로 만들까요? 비용이 듭니다 (y/N) ")).toLowerCase() === "y";
          resumeUi();
          if (yes) await pyRun("s05 AI 초안 (이어서 실행됨)", "s05_llm_draft.py", ["--yes"]);
        }
      }
      if (k === "6") await pyRun("s06 관계 후보", "s06_relations.py");
      if (k === "e") await pyRun("s07 검수 시트 만들기", "s07_review.py", ["export"]);
      if (k === "i") await pyRun("s07 검수 반영", "s07_review.py", ["import"]);
      if (k === "8") {
        const ok = await pyRun("s08 적재 미리보기 (전송 안 함)", "s08_load.py", ["--dry-run"]);
        if (ok) {
          pauseUi();
          const yes = (await ask("실제로 Supabase 에 적재할까요? (y/N) ")).toLowerCase() === "y";
          resumeUi();
          if (yes) await pyRun("s08 적재", "s08_load.py");
        }
      }
      if (k === "9") await pyRun("s09 임베딩", "s09_embed.py");
    }
  } finally {
    S.busy = false;
    schedule();
  }
}

let quitting = false;
async function quit() {
  if (quitting) return;
  quitting = true;
  S.msg = "서버를 끄고 종료합니다…";
  schedule();
  await stopServer();
  process.stdout.write("\x1b[?25h\n");
  process.exit(0);
}

// ───────────────────────── 시작
async function main() {
  refreshGit();
  if (args.has("--status")) {
    process.stdout.write(banner().join("\n") + "\n\n");
    const keys = { "apps/web/.env.local": readEnv(path.join(WEB, ".env.local")), "foodis-data/.env": readEnv(path.join(DATA, ".env")) };
    for (const [file, name, label] of KEY_ROWS) console.log(`  ${keys[file]?.[name] ? C.ok("✓") : C.muted("·")} ${pad(label, 30)} ${C.muted(file)}`);
    console.log(`\n  ${S.git.branch}@${S.git.sha}  변경 ${S.git.dirty}개  push 안 한 커밋 ${S.git.ahead}개`);
    return;
  }
  if (!existsSync(path.join(ROOT, "node_modules"))) {
    console.log(C.mint("처음 실행이라 의존성을 설치합니다 (1~2분)…"));
    spawnSync("pnpm", ["install"], { cwd: ROOT, stdio: "inherit", shell: true });
  }
  // 점검용: --keys=g,esc,k,esc → 서버 없이 키를 차례로 넣고 화면을 출력
  const keysArg = process.argv.find((a) => a.startsWith("--keys="));
  if (keysArg) {
    for (const k of keysArg.slice(7).split(",")) {
      await onKey(k === "esc" ? "\u001b" : k);
      process.stdout.write(`\n===== [${k}] → ${S.screen} =====\n` + frame().slice(8).join("\n") + "\n");
    }
    process.exit(0);
  }
  if (args.has("--once")) {
    await startServer();
    for (let i = 0; i < 120 && S.phase !== "ready"; i++) await new Promise((r) => setTimeout(r, 500));
    await refreshHealth();
    process.stdout.write(frame().join("\n") + "\n");
    await stopServer();
    process.exit(0);
  }
  if (!process.stdin.isTTY) {
    console.log("대화형 터미널에서 실행하세요 (FOODIS.bat 더블클릭 또는 pnpm foodis).");
    process.exit(1);
  }
  process.stdout.write("\x1b[?25l\x1b[2J");
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    if (!paused) void onKey(d.toLowerCase());
  });
  process.stdout.on("resize", schedule);
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
  process.on("exit", () => S.server && killTree(S.server.pid)); // 창을 닫아도 서버가 남지 않게
  setInterval(() => {
    refreshGit();
    void refreshHealth();
  }, 15000);
  setInterval(schedule, 1000); // 실행 시간 표시
  if (!args.has("--no-server")) await startServer();
  schedule();
}

main();
