---
name: session-report
description: 세션을 마칠 때 실행. 이번 세션에서 만든 것 · 완료한 로드맵 기능 · 전체 진행률(%)을 계산해 GitHub PR 댓글과 Notion(로드맵 DB 동기화 · 세션 기록 DB · 허브 진행 현황)에 남긴다. "세션 정리", "세션 리포트", "오늘 뭐 했는지", "진행률 몇 %", "/session-report" 요청에 사용.
---

# 세션 리포트

진행률의 단일 기준은 `docs/planning/08_기획단계_로드맵.csv` 다. 계산은 `scripts/session-report.mjs` 가 하고, 이 스킬은 그 결과를 GitHub · Notion 에 옮긴다. 숫자를 손으로 만들지 않는다.

## Notion 대상 (고정)

| 대상 | ID |
|---|---|
| 기획 허브 페이지 | `3ec6afff66e78178a4f6fd0e0df15e76` |
| 기획 단계 로드맵 DB data source | `collection://bc7f5ee3-33d7-40d2-9a2b-17f807737a89` |
| 세션 기록 DB data source | `collection://48b2d6c7-b26b-40bf-8b72-dc39bfa153e6` |

## 순서

### 1. 로드맵 갱신 (이번 세션 작업 반영)

`git log --oneline $(git merge-base HEAD origin/main)..HEAD` 와 이번 대화에서 한 일을 보고, 상태가 바뀐 작업만 `08_기획단계_로드맵.csv` 와 `08_기획단계_로드맵.md` **둘 다** 고친다 (상태 · 메모 · 필요하면 산출물).

- `완료` 는 산출물이 저장소에 실제로 있고 검증(테스트 · 실행)까지 끝난 경우만. 일부만 됐으면 `진행 중` + 메모에 남은 일.
- 로드맵에 없는 일을 했으면 작업을 억지로 맞추지 말고 그대로 둔다 (리포트의 "만든 것"에 커밋으로 남는다).
- 바꾼 행은 사용자에게 한 줄씩 보여 준다. 애매하면 묻는다.

로드맵 변경과 남은 작업을 커밋한다 (`docs: 로드맵 상태 갱신 — …`).

### 2. 리포트 계산

```bash
node scripts/session-report.mjs --json > "$SCRATCH/session-report.json"
node scripts/session-report.mjs > "$SCRATCH/session-report.md"
```

`$SCRATCH` 는 세션 scratchpad. base 는 `origin/main` 과의 merge-base (main 위면 마지막 커밋 하나). 다른 범위는 `--base <ref>`.
JSON 의 `progress.after.percent` · `progress.before.percent` · `changes.completed` · `areas` · `commits` · `totals` · `roadmap` 을 아래에서 쓴다.

### 3. GitHub

- 브랜치를 push 한다.
- PR 이 있으면: push 만 한다. `.github/workflows/session-report.yml` 이 마커(`<!-- foodis-session-report -->`) 댓글을 달거나 갱신한다. 로컬에서 `--github-comment` 를 같이 돌리면 Action 과 경합해 댓글이 둘 생길 수 있으니, Action 이 돌지 않을 때만 쓴다 (중복은 다음 실행에서 정리된다).
- PR 이 없으면: 사용자에게 PR 을 열지 묻는다 (열면 Action 이 댓글을 단다). 묻지 않고 열지 않는다.

### 4. Notion

**a. 로드맵 DB 동기화** — data source 를 SQL 로 조회해 `작업` 제목으로 CSV 행과 맞춘다. `상태` · `메모` · `산출물` 이 다른 행만 `update_properties` 로 고친다. CSV 에만 있는 작업은 새 행으로 만든다 (단계 · 우선순위 · 담당 영역 · 예상 기간 포함). Notion 에만 있는 행은 지우지 말고 사용자에게 알린다.

**b. 세션 기록 한 줄** — 세션 기록 DB 에 페이지를 만든다.

| 속성 | 값 |
|---|---|
| 세션 | 커밋 제목들을 한 줄로 요약 (예: `AI 대화 설계 v1 — 데모 10문항 · 할루시네이션 30문항`) |
| `date:날짜:start` | JSON `date` |
| 전체 진행률 · P0 진행률 | `progress.after.percent / 100`, `progress.after.p0Percent / 100` (percent 형식이라 0~1) |
| 변화 | `(after.percent − before.percent) / 100` |
| 완료한 기능 | `changes.completed[].작업` 을 `, ` 로 연결. 없으면 빈 값 |
| 완료 수 | `changes.completed.length` |
| 영역 | `areas[].area` 배열 |
| 커밋 | `commits.length` |
| 변경 줄 | `+{totals.added} / −{totals.deleted} ({files.length}개 파일)` |
| 브랜치 · PR | 브랜치 이름, PR URL (없으면 생략) |

본문은 `session-report.md` 에서 첫 줄 마커와 마지막 `<sub>` 줄을 뺀 내용.

**c. 허브 진행 현황** — 허브 페이지를 fetch 해 `## 📊 진행 현황` 아래 callout 하나만 `update_content` 로 바꾼다. 형식:

```
<callout icon="📊" color="blue_bg">
	**전체 진행률 {after}%** ({±변화}%p) · P0 필수 {p0}% · 작업 {done}/{total} 완료, {inProgress} 진행 중
	마지막 세션: {날짜 mention} — {세션 제목} · 완료 {n}개
	다음 P0: {nextUp 3개, " · " 로}
</callout>
```

다음 P0 는 `roadmap` 에서 우선순위 `P0 필수` · 상태 `완료` 아님 · CSV 순서 앞 3개.

### 5. 채팅 마무리

세 줄 + 링크만:

- **만든 것**: 커밋 n개 · 주요 영역 (+줄/−줄)
- **완료한 기능**: 목록 (없으면 "로드맵 상태 변경 없음")
- **전체 진행률**: before% → after% (P0 p0%)
- PR 댓글 · Notion 세션 기록 링크
