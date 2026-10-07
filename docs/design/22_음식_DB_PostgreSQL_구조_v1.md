# 🗄️ 음식 DB를 PostgreSQL 답게 — 1만 개를 통째로 받지 않기 (2026-10-07)

> 요청: "1만 개 음식 DB 가 JSON 이라 불러올 때 문제가 생기니, PostgreSQL 쪽으로 다 잘 연결해서 구조를 다시 만들어 줘".
> 음식 원본(`foodis-data/data/import/*.jsonl`)은 이미 Supabase(Postgres)에 적재돼 있었다. 문제는 **앱이 Postgres 를 JSON 창고처럼 썼다**는 것 — 화면마다 1만 개를 통째로 받아 앱에서 걸렀고, 순위·사진은 DB 밖 JSON 에 있었다.

## 1. 바꾸기 전

| 어디 | 무엇을 | 크기 |
|---|---|---|
| 홈 · 지도 · 맛집탐방 · 라디오 · 국가(빈 나라) · 검색 API · My Table API · 커뮤니티 | `listFoods()` 로 공개 음식 **10,163개 전부** (PostgREST 1,000행 × 11번) 받아 JS 로 거르기 | 약 **7.2MB** / 5분마다 |
| 나라 안 유명도 순위 | `apps/web/lib/content/fame.json` (앱 번들) | 171KB |
| 갤러리 사진 · 유튜브 | `apps/web/lib/preview/media.json` — live 는 테이블(0010)이 DB 에 없어 **비어 있었다** | 2.9MB |
| 미리보기 카탈로그 | `catalog.json` — live 서버에도 정적 import 로 실려 있었다 | 775KB |
| 어드민 CSV 가져오기 | 기존 음식을 `select` 로 확인 → **1,000행에서 잘려** 검수 완료 음식을 '새 음식'으로 덮어쓸 수 있었다 | — |

## 2. DB (supabase/migrations/0014_food_catalog.sql)

여러 번 실행해도 안전. 0001 이후 아무 때나.

| 객체 | 역할 |
|---|---|
| `foods.fame_rank` · `foods.popularity` | 나라 안 순위(사람이 고른 순 → Wikidata 언어판 수) · 세계 유명도(언어판 수). `fame.json` 을 대신한다 |
| `foods_country_fame_idx (country_code, fame_rank)` | 나라별 목록·순위 계산이 인덱스 순서로 |
| **`food_cards` 뷰** | 카드 한 장에 필요한 컬럼 + 나라 이름·국기·색·지역·대륙을 평평하게. `fame_rank` 는 `row_number()` 로 **나라 안 1부터 빈칸 없이** 다시 매김 — 순위가 없는 새 음식도 언어판 수 → 사진 유무 → slug 순으로 뒤에 붙는다. `security_invoker` 라 anon 은 RLS 대로 검수된 음식만 |
| `country_food_counts` 뷰 | 나라별 음식 수 |
| `search_food_cards(q, lim)` | 한국어·영어 이름 부분 일치, **띄어쓰기 무시**("팟타이" → "팟 타이"). 정확히 같은 이름 → 앞부분 일치 → 유명도 순. `%`·`_` 는 글자 그대로 |
| `foods_name_compact_trgm` | 띄어쓰기 뺀 이름의 트라이그램 인덱스. 세 글자 이상이면 인덱스를 탄다(두 글자는 트라이그램이 안 나와 1만 개를 훑는다 — 그래도 ~50ms) |
| `set_food_fame(jsonb)` | 순위 적재용. **service_role 만** 실행 (anon 은 42501) |

미디어는 기존 `0010_food_media.sql`(food_photos · food_youtube) 을 이번에 처음 적용했다.

## 3. 앱 (apps/web/lib/content)

`ContentSource.listFoods()` 를 **없앴다** — 1만 개를 통째로 주는 길 자체를 막는다. 대신 화면이 필요한 만큼만:

