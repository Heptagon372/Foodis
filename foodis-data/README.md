# foodis-data — FOODIS 음식·문화 DB 구축 키트

세계 150개국 약 2,100개 음식(사람이 고른 대표 음식 298 + Wikidata·위키백과 분류에서 고른 자동 후보 1,800여 개)의 **목표 선정 → 근거·사진 수집 → LLM 초안 → 사람 검수 → Supabase 적재 → 임베딩**까지 한 번에 돌리는 파이프라인.
원칙은 기획 문서 04·07과 같다: **DB가 사실의 기준, AI는 근거 안에서만 초안을 쓴다, 식이 정보는 사람이 확정한다.**

## 폴더

```
foodis-data/                         (스키마는 루트 ../supabase/migrations/ 에서 앱과 공유: 0001_init · 0002_data_sources)
├─ data/seed/
│   ├─ data_sources.csv       데이터 소스 34개 (판정·저장 정책·라이선스·표기 문구) = DB data_sources
│   ├─ countries.csv          150개국 (ISO 코드, 국기, 대륙 그룹 5개, Accent 컬러). 이름은 CLDR 한국어 표기
│   ├─ dish_targets.csv       음식 목표 리스트 (위키백과 제목 힌트, 기원 메모, 데모 필수 16개 표시)
│   │                         origin_note 가 "자동 후보" 로 시작하는 행은 s00 이 만든다 (다시 돌리면 자동 행만 갈아 끼움)
│   ├─ dish_names_ko.csv      자동 후보의 한국어 이름 (위키백과 한국어 문서 제목보다 우선)
│   ├─ dish_excludes.csv      자동 후보 제외 목록 (음식 아님 · 상표 · 술 · 다른 나라 음식 — country_code 가 있으면 그 나라 배정만 막음)
│   │                         제목 힌트는 영어 위키 기준. 영어 문서가 없거나 엉뚱하면 "es:Majadito" 처럼 언어를 붙인다 (en·ko·es·pt·fr)
│   ├─ relation_themes.csv    역사·조리법 테마 (만두 로드, 커피 하우스, 필라프 계열 …)
│   └─ image_overrides.csv    대표 이미지 교체 지정 (slug, 공용 파일명, 근거). 다른 나라 사진·비자유 라이선스 대신 쓸 파일
├─ data/raw/    ← s01~s04 수집 결과 (git 제외)
├─ data/draft/  ← s05~s07 초안·검수 시트
├─ data/final/  ← 검수 승인본 (적재 대상)
├─ scripts/     s00 ~ s09 (+ s02b 사진 보강) + llm.py (LLM 제공자 선택: Gemini · GPT · Claude)
└─ tests/       가짜 HTTP로 전체 파이프라인 E2E 검증 (네트워크·API 키 불필요)
```

## 실행 순서

```bash
pip install -r requirements.txt
cp .env.example .env            # 키 입력

# 0) Supabase 프로젝트 생성 → SQL Editor 에 ../supabase/migrations/0001_init.sql, 0002_data_sources.sql 순서로 실행

# 0) 목표 확장 (API 키 불필요) — 나라별 「○○ cuisine」 분류(PetScan) + Wikidata 로 후보를 모아 유명한 순서로
python scripts/s00_expand_targets.py --total 2100

# 1) 근거 수집 (API 키 불필요)
python scripts/s01_wikidata.py      # 위키백과 제목 → Wikidata QID, 원산지·재료·이미지
python scripts/s02_wikipedia.py     # 위키백과 ko/en 요약 + 공용 이미지 작가·라이선스
                                    #   이미지: 교체 지정 → P18 → 문서 대표 이미지 순, 자유 라이선스(CC0·PD·CC BY·BY-SA)만
python scripts/s02b_images.py       # 사진 보강: 사진이 없거나 이름과 안 맞는 음식 → 공용 검색 → Openverse(Flickr 등 CC)
                                    #   OPENVERSE_CLIENT_ID/SECRET 이 없으면 하루 200회 — 내일 다시 돌리면 이어서 찾는다
python scripts/s03_themealdb.py     # (선택) 재료 교차검증
python scripts/s04_hansik800.py     # (선택) 한식 표기 표준 — data/raw/hansik800.xlsx 필요

# 2) 초안 (기본 GEMINI_API_KEY — 아래 "LLM 제공자 고르기")
python scripts/s05_llm_draft.py --dry-run   # 비용 추정 + 제공자별 비교표 (키 불필요, 호출 안 함)
python scripts/s05_llm_draft.py --demo      # 데모 필수 16건만 먼저 → 품질 확인
python scripts/s05_llm_draft.py --yes       # 남은 전체(약 2,100건). --yes 없으면 추정만 보여 주고 멈춤(실수로 돈 쓰지 않게)
                                    # 중단돼도 이어서 실행됨. 특정 음식만: s05_llm_draft.py kimchi injera
                                    # 스키마 오류로 '검수 필요' 표시된 것만 더 똑똑한 모델로: --needs-review --smart
python scripts/s06_relations.py     # 관계 후보 + relations_review.csv (규칙 기반, LLM 안 씀)

# 3) 사람 검수
python scripts/s07_review.py export # data/draft/review_sheet.csv 를 엑셀로 열어 검수
#   - approve 열에 Y
#   - final_vegan … final_dairy_free 에 yes / depends / no / unknown
#   - yes·no 로 확정하려면 diet_sources 에 URL 2개 이상 (아니면 자동으로 unknown)
#   - relations_review.csv 도 approve=Y 표시
python scripts/s07_review.py import # 모순(동물성 재료인데 vegan=yes 등)은 자동 차단

# 4) 적재 + 임베딩 (SUPABASE_*, OPENAI_API_KEY 또는 GEMINI_API_KEY)
python scripts/s08_load.py --dry-run
python scripts/s08_load.py
python scripts/s09_embed.py         # 앱과 같은 임베딩 제공자·모델인지 꼭 확인 (아래 "임베딩")
```

