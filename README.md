# 🌍 FOODIS — Different Cultures, One Table

> "검색하지 않아도 된다. 푸디에게 물어보면 된다."
> 자체 구축한 세계 음식·문화 DB를 AI가 사실의 기준으로 삼는 음성 탐험 플랫폼. 성공회대 제17회 IT 경진대회 출품작.

## 폴더 구조

```
Foodis/
├─ docs/planning/          기획서 00~11 (00_FOODIS_기획허브.md 부터 읽기)
├─ apps/web/               Next.js 15 앱 (PWA) — 화면 + /api/* BFF
│  ├─ app/api/             foodi/ask · tts · stt, foods, countries, health
│  └─ lib/
│     ├─ providers/        외부 API 어댑터 (Anthropic · OpenAI · Google TTS) — 환경변수로 교체
│     ├─ foodi/            Orchestrator: intent → retrieve → generate → validate
│     ├─ guard/            응답 캐시 키 · 속도 제한
│     └─ db/               Supabase 클라이언트 · Repo 구현
├─ foodis-data/            Python 배치: 근거 수집 → LLM 초안 → 사람 검수 → 적재 → 임베딩
└─ supabase/migrations/    DB 스키마 (앱·배치 공유, 여기서만 변경)
```

설계 기록 (docs/design): [01 UI](docs/design/01_UI_설계_구현_v1.md) · [02 AI 대화·테스트 셋](docs/design/02_AI_대화_설계_v1.md) · [03 식이 태깅 기준](docs/design/03_식이_태깅_가이드.md) · [04 데모 모드·근거 수집](docs/design/04_데모_모드_근거_수집_v1.md)

발표 기기 준비는 `/demo` (발표자 페이지)

설계 근거: [11 상세 아키텍처](docs/planning/11_상세_아키텍처_설계_도안.md) · [09 외부 API 선정](docs/planning/09_외부_API_조사_선정.md) · [07 API 명세](docs/planning/07_PRD_보강_플랫폼_구조_KPI_기능_명세_API_수익_모델.md)

## 시작하기

필요: Node 22, pnpm 10, Python 3.12+

```bash
pnpm install                                   # 앱 의존성
cp apps/web/.env.example apps/web/.env.local   # 키 입력
pnpm dev                                       # http://localhost:3000 → /api/health 로 설정 확인

cd foodis-data
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # (macOS/Linux: .venv/bin/pip)
cp .env.example .env
```

DB: Supabase 프로젝트 생성 → SQL Editor 에 `supabase/migrations/0001_init.sql` 실행 (또는 `pnpm --filter web exec supabase db push`).

## 검증

```bash
pnpm test          # 앱: Foodi 파이프라인 오프라인 테스트 (가짜 LLM·DB — 할루시네이션 차단·장애 대체·캐시·예산)
pnpm typecheck
pnpm lint
pnpm data:test     # 배치: s01~s09 E2E (가짜 HTTP)
```

## 원칙

- **DB가 사실, AI는 해설.** 카드의 식이 배지·출처는 LLM이 아니라 DB에서 채운다. 후보 밖 음식을 말하면 재생성 → 템플릿.
- **Voice First, Card Always.** 외부 서비스가 죽어도 카드가 있는 답은 나간다.
- 키는 서버 환경변수에만. `.env*` 는 커밋 금지 (`.env.example` 만).

## 라이선스 고지

- 국기 글꼴 `apps/web/public/fonts/TwemojiCountryFlags.woff2` — [country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill) (MIT), 그래픽은 [Twemoji](https://github.com/jdecked/twemoji) © Twitter, Inc and other contributors, [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)
