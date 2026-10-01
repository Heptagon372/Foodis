# 🔌 09 외부 API 조사 · 선정

> 🔌 기능별로 쓸 수 있는 외부 API·데이터를 조사하고 **채택 / 보조 / 확장 / 제외**로 판정했다. 판정 기준은 ① 자체 DB에 저장해도 되는 라이선스인가 ② 경진대회 기간 비용이 0에 가까운가 ③ 한국어 품질 ④ 데모 현장 안정성이다.
>
> 가격·한도는 2026년 9월 기준 공식 문서 또는 가격 비교 자료에서 확인한 값이다. **AI 모델 가격은 바뀌기 쉬우니 키 발급 시 공식 콘솔에서 다시 확인한다.**

## 1. 한눈에 보는 결론

| 기능 | 채택 | 보조·대안 | 제외 |
|---|---|---|---|
| 음식 구조 데이터 | **Wikidata** (CC0) | TheMealDB (재료 교차검증) | Spoonacular, Edamam |
| 음식 설명 근거 | **위키백과 REST 요약** ko/en | 한식진흥원 800선 (한국 음식) | — |
| 음식 이미지 | **위키미디어 공용** (작가 표기) | Unsplash API | TheMealDB 이미지 |
| 국가·국기 | **자체 countries.csv** + ISO 코드로 국기 이모지 계산 | — | REST Countries (v3.1 종료) |
| 세계 지도 (확장) | world-atlas TopoJSON + react-simple-maps | — | Google Maps / Mapbox |
| 위치·근처 식당 (Phase 3) | **카카오 로컬 API** | Google Places (해외), 무슬림 친화 음식점 공공데이터 | — |
| LLM | **Claude Haiku 4.5**(의도 분류) + **Claude Sonnet 5**(답변·초안) | OpenAI GPT-5.6 Luna (저비용) | 자체 호스팅 오픈소스 |
| 임베딩 | **OpenAI text-embedding-3-small** | text-embedding-3-large | — |
| STT (음성→텍스트) | **Web Speech API** (무료) | **OpenAI GPT Transcribe** (fallback, 키워드 힌트) | — |
| TTS (텍스트→음성) | **P3에서 측정 후 결정**: Google Cloud TTS vs OpenAI gpt-4o-mini-tts | 브라우저 speechSynthesis (오프라인 fallback) | ElevenLabs (무료 플랜 상업 이용 불가, 비쌈) |
| 이미지 인식 (확장) | Claude Vision → 후보 3개 → DB 매칭 | — | 자체 분류 모델 |
| DB·인증·스토리지 | **Supabase** (Postgres + pgvector) | — | Pinecone, Neo4j |

## 2. 음식 데이터

