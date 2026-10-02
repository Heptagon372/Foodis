-- 0004: 베타 KPI 익명 이벤트 (07 문서 §1, docs/design/07_KPI_측정_v1.md). 0003 다음에 실행한다. 여러 번 실행해도 안전.
-- 쓰기는 /api/events 가 service_role 로만 한다 → RLS 를 켜고 공개 정책은 만들지 않는다 (anon·authenticated 는 읽기·쓰기 불가).
-- anon_id 는 브라우저마다 만든 무작위 id 로 계정과 무관하다. 질문 원문 같은 자유 텍스트는 받지 않는다 (서버 zod 가 값 길이를 막음).
create table if not exists events (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  anon_id     text not null,
  session_id  text,
  user_id     uuid references auth.users on delete set null,
  name        text not null check (name in ('session_start', 'ask', 'detail_view', 'rec_accept', 'explore_country', 'radio_play', 'share_card')),
  props       jsonb not null default '{}'::jsonb,
  path        text
);

alter table events enable row level security;

-- KPI 화면: 기간 + 이름으로 자르고, 사용자·세션 단위로 묶는다
create index if not exists events_name_at_idx on events (name, at);
create index if not exists events_anon_at_idx on events (anon_id, at);
create index if not exists events_at_idx on events (at);

-- 보관 기간: 90일 권장. Supabase 대시보드 → Database → Cron(pg_cron) 에서 매일 select purge_old_events(); 로 돌린다
create or replace function purge_old_events(keep_days int default 90) returns bigint
language sql security definer set search_path = public as $$
  with d as (delete from events where at < now() - make_interval(days => keep_days) returning 1)
  select count(*) from d;
$$;
revoke all on function purge_old_events(int) from public, anon, authenticated;
