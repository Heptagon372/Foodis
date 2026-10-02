# 📈 베타 KPI 측정 v1 (07 문서 §1)

> 베타 테스트 20~30명에서 07 문서 §1 지표(North Star · Hops · 음성 사용률 · 추천 수락률 · 음성 지연 p95 · D7)를 실제로 잰다. 결과는 어드민 **`/admin/kpi`** (reviewer 이상)에서 보고, 발표 슬라이드 1장의 근거로 쓴다.
> 원칙: **익명 · 최소 수집 · 자유 텍스트 없음**. 질문 원문, 이름, 이메일, 식이 조건은 이벤트에 넣지 않는다.

## 1. 흐름

```
브라우저 lib/client/track.ts ──(10초마다 · 페이지 떠날 때 sendBeacon, 최대 50건)──▶ POST /api/events
   └ anon_id(localStorage) · session_id(sessionStorage)               └ zod 검증 · 속도 제한 · service_role 로 events 저장
                                                                         (미리보기 모드는 202 로 받고 버림)
/admin/kpi ── lib/admin/kpi-data.ts (1,000행씩 읽기) ──▶ lib/admin/kpi.ts (순수 계산, kpi.test.ts)
```

| 구성 | 파일 |
|---|---|
| 테이블 | `supabase/migrations/0004_events.sql` — `events`, 인덱스 `(name, at)` · `(anon_id, at)` · `(at)`, `purge_old_events()` |
| 이벤트 이름 목록 | `lib/analytics/events.ts` (DB check 제약과 같아야 함) |
| 수집기 | `lib/client/track.ts` · 화면 이동마다 세션 유지 `components/Tracker.tsx` (루트 레이아웃) |
| 수집 API | `app/api/events/route.ts` |
| 계산 · 화면 | `lib/admin/kpi.ts` · `lib/admin/kpi-data.ts` · `app/admin/(panel)/kpi/page.tsx` |

## 2. 식별자

| 필드 | 만드는 곳 | 의미 |
|---|---|---|
| `anon_id` | `localStorage["foodis:anon"]` 무작위 UUID | 브라우저 1개 = 사용자 1명. 계정과 연결하지 않는다. 저장소를 지우면 새 사용자 |
| `session_id` | `sessionStorage["foodis:session"]` | 탭 단위. 마지막 활동 후 **30분**이 지나면 새 세션 (+ `session_start`) |
| `user_id` | 서버가 로그인 쿠키로 붙임 (`currentUserId()`) | 로그인했을 때만. 탈퇴하면 `on delete set null` 로 비워진다 |
| `at` | 서버 | 서버 시각 − (보낸 시각 − 이벤트 시각), 최대 1일 전까지 — 기기 시계가 틀려도 순서 유지 |
| `path` | 클라이언트 | 화면 경로(최대 128자). 쿼리스트링은 보내지 않는다 |

## 3. 이벤트

| 이름 | 언제 (파일) | props |
|---|---|---|
| `session_start` | 새 세션의 첫 화면/이벤트 (`track.ts`) | — |
| `ask` | 푸디 답을 받은 뒤(음성이면 재생이 시작된 뒤) · 실패 시 (`FoodiSheet.tsx`) | `mode` voice/text · `intent` · `cards` 개수 · `card_ids`(음식 uuid) · `latency_ms` 질의→응답 · `first_audio_ms`(음성 질의만) · `offline` · 실패면 `error: true` |
| `detail_view` | 음식 상세 진입 (`FoodDetailView.tsx`) | `food_id` |
| `rec_accept` | 푸디 답 카드의 링크 클릭 (`FoodiSheet.tsx`) · 좋아요 켜기 (`passport.ts toggle`) | `food_id` · `via` open/like |
| `explore_country` | 로컬 Passport 에 그 나라 음식이 처음 들어올 때 (`passport.ts record`) | `country` (ISO 2자리) |
| `radio_play` | 라디오 새 에피소드 시작 (`radio.ts`) | `food_id` |
| `share_card` | Passport 공유 카드 생성 (`ShareCardButton.tsx`) | `countries` 개수 |

서버 검증(`/api/events`): 이름은 위 목록만, props 키 12개 · 문자열 64자 · 배열 10개까지(→ 질문 원문 같은 긴 텍스트는 들어올 수 없음), 요청당 50건, 브라우저별 분당 20회 · IP/계정별 분당 60회.

