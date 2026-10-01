#!/usr/bin/env node
// 세션 리포트: 이번 세션에서 만든 것 · 완료한 로드맵 작업 · 전체 진행률.
// 진행률의 기준은 docs/planning/08_기획단계_로드맵.csv (Notion `기획 단계 로드맵` DB 사본).
//
//   node scripts/session-report.mjs                 # base = origin/main 과의 merge-base, 마크다운 출력
//   node scripts/session-report.mjs --base 49911e5  # 특정 커밋부터
//   node scripts/session-report.mjs --base 5cfef93 --head 49911e5  # 지난 세션 다시 보기
//   node scripts/session-report.mjs --json          # Notion 속성 · 로드맵 동기화용 JSON
//   node scripts/session-report.mjs --notion        # Notion 세션 기록 페이지 본문
//   node scripts/session-report.mjs --github-comment [--pr 12]   # PR에 리포트 댓글 (있으면 갱신)
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const ROADMAP_PATH = "docs/planning/08_기획단계_로드맵.csv";
export const MARKER = "<!-- foodis-session-report -->";

// 상태별 진척 가중치. 진행 중은 절반으로 친다.
export const STATUS_WEIGHT = { 완료: 1, "진행 중": 0.5, "시작 전": 0 };

// ── 순수 함수 (테스트 대상) ─────────────────────────────────────────

export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// "0.5일" → 0.5, "1주" → 5, "2주 (병렬)" → 10. 못 읽으면 1일로 친다.
export function parseDays(text) {
  const m = /([\d.]+)\s*(일|주)/.exec(text ?? "");
  if (!m) return 1;
  return Number(m[1]) * (m[2] === "주" ? 5 : 1);
}

export function computeProgress(rows) {
  const sum = (list, fn) => list.reduce((acc, r) => acc + fn(r), 0);
  const pct = (list) => {
    const total = sum(list, (r) => parseDays(r["예상 기간"]));
    if (!total) return 0;
    return Math.round((100 * sum(list, (r) => parseDays(r["예상 기간"]) * (STATUS_WEIGHT[r["상태"]] ?? 0))) / total);
  };
  const count = (list, status) => list.filter((r) => r["상태"] === status).length;
  const stages = [...new Set(rows.map((r) => r["단계"]))];
  return {
    percent: pct(rows),
    p0Percent: pct(rows.filter((r) => r["우선순위"]?.startsWith("P0"))),
    total: rows.length,
    done: count(rows, "완료"),
    inProgress: count(rows, "진행 중"),
    todo: count(rows, "시작 전"),
    byStage: stages.map((stage) => {
      const list = rows.filter((r) => r["단계"] === stage);
      return { stage, percent: pct(list), done: count(list, "완료"), total: list.length };
    }),
  };
}

export function diffRoadmap(before, after) {
  const prev = new Map(before.map((r) => [r["작업"], r]));
  const next = new Set(after.map((r) => r["작업"]));
  const completed = [];
  const started = [];
  const reopened = [];
  const added = [];
  for (const r of after) {
    const old = prev.get(r["작업"]);
    if (!old) { added.push(r); continue; }
    if (old["상태"] === r["상태"]) continue;
    if (r["상태"] === "완료") completed.push(r);
    else if (r["상태"] === "진행 중" && old["상태"] === "시작 전") started.push(r);
    else reopened.push({ ...r, 이전상태: old["상태"] });
  }
  const removed = before.filter((r) => !next.has(r["작업"]));
  return { completed, started, reopened, added, removed };
}