| 메서드 | live (Postgres) | 쓰는 곳 |
|---|---|---|
| `topFoods({ perCountry, continent? })` | `food_cards?fame_rank=lte.N` (1,000행 넘으면 페이지) | 홈 6 · 지도 4 · 맛집탐방 10 · 라디오 20(대륙별) |
| `countryFoodCounts()` | `country_food_counts` | 지도 색칠 · 라디오 채널 준비 여부 |
| `searchFoods(q, limit)` | `rpc/search_food_cards` | `/api/foods/explore` |
| `foodsByKeys(keys)` | `food_cards?id=in…` / `slug=in…` | `/api/foods/table` · 커뮤니티 샘플 사진 |
| `foodsInCountries(codes, limit)` | `food_cards?country_code=in…&order=fame_rank` | 음식 없는 나라의 '가까운 나라 음식' |
| `foodNames()` | `foods?select=slug,name_ko,name_en` (페이지) | 커뮤니티 글 → 음식 연결 사전 |

- 목록은 모두 "모든 나라의 1위 → 2위 → …" 순으로 DB 가 정렬해서 준다 (`toExploreFoods` 는 더 이상 다시 정렬하지 않음 — 검색 관련도 순서를 지키려고).
- 상세의 '같은 나라 음식'도 아무 6개가 아니라 대표 음식 순.
- 캐시(`cache.ts`): `topFoods`(인자별) · `countryFoodCounts` · `foodNames` · `listCountries` · `countFoods` 만 5분 SWR. 검색·키 조회는 API 의 `Cache-Control` 이 맡는다.
- **live 판정**(`lib/content/index.ts`): `food_cards` 뷰가 있어야 live. 0014 전이면 "food_cards 뷰 없음 (0014 실행 필요)" 로 미리보기에 머문다 (테이블 없을 때와 같은 규칙).
- 미리보기(`lib/preview/source.ts`): `catalog.json` · `media.json` 은 **처음 쓸 때 동적 import** — live 서버는 이 JSON 을 읽지 않는다. 조회 규칙은 `lib/content/catalog.ts`(메모리 구현)가 SQL 과 똑같이 따라 한다 (순위 재계산·검색 순서, `catalog.test.ts`).

## 4. 데이터 옮기기

```bash
pnpm db:fame     # 순위 → foods.fame_rank/popularity (set_food_fame). 음식을 새로 적재한 뒤 다시 돌린다. --dry-run 가능
pnpm db:media    # media.json → food_photos · food_youtube (0010). --dry-run 가능
```

둘 다 `apps/web/.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` 를 읽는다. `fame.json` 은 지웠다 — 순위의 원본은 이제 DB.

2026-10-07 운영 DB 적용 결과: 0010 · 0014 실행, 순위 10,163개 적재(예전 `fame.json` 과 **차이 0**), 사진 4,041장 · 유튜브 1,721개 적재(media.json 2,042개 음식 전부 매칭).

## 5. 결과 (운영 DB, anon 키)

| 화면 | 전 (DB → 서버) | 후 |
|---|---|---|
| 홈 | 7.2MB · 11번 왕복 | 나라별 6개 913행 · 652KB · 1번 |
| 지도 | 7.2MB | 나라별 4개 620행 444KB + 나라별 수 163행 |
| 맛집탐방 | 7.2MB | 나라별 10개 1,445행 (2페이지) |
| 라디오 페이지 | 7.2MB | 나라별 수 163행 |
| 검색 · My Table API | 7.2MB (캐시가 비었을 때) | 결과 행만 (40행 이하) — 검색 50~110ms |
| 커뮤니티 이름 사전 | 7.2MB | 이름 3컬럼만 |

화면 응답(로컬 dev, 데운 뒤): 홈 0.9s · 지도 0.5s · 맛집탐방 0.6s · 라디오 0.3s · 국가 0.45s · 검색 API 0.13~0.2s.

## 6. 남은 것

- 푸디 AI(`lib/db/foodis-repo.ts`)의 이름 목록도 `.select()` 한 번이라 1,000개에서 잘린다 → PR #26(검색·랭킹 v2)이 1만 개 색인으로 고친다. 그 PR 은 `fame.json`·`popularity.json` 을 읽으니, 머지할 때 `foods.fame_rank`·`foods.popularity` 컬럼으로 바꾼다.
- `foodis-data/data/import/*.json`(배열판, 약 47MB)은 앱이 읽지 않는 외부 원본이다. 적재는 같은 내용의 `.jsonl` 로 한다.