## 4. 측정 방법 (= `lib/admin/kpi.ts`)

| 지표 | 계산 | 목표(베타) |
|---|---|---|
| North Star | 기간 시작부터 7일씩 잘라 주마다 `사용자·나라 쌍의 첫 explore_country 수 ÷ 그 주 활성 사용자` 의 평균. 7일 미만 마지막 조각은 제외(전체가 7일 미만이면 그 조각으로, "7일 미만" 표시) | 3개국 이상 |
| Hops | 세션마다 `detail_view` 를 시간순으로 이어 10분 넘게 끊기면 새 줄기, 같은 음식 연속은 무시. 줄기 이동 수 = 상세 수 − 1, 세션 값 = 가장 긴 줄기, 상세를 본 세션들의 평균 | 평균 3 이상 |
| 음성 사용률 | `ask` 중 `mode=voice` 비율 (실패 포함). 추천 질문 칩·"다른 거"는 글 질의 | 60% 이상 |
| 추천 수락률 | 분모 = 세션 안 `ask.card_ids` 의 서로 다른 음식 수, 분자 = 그 카드를 보여준 **뒤** 같은 세션의 `rec_accept` (음식당 1번) | 50% 이상 |
| 음성 지연 p95 | 음성 질의의 `first_audio_ms` (nearest-rank p95) | 3초 이하 |
| D7 (참고) | 처음 본 지 7일 지난 사용자 중 7~13일차에 이벤트가 있는 비율 (기간 안 이벤트만) | 참고 |
| 사실 오류율 | 이벤트가 아니라 평가 셋(`lib/foodi/eval`, `pnpm eval:live`)으로 측정 | 식이 0% · 기타 3% 이하 |

일별 막대는 한국 시간 0시 기준으로 그날 이벤트만 다시 계산한다(자정을 넘긴 세션은 나뉜다).

### 알려진 한계

- `first_audio_ms` 의 시작점은 **인식 확정(onFinal)** 이다. Web Speech 는 말이 끝난 뒤 브라우저가 묵음을 감지한 시점, Whisper 경로는 녹음 업로드·전사가 끝난 시점이라 그 시간은 빠진다. 끝점은 서버 TTS `audio.play()` 시작, 브라우저 음성은 재생 요청 시각
- Hops 는 "연결 탭을 눌러서" 이동했는지 구분하지 않는다 — 10분 안에 상세를 연달아 열면 이동으로 본다
- 같은 사람이 여러 기기·브라우저를 쓰면 여러 사용자로 센다 (계정과 연결하지 않기 때문)
- 푸디 카드로 보여준 음식도 '탐험함'으로 기록되므로(F-REC-02) 그 나라도 `explore_country` 가 된다
- 서버 속도 제한은 인스턴스 메모리 기준 (`lib/guard/ratelimit.ts` 참고)

## 5. 개인정보 · 보관

- **추적 거부 존중**: `navigator.doNotTrack === "1"`(또는 `window.doNotTrack`) 이거나 `navigator.globalPrivacyControl === true` 이면 아무것도 보내지 않는다. 데모 모드 브라우저(발표 기기)와 `/admin` 화면도 보내지 않는다
- 수집하지 않는 것: 질문 원문·인식 텍스트, 식이 조건·알레르기, 이메일·이름, IP(속도 제한에만 메모리로 쓰고 저장 안 함), 쿼리스트링
- 접근: `events` 는 RLS 를 켜고 공개 정책이 없다 → anon/authenticated 키로는 읽기·쓰기 불가. 쓰기는 `/api/events`(service_role), 읽기는 `/admin/kpi`(reviewer 이상)
- **보관 90일 권장**: Supabase → Database → Cron(pg_cron)에 매일 `select purge_old_events();` (기본 90일, `purge_old_events(30)` 처럼 바꿀 수 있음). 베타가 끝나면 발표용 집계만 남기고 지워도 된다
- 개인정보 처리방침에 "서비스 개선을 위한 익명 이용 통계(브라우저 무작위 id, 90일 보관)" 한 줄을 추가한다

## 6. 설정

1. Supabase SQL Editor 에서 `supabase/migrations/0004_events.sql` 실행 (여러 번 실행해도 안전)
2. 앱이 실제 DB 모드(`isLive()`, 검수된 음식 1개 이상)여야 저장된다 — 미리보기 모드에서는 받고 버린다
3. `/admin/kpi` — 최근 7일 / 14일 / 베타 전체
