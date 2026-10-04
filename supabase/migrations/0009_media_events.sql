-- 0009: 유튜브 아이콘 클릭 이벤트 추가 (events.name check 제약 확장).
-- 0004 와 같이 묶지 않고 따로 두는 이유: 운영 중 테이블은 check 제약을 즉시 바꿔야 쓰기 실패가 안 난다.
alter table events drop constraint if exists events_name_check;
alter table events add constraint events_name_check
  check (name in ('session_start', 'ask', 'detail_view', 'rec_accept', 'explore_country', 'radio_play', 'share_card', 'youtube_open'));
