import assert from "node:assert/strict";
import { test } from "node:test";
import { areaOf, computeProgress, diffRoadmap, MARKER, parseCsv, parseDays, renderMarkdown } from "./session-report.mjs";

const CSV = `\uFEFF단계,작업,상태,우선순위,담당 영역,예상 기간,산출물,메모
P0 방향 확정,한 줄 정의,완료,P0 필수,기획,1일,"01 문서, 허브",확정
P0 방향 확정,MVP 경계,진행 중,P0 필수,기획,1일,02 문서,"따옴표 ""안"" 쉼표, 포함"
P5 개발,MVP 스프린트,시작 전,P0 필수,"프론트, 백엔드",2주 (병렬),웹앱,
P5 개발,베타 테스트,시작 전,P1 중요,기획,0.5일,시트,
`;

test("parseCsv: BOM · 따옴표 · 쉼표 포함 필드", () => {
  const rows = parseCsv(CSV);
  assert.equal(rows.length, 4);
  assert.equal(rows[0]["단계"], "P0 방향 확정");
  assert.equal(rows[0]["산출물"], "01 문서, 허브");
  assert.equal(rows[1]["메모"], '따옴표 "안" 쉼표, 포함');
  assert.equal(rows[2]["담당 영역"], "프론트, 백엔드");
  assert.equal(rows[3]["메모"], "");
});

test("parseDays: 일 · 주 · 소수 · 못 읽는 값", () => {
  assert.equal(parseDays("0.5일"), 0.5);
  assert.equal(parseDays("3일"), 3);
  assert.equal(parseDays("1주"), 5);
  assert.equal(parseDays("2주 (병렬)"), 10);
  assert.equal(parseDays(""), 1);
});

test("computeProgress: 예상 기간 가중, 진행 중은 절반", () => {
  const p = computeProgress(parseCsv(CSV));
  // (1×1 + 1×0.5 + 10×0 + 0.5×0) / 12.5 = 12%
  assert.equal(p.percent, 12);
  // P0만: 1.5 / 12 = 12.5 → 13%
  assert.equal(p.p0Percent, 13);
  assert.deepEqual([p.total, p.done, p.inProgress, p.todo], [4, 1, 1, 2]);
  assert.deepEqual(p.byStage.map((s) => [s.stage, s.percent]), [["P0 방향 확정", 75], ["P5 개발", 0]]);
  assert.equal(computeProgress([]).percent, 0);
});

test("diffRoadmap: 완료 · 시작 · 되돌림 · 추가 · 삭제", () => {
  const before = parseCsv(CSV);
  const after = before.map((r) => ({ ...r }));
  after[1]["상태"] = "완료";
  after[2]["상태"] = "진행 중";
  after[0]["상태"] = "진행 중";
  after.pop();
  after.push({ ...before[3], 작업: "새 작업" });
  const d = diffRoadmap(before, after);
  assert.deepEqual(d.completed.map((r) => r["작업"]), ["MVP 경계"]);
  assert.deepEqual(d.started.map((r) => r["작업"]), ["MVP 스프린트"]);
  assert.deepEqual(d.reopened.map((r) => [r["작업"], r.이전상태]), [["한 줄 정의", "완료"]]);
  assert.deepEqual(d.added.map((r) => r["작업"]), ["새 작업"]);
  assert.deepEqual(d.removed.map((r) => r["작업"]), ["베타 테스트"]);
});

test("areaOf: 경로를 영역으로", () => {
  assert.equal(areaOf("apps/web/lib/foodi/orchestrator.ts"), "AI (Foodi)");
  assert.equal(areaOf("apps/web/lib/foodi/orchestrator.test.ts"), "테스트");
  assert.equal(areaOf("apps/web/lib/foodi/eval/cases.ts"), "테스트");
  assert.equal(areaOf("apps/web/app/api/foodi/ask/route.ts"), "API");
  assert.equal(areaOf("apps/web/components/HomeView.tsx"), "화면 (UI)");
  assert.equal(areaOf("apps/web/lib/providers/openai.ts"), "백엔드");
  assert.equal(areaOf("supabase/migrations/0001_init.sql"), "DB 스키마");
  assert.equal(areaOf("docs/design/01_UI_설계_구현_v1.md"), "문서");
  assert.equal(areaOf("apps/web/vitest.config.mts"), "설정 · 의존성");
  assert.equal(areaOf("pnpm-lock.yaml"), "설정 · 의존성");
});

test("renderMarkdown: 마커로 시작하고 진행률 변화·완료 작업을 담는다", () => {
  const before = parseCsv(CSV);
  const after = before.map((r) => ({ ...r }));
  after[1]["상태"] = "완료";
  const md = renderMarkdown({
    date: "2026-10-01", branch: "claude/x", base: "a".repeat(40), head: "b".repeat(40),
    commits: [{ sha: "abc1234", subject: "feat: 무언가" }],
    files: [{ path: "docs/a.md", added: 3, deleted: 1 }], newFiles: ["docs/a.md"],
    totals: { added: 3, deleted: 1 }, areas: [{ area: "문서", files: 1, added: 3, deleted: 1 }], uncommitted: 0,
    progress: { before: computeProgress(before), after: computeProgress(after) },
    changes: diffRoadmap(before, after), roadmap: after,
  });
  assert.ok(md.startsWith(MARKER));
  assert.match(md, /전체 진행률 \*\*16%\*\* \(▲ \+4%p\)/);
  assert.match(md, /✅ 이번 세션에 완료한 기능 \(1\)\n- \*\*MVP 경계\*\*/);
  assert.match(md, /`abc1234` feat: 무언가/);
});

test("renderMarkdown(notion): 표는 <table>, 특수문자 이스케이프, 마커 없음", () => {
  const rows = parseCsv(CSV);
  const after = rows.map((r) => ({ ...r }));
  after[1]["상태"] = "완료";
  after[1]["메모"] = "D01~D10 <eval>";
  const md = renderMarkdown({
    date: "2026-10-01", branch: "b", base: "a".repeat(40), head: "b".repeat(40),
    commits: [{ sha: "abc1234", subject: "feat: x|y" }], files: [], newFiles: ["a.md"],
    totals: { added: 0, deleted: 0 }, areas: [{ area: "문서", files: 1, added: 1, deleted: 0 }], uncommitted: 0,
    progress: { before: computeProgress(rows), after: computeProgress(after) },
    changes: diffRoadmap(rows, after), roadmap: after,
  }, "notion");
  assert.ok(!md.includes(MARKER));
  assert.ok(!md.includes("|---"));
  assert.match(md, /<table header-row="true">\n\t<tr><td>영역<\/td>/);
  assert.ok(md.includes("D01\\~D10 \\<eval\\>"));
  assert.ok(md.includes("feat: x\\|y"));
  assert.match(md, /<details>\n<summary>새 파일 1개<\/summary>\n\t- `a.md`\n<\/details>/);
});
