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
├─ scripts/     s00 ~ s09
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

# 2) 초안 (ANTHROPIC_API_KEY)
python scripts/s05_llm_draft.py     # 약 2,100건, 중단돼도 이어서 실행됨. 특정 음식만: s05_llm_draft.py kimchi injera
python scripts/s06_relations.py     # 관계 후보 + relations_review.csv

# 3) 사람 검수
python scripts/s07_review.py export # data/draft/review_sheet.csv 를 엑셀로 열어 검수
#   - approve 열에 Y
#   - final_vegan … final_dairy_free 에 yes / depends / no / unknown
#   - yes·no 로 확정하려면 diet_sources 에 URL 2개 이상 (아니면 자동으로 unknown)
#   - relations_review.csv 도 approve=Y 표시
python scripts/s07_review.py import # 모순(동물성 재료인데 vegan=yes 등)은 자동 차단

# 4) 적재 + 임베딩 (SUPABASE_*, OPENAI_API_KEY)
python scripts/s08_load.py --dry-run
python scripts/s08_load.py
python scripts/s09_embed.py
```

## 검증

```bash
python -m pytest tests -q   # 오프라인 E2E: s01→s09 전 구간, 검수 규칙(출처 2개·모순 차단) 포함
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

- s05 LLM 초안: 2,100 × (입력 ~3k + 출력 ~1.5k 토큰) → Sonnet급 약 45~60달러 (사람이 고른 298건만 먼저: 약 7~9달러)
- s09 임베딩: ~7만 토큰 → 1센트 미만
- s01~s04: 무료 (Wikimedia는 연락처가 있는 User-Agent 필수)