| API / 데이터 | 제공 내용 | 한도·비용 | 라이선스·저장 | 판정 |
|---|---|---|---|---|
| **Wikidata** SPARQL `query.wikidata.org/sparql` | 음식 QID, ko/en 이름, 원산지(P495), 재료(P186·P527), 대표 이미지(P18) | 무료. 연락처 있는 User-Agent 필수, 없으면 403/429 | CC0 → 자유 저장 | ✅ 채택: **음식 DB의 뼈대** |
| **위키백과 REST** `/api/rest_v1/page/summary/{title}` | 요약(extract), 설명, 원문 링크 | User-Agent 준수 시 분당 200회. 없으면 분당 10회 | CC BY-SA 4.0 → 문장 그대로 쓰지 않고 **LLM 초안의 근거**로만 사용, 출처 URL 기록 | ✅ 채택: 설명 근거 |
| **위키미디어 공용** `commons.wikimedia.org/w/api.php` | 이미지 URL(썸네일), 작가, 라이선스 | 무료 | 파일별 라이선스 → `image_credit`에 작가·라이선스·원본 링크 표기 필수 | ✅ 채택: 음식 이미지 |
| **한식진흥원 한식메뉴 외국어표기 800선** (공공데이터포털 15129784) | 한식 802건, 한/영/일/중 표기, 재료·조리 설명 | 무료, XLSX 파일 | 이용 제한 없음, 재배포·변경 가능 | ✅ 채택: 한국 음식 표기 표준 |
| **TheMealDB** `themealdb.com/api/json/v1/1` | 레시피, 재료 20개, 지역(Area), 이미지 | 테스트 키 `1`은 개발·교육용, 호출 무제한. 무료는 목록 100건 제한 | 상용 앱은 Patreon 유료 키 필요 | 🟡 보조: **재료 교차검증만**. 본문·이미지 저장 안 함 |
| Spoonacular | 레시피·영양·식단 | 무료 하루 50포인트, 초당 1회. 유료 월 29달러부터 | **캐시 최대 1시간**, 해지 시 받은 데이터 전부 삭제, 백링크 필수 | ❌ 제외: 자체 DB 구축과 정면 충돌 |
| Edamam Recipe Search | 레시피·영양 분석·식이 라벨 | 유료 플랜 중심 | 레시피 서비스용 | ❌ 제외: 문화·역사·관계 데이터 없음 |
| 식약처 식품영양성분 DB (공공데이터포털 15127578) | 음식별 열량·탄단지 등 영양 성분 | 무료, 개발 계정 하루 10,000회 | 이용 제한 없음 | 🔵 확장: 영양 정보 탭 (Phase 2) |

> 💡 **핵심 판단:** 상용 음식 API는 대부분 "우리 서버에 저장 금지" 조건이다. FOODIS의 차별점은 **자체 DB**이므로, 저장 가능한 Wikidata(CC0)를 뼈대로 하고 위키백과는 근거로만 쓰며, 문장은 LLM이 근거 안에서 새로 쓰고 사람이 검수하는 구조가 라이선스와 신뢰성을 동시에 만족한다.

## 3. 국가·지도

| 대상 | 조사 결과 | 결정 |
|---|---|---|
| REST Countries | v3.1 엔드포인트가 종료돼 에러 응답만 반환. v5는 계정·API 키가 필요하고 응답 구조가 바뀜 | ❌ 의존하지 않음. 30개국은 `countries.csv`로 직접 관리 (ISO 코드, 국기, 대륙, Accent 컬러) |
| 국기 | ISO 3166-1 alpha-2 코드 두 글자를 지역 표시 문자로 바꾸면 국기 이모지가 된다 (KR → 🇰🇷) | ✅ 코드로 계산. 이모지가 깨지는 환경용 SVG는 확장 시 추가 |
| 세계 지도 | world-atlas TopoJSON(Natural Earth 기반) + react-simple-maps로 무료 정적 SVG 지도 가능 | 🔵 확장(World Food Map). 유료 지도 API 불필요 |

## 4. 위치·근처 식당 (Phase 3 "근처에서 먹어보기")

| API | 한도·비용 | 쓰임 | 판정 |
|---|---|---|---|
| **카카오 로컬 API** (키워드·카테고리 장소 검색) | 지도 REST API 하루 100,000건 무료 (카카오 전체 월 300만 건). 무료 쿼터는 개발자 계정의 **첫 번째 앱에만** 제공 | "인제라 먹을 수 있는 근처 식당" → 키워드 + 음식점 카테고리 검색 | ✅ Phase 3 채택 (국내) |
| Google Places API (New) | 2025년 3월부터 월 200달러 크레딧 폐지, SKU별 무료 5,000~10,000건. 이후 1,000건당 과금, 필드에 따라 단가 상승 | 해외 식당 검색 | 🔵 해외 확장 시에만 |
| 무슬림 친화 음식점 공공데이터 (경기관광공사 등) | 무료 파일 데이터 | 할랄 사용자에게 "근처 무슬림 친화 식당" 연결 | 🔵 Phase 3 후보 |

## 5. AI

### 5.1 LLM

