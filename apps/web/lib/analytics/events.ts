// 베타 KPI 이벤트 이름 (07 문서 §1). 클라이언트 track.ts · /api/events 검증 · DB check 제약(0004_events.sql)이 같은 목록을 쓴다.
// 이름을 늘리면 0004 의 check 제약도 같이 고친다.
export const EVENT_NAMES = [
  "session_start", // 새 세션(30분 무활동 후 포함) — 활성 사용자 · D7
  "ask", // 푸디 질의 1회 {mode, intent, cards, card_ids, latency_ms, first_audio_ms?, error?}
  "detail_view", // 음식 상세 진입 {food_id} — 세션 안 연속 진입으로 Hops 계산
  "rec_accept", // 푸디 추천 카드 → 상세 진입 또는 좋아요 {food_id, via}
  "explore_country", // 로컬 Passport 에 처음 들어온 나라 {country}
  "radio_play", // 라디오 새 에피소드 시작 {food_id}
  "share_card", // Passport 공유 카드 만들기 {countries}
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** props 값: 자유 텍스트를 막으려고 짧은 문자열 · 숫자 · 불리언 · 짧은 문자열 배열만 */
export type EventProps = Record<string, string | number | boolean | null | undefined | string[]>;

export const PROP_LIMITS = { keys: 12, str: 64, arr: 10 } as const;