## LLM 제공자 고르기 (s05)

`.env` 의 `DATA_LLM_PROVIDER` 하나로 바꾼다. 프롬프트·해요체 규칙·JSON 스키마는 세 곳 모두 같다 (`scripts/llm.py`).

| 제공자 | 키 | draft (기본) | smart (`--smart`) | 구조화 출력 방식 |
|---|---|---|---|---|
| `gemini` (기본) | `GEMINI_API_KEY` | `gemini-3.5-flash-lite` | `gemini-3.8-flash` | generateContent + `responseJsonSchema` |
| `openai` | `OPENAI_API_KEY` | `gpt-6-luna` | `gpt-6.1-sol` | Responses API + `json_schema` (strict) |
| `anthropic` (선택) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` | `claude-sonnet-5` | tool_use 강제 |

- 모델만 바꾸기: `DATA_LLM_MODEL=…` (draft), `DATA_LLM_MODEL_SMART=…`. 다른 제공자 모델을 적으면 실행 전에 멈춘다. 가격표에 없는 모델이면 `DATA_LLM_PRICE="입력,출력"`(USD/100만 토큰)으로 추정에 쓸 가격을 준다.
- 반값: `DATA_LLM_SERVICE_TIER=flex` 또는 `--flex` → Gemini·OpenAI 의 Flex 처리(표준의 50%). 한 건에 몇 분 걸릴 수 있고 혼잡하면 503 → 자동 재시도(타임아웃 15분). Anthropic 은 Flex 가 없다.
- 생각량: `DATA_LLM_EFFORT=low|medium|high` (비우면 모델 기본). 생각 토큰도 출력 요금이라 비용에 바로 반영된다.
- 안전장치: 응답을 JSON 스키마로 검증 → 틀리면 오류를 알려 주고 1회 다시 요청 → 그래도 틀리면 `needs_review` 로 저장. 검수 시트 `auto_flags` 에 "AI 초안 스키마 오류" 가 뜨고, 승인해도 import 에서 막힌다. 429·5xx 는 지수 백오프로 재시도.
- 스키마는 세 제공자 공통 부분집합으로만 쓴다: 모든 object 에 `additionalProperties:false`, 모든 속성 required(OpenAI strict 규칙), null 은 `["string","null"]`, null 이 섞인 enum 은 `anyOf`. `oneOf`·`allOf`·`$ref` 금지 (테스트가 확인).
- Gemini 무료 등급은 입력이 제품 개선에 쓰일 수 있다(가격표 "Used to improve our products: Yes"). 위키백과 요약이라 민감하진 않지만, 유료 등급이면 해당 없음.

## 임베딩 (s09) — 앱과 반드시 같게

`DATA_EMBED_PROVIDER=openai|gemini` (비우면 앱 설정 이름인 `EMBED_PROVIDER` 를 따름, 기본 openai). DB 는 `vector(1536)` 이라 두 경로 모두 1536차원으로 저장한다.

| 제공자 | 모델 (EMBEDDING_MODEL 비우면) | 1536차원 만드는 법 | 검색어(앱 쪽) 형식 |
|---|---|---|---|
| openai | `text-embedding-3-small` | 기본 1536 (`dimensions=1536`) | 그대로 |
| gemini | `gemini-embedding-2` | `outputDimensionality=1536`, 결과를 L2 정규화 | `task: search result \| query: {검색어}` (문서는 `title: {이름} \| text: {내용}` 으로 저장됨) |

**앱(apps/web)의 `EMBED_PROVIDER` · `EMBEDDING_MODEL` 과 다르면 에러 없이 검색 결과만 엉망이 된다.** 제공자를 바꾸면 기존 `food_embeddings` 를 전부 다시 만들 것 (두 모델의 벡터가 섞이면 안 됨). s09 는 실행할 때마다 이 경고를 크게 출력하고, 제공자와 모델이 서로 안 맞으면(예: gemini + text-embedding-3-small) 돈 쓰기 전에 멈춘다. `gemini-embedding-001` 을 쓰면 task_type `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` 방식이다.

## 검증

```bash
python -m pytest tests -q   # 오프라인 E2E: s01→s09 전 구간, 검수 규칙(출처 2개·모순 차단) 포함
                            # s05 는 가짜 Gemini·OpenAI·Anthropic 각각, 스키마 오류→재요청→검수 표시, 429 재시도, Flex
                            # s09 는 가짜 OpenAI·Gemini (1536차원·L2 정규화) — 실제 API 는 부르지 않는다