| 모델 | 가격 (1M 토큰, 입력/출력) | FOODIS 역할 |
|---|---|---|
| **Claude Haiku 4.5** | $1 / $5 | 의도 분류·슬롯 추출 (짧고 빠름) |
| **Claude Sonnet 5** | $2 / $10 | 후보 중 선택·음성 답변 생성, 데이터 초안(s05) |
| OpenAI GPT-5.6 Luna | $0.20 / $1.20 | 비용 압박 시 의도 분류 대안 |

- **JSON 보장:** Claude는 tool_use 강제 또는 Structured Outputs로 답변 스키마(`speech, cards, follow_ups, sources`)를 지킨다. 서버 검증 레이어는 그대로 유지한다.
- 모델은 환경변수로 교체할 수 있게 어댑터로 감싼다 (11 문서).

### 5.2 임베딩

- **OpenAI text-embedding-3-small**: 1M 토큰당 $0.02, 1536차원. 180건 전체 임베딩 비용 1센트 미만. Anthropic은 자체 임베딩 API가 없어 OpenAI를 쓴다.

### 5.3 STT (음성 → 텍스트)

| 옵션 | 비용 | 장점 | 한계 |
|---|---|---|---|
| **Web Speech API** (브라우저) | 무료 | 지연 짧음, 중간 결과 표시 가능 | Chrome은 Google 서버, Safari는 Apple 서버로 음성 전송. Firefox 미지원. 음식 이름 같은 특수 단어 힌트 불가. 인앱 브라우저는 마이크 차단 잦음 |
| **OpenAI GPT Transcribe** | 분당 $0.0045 | **키워드 힌트** → "인제라", "하차푸리" 같은 외국 음식 이름 인식 보강 | 녹음 후 업로드라 지연 증가 |
| OpenAI GPT-4o Mini Transcribe | 분당 $0.003 | 가장 저렴 | 키워드 힌트 기능 확인 필요 |

**결정:** Web Speech 우선, 인식 결과가 비었거나 사용자가 "다시"를 누르면 GPT Transcribe로 재인식. 키워드 힌트에는 DB의 음식 이름 180개를 넣는다.

### 5.4 TTS (텍스트 → 음성)

| 옵션 | 비용 | 무료 범위 | 비고 |
|---|---|---|---|
| **Google Cloud TTS** Chirp 3 HD | 1M자당 $30 | 월 100만 자 무료 (WaveNet도 월 100만 자, 1M자당 $4) | 경진대회 규모면 **사실상 무료**. Chirp 3 HD의 한국어 음성 제공 여부는 P3에서 확인 |
| **OpenAI gpt-4o-mini-tts** | 생성 음성 분당 약 $0.015 (tts-1은 1M자당 $15) | 신규 크레딧 $5 | 스트리밍 지원, 말투 지시 가능 → "호기심 많은 여행 친구" 페르소나 연출에 유리 |
| ElevenLabs Flash v2.5 | 1천 자당 $0.06 | 월 1만 크레딧, **상업 이용 불가** | 품질 최고 수준이나 비싸고 무료 플랜 제약 |
| 브라우저 speechSynthesis | 무료 | — | 오프라인·장애 시 fallback 전용 (기기마다 음질 차이) |

**결정:** P3에서 같은 데모 문장 10개로 두 후보의 **첫 음성까지 걸리는 시간 + 한국어 자연스러움**을 비교해 고른다. 어느 쪽이든 같은 어댑터 인터페이스로 붙인다.

### 5.5 이미지 인식 (확장)

- Claude Vision에 사진 + "FOODIS DB 음식 이름 목록"을 함께 주고 후보 3개만 고르게 한다 → DB에 있는 음식만 카드로 노출. 자체 분류 모델은 학습 데이터가 없어 제외.

## 6. 인프라

| 서비스 | 무료 범위 | 주의 |
|---|---|---|
| **Supabase Free** | DB 500MB, 스토리지 1GB, 전송량 월 5GB, 월 활성 사용자 5만 명, 프로젝트 2개 | **7일 동안 접속이 없으면 일시정지** → 대회 2주 전 Pro(월 25달러) 전환 또는 주기적 헬스체크 호출. 데이터 규모(음식 200건 + 벡터)는 500MB의 1% 미만 |
| Vercel (Next.js 호스팅) | Hobby 플랜 | API 키는 서버 환경변수에만 |