// 경로 → 사람이 읽는 영역 이름
export function areaOf(path) {
  if (/\.test\.|\/eval\//.test(path)) return "테스트";
  if (path.startsWith("apps/web/app/api/")) return "API";
  if (/^apps\/web\/(app|components|public)\//.test(path) || path.startsWith("apps/web/lib/client/")) return "화면 (UI)";
  if (path.startsWith("apps/web/lib/foodi/")) return "AI (Foodi)";
  if (path.startsWith("apps/web/lib/")) return "백엔드";
  if (path.startsWith("foodis-data/")) return "데이터 배치";
  if (path.startsWith("supabase/")) return "DB 스키마";
  if (path.startsWith("docs/") || /(^|\/)README\.md$/.test(path)) return "문서";
  if (path.startsWith(".github/") || path.startsWith("scripts/") || path.startsWith(".claude/")) return "도구 · 자동화";
  if (/(^|\/)(package\.json|pnpm-lock\.yaml|\.gitignore|[^/]+\.config\.\w+)$/.test(path)) return "설정 · 의존성";
  return "기타";
}

export function summarizeFiles(files) {
  const areas = new Map();
  for (const f of files) {
    const a = areas.get(areaOf(f.path)) ?? { area: areaOf(f.path), files: 0, added: 0, deleted: 0 };
    a.files++;
    a.added += f.added;
    a.deleted += f.deleted;
    areas.set(a.area, a);
  }
  return [...areas.values()].sort((x, y) => y.added + y.deleted - (x.added + x.deleted));
}

export function nextUp(rows, limit = 3) {
  return rows.filter((r) => r["우선순위"]?.startsWith("P0") && r["상태"] !== "완료").slice(0, limit);
}

const bar = (pct, width = 20) => "█".repeat(Math.round((pct / 100) * width)).padEnd(width, "░");
const signed = (n) => (n > 0 ? `▲ +${n}` : n < 0 ? `▼ ${n}` : "±0");

// GitHub 은 표 칸의 | 만, Notion 은 마크다운 특수문자 전부를 이스케이프한다.
const FLAVORS = {
  github: {
    text: (s) => String(s ?? "").replace(/\n/g, " "),
    cell: (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " "),
    table: (head, rows, align) => [
      `| ${head.join(" | ")} |`,
      `|${align.map((a) => (a === "r" ? "---:" : "---")).join("|")}|`,
      ...rows.map((r) => `| ${r.join(" | ")} |`),
    ],
    details: (summary, items) => [`<details><summary>${summary}</summary>`, "", ...items, "", "</details>"],
  },
  notion: {
    text: (s) => String(s ?? "").replace(/\n/g, " ").replace(/[\\*~`$[\]<>{}|^]/g, "\\$&"),
    cell: (s) => FLAVORS.notion.text(s),
    table: (head, rows) => [
      '<table header-row="true">',
      ...[head, ...rows].map((r) => `\t<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`),
      "</table>",
    ],
    details: (summary, items) => ["<details>", `<summary>${summary}</summary>`, ...items.map((i) => `\t${i}`), "</details>"],
  },
};

// flavor: "github" (PR 댓글 · Actions 요약) | "notion" (세션 기록 페이지 본문)
export function renderMarkdown(r, flavor = "github") {
  const f = FLAVORS[flavor];
  const t = f.text;
  const p = r.progress.after;
  const delta = p.percent - r.progress.before.percent;
  const out = flavor === "github" ? [MARKER, `## 📊 세션 리포트 — ${r.date} · \`${r.branch}\``, ""] : [];
  out.push(`### 전체 진행률 **${p.percent}%** (${signed(delta)}%p)`);
  out.push("", "```", `${bar(p.percent)}  ${p.percent}%`, "```");
  out.push(`작업 ${p.done}/${p.total} 완료 · ${p.inProgress} 진행 중 · ${p.todo} 시작 전 — P0 필수만 보면 **${p.p0Percent}%**`, "");

  const task = (x) => `- **${t(x["작업"])}** · ${t(x["단계"])}${x["메모"] ? ` — ${t(x["메모"])}` : ""}`;
  out.push(`### ✅ 이번 세션에 완료한 기능 (${r.changes.completed.length})`);
  out.push(...(r.changes.completed.length ? r.changes.completed.map(task) : ["- 없음 (로드맵 상태 변경 없음)"]), "");
  if (r.changes.started.length) out.push(`### 🔄 진행 중으로 바뀐 작업 (${r.changes.started.length})`, ...r.changes.started.map(task), "");
  if (r.changes.reopened.length) {
    out.push("### ⚠️ 상태가 되돌아간 작업", ...r.changes.reopened.map((x) => `- **${t(x["작업"])}** — ${x.이전상태} → ${x["상태"]}`), "");
  }
  if (r.changes.added.length) out.push("### ➕ 로드맵에 추가된 작업", ...r.changes.added.map(task), "");
  if (r.changes.removed.length) out.push("### ➖ 로드맵에서 빠진 작업", ...r.changes.removed.map(task), "");

  out.push(`### 🛠 만든 것 — 커밋 ${r.commits.length}개 · 파일 ${r.files.length}개 · +${r.totals.added} / −${r.totals.deleted}`);
  if (r.areas.length) {
    out.push("", ...f.table(["영역", "파일", "추가", "삭제"],
      r.areas.map((a) => [f.cell(a.area), a.files, `+${a.added}`, `−${a.deleted}`]), ["l", "r", "r", "r"]));
  }
  out.push("", ...r.commits.map((c) => `- \`${c.sha}\` ${t(c.subject)}`));
  if (r.newFiles.length) {
    const shown = r.newFiles.slice(0, 15).map((x) => `- \`${x}\``);
    if (r.newFiles.length > shown.length) shown.push(`- … 외 ${r.newFiles.length - shown.length}개`);
    out.push("", ...f.details(`새 파일 ${r.newFiles.length}개`, shown));
  }
  if (r.uncommitted) out.push("", `> ⚠️ 커밋 안 된 변경 ${r.uncommitted}개 파일은 리포트에 포함되지 않았다.`);

  out.push("", "### 단계별 진행률", "", ...f.table(["단계", "진행률", "완료"],
    p.byStage.map((s) => [f.cell(s.stage), `\`${bar(s.percent, 10)}\` ${s.percent}%`, `${s.done}/${s.total}`]), ["l", "l", "r"]));

  const next = nextUp(r.roadmap);
  if (next.length) out.push("", "### ⏭ 다음에 할 P0 작업", ...next.map((x) => `- ${t(x["작업"])} (${x["상태"]}, ${t(x["예상 기간"])})`));
  const note = `진행률 = 작업별 예상 기간 가중 (완료 1 · 진행 중 0.5 · 시작 전 0). 기준: \`${ROADMAP_PATH}\` · 범위 \`${r.base.slice(0, 7)}..${r.head.slice(0, 7)}\``;
  out.push("", flavor === "github" ? `<sub>${note}</sub>` : `${note} {color="gray"}`);
  return out.join("\n");
}

// ── git / gh ────────────────────────────────────────────────────────

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts }).trim();
const git = (...args) => run("git", ["-c", "core.quotepath=off", ...args]);
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

function resolveBase(explicit, head) {
  if (explicit) return tryGit("merge-base", head, explicit) ?? git("rev-parse", explicit);
  for (const ref of ["origin/main", "main"]) {
    const mb = tryGit("merge-base", head, ref);
    if (mb && mb !== head) return mb;
  }
  // main 위에서 바로 실행하면 마지막 커밋 하나를 세션으로 본다.
  return git("rev-parse", `${head}~1`);
}

function roadmapAt(ref) {
  const text = tryGit("show", `${ref}:${ROADMAP_PATH}`);
  return text ? parseCsv(text) : [];
}

export function collect({ base: baseArg, head: headArg = "HEAD" } = {}) {
  const head = git("rev-parse", headArg);
  const base = resolveBase(baseArg, head);
  const range = `${base}..${head}`;
  const commits = (git("log", "--reverse", "--format=%h%x09%s", range) || "")
    .split("\n").filter(Boolean).map((l) => { const [sha, ...s] = l.split("\t"); return { sha, subject: s.join("\t") }; });
  const files = (git("diff", "--numstat", base, head) || "").split("\n").filter(Boolean).map((l) => {
    const [a, d, ...p] = l.split("\t");
    return { path: p.join("\t"), added: Number(a) || 0, deleted: Number(d) || 0 };
  });
  const newFiles = (git("diff", "--name-only", "--diff-filter=A", base, head) || "").split("\n").filter(Boolean);
  const before = roadmapAt(base);
  const after = roadmapAt(head);
  return {
    date: new Date().toLocaleDateString("sv-SE"),
    branch: process.env.GITHUB_HEAD_REF || (headArg === "HEAD" ? git("rev-parse", "--abbrev-ref", "HEAD") : headArg),
    base,
    head,
    commits,
    files,
    newFiles,
    totals: { added: files.reduce((s, f) => s + f.added, 0), deleted: files.reduce((s, f) => s + f.deleted, 0) },
    areas: summarizeFiles(files),
    uncommitted: headArg !== "HEAD" ? 0 : (tryGit("status", "--porcelain") || "").split("\n").filter(Boolean).length,
    progress: { before: computeProgress(before), after: computeProgress(after) },
    changes: diffRoadmap(before, after),
    roadmap: after,
  };
}

function postGithubComment(body, pr) {
  const number = pr || JSON.parse(run("gh", ["pr", "view", "--json", "number"])).number;
  const ids = run("gh", ["api", "--paginate", `repos/{owner}/{repo}/issues/${number}/comments`,
    "--jq", `.[] | select(.body | startswith("${MARKER}")) | .id`]).split("\n").filter(Boolean);
  const file = join(mkdtempSync(join(tmpdir(), "session-report-")), "body.json");
  writeFileSync(file, JSON.stringify({ body }));
  const [method, path] = ids.length
    ? ["PATCH", `repos/{owner}/{repo}/issues/comments/${ids.at(-1)}`]
    : ["POST", `repos/{owner}/{repo}/issues/${number}/comments`];
  const url = JSON.parse(run("gh", ["api", "-X", method, path, "--input", file])).html_url;
  // 동시에 올라간 중복 리포트(로컬 · Action 경합)는 정리한다. 권한이 없으면 남겨 둔다.
  for (const id of ids.slice(0, -1)) {
    try { run("gh", ["api", "-X", "DELETE", `repos/{owner}/{repo}/issues/comments/${id}`]); } catch {}
  }
  return { number, url, updated: ids.length > 0 };
}

function main(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const report = collect({ base: opt("--base"), head: opt("--head") });
  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  if (argv.includes("--notion")) {
    process.stdout.write(renderMarkdown(report, "notion") + "\n");
    return;
  }
  const md = renderMarkdown(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  if (argv.includes("--github-comment")) {
    const res = postGithubComment(md, opt("--pr"));
    console.error(`PR #${res.number} 리포트 댓글 ${res.updated ? "갱신" : "작성"}: ${res.url}`);
  }
  process.stdout.write(md + "\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