```

## 라이선스 메모

전체 34개 소스 판정은 `data/seed/data_sources.csv` (= DB `data_sources`, ../supabase/migrations/0002). 모든 `sources` 레코드는 `data_source_id`로 연결되고, 실시간 전용·저장 금지 소스(카카오 로컬 등)는 트리거가 저장을 막는다. s08 실행 시 CSV 내용으로 data_sources 를 동기화한다.


| 출처 | 라이선스 | 우리 쓰임 |
|---|---|---|
| Wikidata | CC0 | 원산지·재료·이미지 파일명 (구조 데이터) |
| 위키백과 본문 | CC BY-SA 4.0 | LLM 초안의 근거 자료. 문장 그대로 쓰지 않고 sources 에 URL 기록 |
| 위키미디어 공용 이미지 | 파일별 (대부분 CC BY-SA) | image_credit 에 작가·라이선스·원본 링크 표시 필수 |
| Openverse (Flickr 등) | 파일별 (CC0 · PDM · CC BY · BY-SA 만) | 공용에 맞는 사진이 없을 때. image_credit 에 작가·라이선스·원본 페이지 |
| TheMealDB | 테스트 키는 개발·교육용, 상용은 유료 | 재료 교차검증만. 본문·이미지 저장 안 함 |
| 한식진흥원 800선 | 공공데이터, 이용 제한 없음 | 한국 음식 영문 표기 표준 |

## 비용 (약 2,100건 기준 추정)

s05 초안: 사람이 고른 280건의 실제 근거로 `s05_llm_draft.py --dry-run` 을 돌린 값을 건수에 비례해 늘렸다. 1건당 입력 ~1.5k 토큰(시스템 프롬프트 + 스키마 + 근거), 출력은 보이는 답 ~1.5k + 생각 ~1.5k 로 넉넉히 잡았다(Anthropic 은 생각을 켜지 않아 1.5k). 실제 청구는 실행 끝에 토큰 수와 함께 출력된다.

| 제공자 · 등급 | 모델 | 가격 (입력 / 출력, USD per 1M) | 사람이 고른 298건 | 전체 2,147건 표준 | 전체 Flex(50%) |
|---|---|---|---|---|---|
| gemini draft (기본) | gemini-3.5-flash-lite | $0.30 / $2.50 | 약 $2.3 | **약 $17** | 약 $8.5 |
| gemini smart | gemini-3.8-flash | $0.75 / $3.75 (2027-01-01 부터 $1.50 / $7.50) | 약 $3.7 | 약 $27 | 약 $13 |
| openai draft | gpt-6-luna | $0.10 / $0.50 | 약 $0.5 | **약 $4** | 약 $2 |
| openai smart | gpt-6.1-sol | $2.00 / $10.00 | 약 $9.8 | 약 $71 | 약 $35 |
| anthropic draft | claude-haiku-4-5 | $1.00 / $5.00 | 약 $2.7 | 약 $19 | (Flex 없음) |
| anthropic smart | claude-sonnet-5 | $2.00 / $10.00 | 약 $5.3 | 약 $38 | (Flex 없음) |

- 권장 순서: `--demo` 16건(약 $0.1)으로 draft 모델 품질 확인 → 괜찮으면 `--yes`(필요하면 `--flex`) → 검수에서 걸린 것만 `--needs-review --smart`.
- Batch API(Gemini·OpenAI·Anthropic 모두 50%)는 이 스크립트에서 쓰지 않는다. 같은 할인을 동기 호출로 받는 Flex 로 대신한다.
- Gemini 무료 등급(결제 미설정 키)이면 gemini-3.5-flash-lite·3.8-flash 도 $0 이다. 대신 분당·일일 요청 한도가 낮아(한도는 AI Studio 에서 확인) 429 가 나면 응답의 retryDelay 만큼 기다렸다 재시도하고, 입력이 제품 개선에 쓰일 수 있다. 다 못 끝내면 다음 날 그대로 다시 실행하면 이어서 한다.
- s09 임베딩: 280건 ~11만 토큰 → 전체 약 85만 토큰 → openai `text-embedding-3-small`($0.02/1M) 약 $0.02, gemini `gemini-embedding-2`($0.20/1M) 약 $0.17
- s01~s04: 무료 (Wikimedia는 연락처가 있는 User-Agent 필수)
- 가격 출처 (확인일 2026-10-02): [Gemini](https://ai.google.dev/gemini-api/docs/pricing) · [OpenAI](https://developers.openai.com/api/docs/pricing) · [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing). 바뀌면 `scripts/llm.py` 의 `PRICES` 만 고치면 된다.