## 7. 비용 추정

### 질의 1건당

| 단계 | 사용량 가정 | 비용 |
|---|---|---|
| 의도 분류 (Haiku 4.5) | 입력 800 / 출력 100 토큰 | $0.0013 |
| 답변 생성 (Sonnet 5) | 입력 2,500 / 출력 300 토큰 | $0.0080 |
| 질의 임베딩 | 30 토큰 | ≈ $0 |
| TTS | 답변 약 150자 ≈ 10초 | $0.0025 (OpenAI) / 무료 범위 내 $0 (Google) |
| STT fallback | 질의의 20%만, 5초 | ≈ $0.0001 |
| **합계** |  | **약 $0.012 (약 16원)** |

- 베타 테스트 30명 × 50질의 = 1,500질의 → **약 18달러**. 데모 질문 10개는 응답 캐시로 반복 비용 0.
- 데이터 구축(s05 초안 180건): 약 4~5달러. 임베딩: 1센트 미만.
- **API 예산 상한**을 서버에 설정해 하루 한도를 넘으면 캐시·템플릿 응답으로 전환한다 (11 문서).

## 8. 키 발급 체크리스트

- [ ] Anthropic Console — API 키, 월 사용 한도 설정
- [ ] OpenAI Platform — API 키 (임베딩·STT·TTS 후보), 사용 한도 설정
- [ ] Google Cloud — Text-to-Speech API 활성화 (TTS 비교용)
- [ ] Supabase — 프로젝트 생성, `0001_init.sql` 실행, service_role 키 보관
- [ ] 공공데이터포털 — 한식진흥원 800선 XLSX 다운로드 (키 불필요)
- [ ] 카카오 디벨로퍼스 — 앱 생성 (Phase 3, 첫 번째 앱에 무료 쿼터)

## 9. 출처

- [TheMealDB FAQ](https://www.themealdb.com/faq.php) · [TheMealDB API](https://www.themealdb.com/api.php)
- [Spoonacular 가격·약관](https://spoonacular.com/food-api/pricing)
- [REST Countries v3.1 종료 사례](https://github.com/Mailishaa/country-trivia/pull/9)
- [Wikimedia API 접근 규칙 정리](https://github.com/fuzheado/Wikipedia-AI-Skills/blob/main/.claude/skills/wikimedia-api-access/SKILL.md)
- [한식진흥원 외국어표기 800선](https://www.data.go.kr/data/15129784/fileData.do) · [식약처 식품영양성분DB](https://www.data.go.kr/data/15127578/openapi.do) · [경기도 무슬림 친화 음식점](https://www.data.go.kr/data/15099378/fileData.do)
- [카카오 쿼터](https://developers.kakao.com/docs/ko/getting-started/quota) · [카카오 로컬 API](https://developers.kakao.com/docs/ko/local/common)
- [Google Places 가격 분석](https://www.woosmap.com/blog/google-places-api-pricing)
- [Claude API 가격 (2026-09)](https://www.tminusai.com/blog/claude-api-pricing-monthly-cost-2026) · [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [OpenAI 가격 (2026-09)](https://www.cloudzero.com/blog/openai-pricing/) · [OpenAI TTS 가격](https://costgoat.com/pricing/openai-tts) · [OpenAI 전사 가격](https://costgoat.com/pricing/openai-transcription)
- [Google Cloud TTS 가격](https://texttolab.com/blog/google-cloud-tts-pricing) · [ElevenLabs 가격](https://texttolab.com/blog/elevenlabs-pricing)
- [Web Speech API 한계](https://www.assemblyai.com/blog/speech-recognition-javascript-web-speech-api)
- [Unsplash API 가이드라인](https://help.unsplash.com/articles/2511245-unsplash-api-guidelines)
- [Supabase 무료 플랜 한도](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
