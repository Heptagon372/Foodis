-- 0008: 푸랜드(밥친구 찾기) — 켠 사람끼리 지도에서 서로 보고, 바로 1:1 대화 (docs/design/16_푸랜드_밥친구_찾기_v1.md). 0007 다음에 실행. 여러 번 실행해도 안전.
-- 위치는 켜 둔 동안만 의미가 있다: 끄거나 시간이 지나면(on_until) 보이지 않고, 7일 지난 위치는 purge_buddy() 로 지운다.
-- 모든 읽기·쓰기는 서버(service_role)만 — 라우트가 '켠 사람만 남의 위치를 본다'·좌표 반올림을 지킨다. 공개 정책 없음.

create table if not exists buddy_presence (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  id         uuid not null unique default gen_random_uuid(),   -- 화면에 내보내는 공개 id
  name       text not null check (char_length(name) between 1 and 40),
  cuisines   text[] not null check (cardinality(cuisines) between 1 and 4 and cuisines <@ array['vegetarian', 'korean', 'chinese', 'japanese']),
  message    text not null check (char_length(message) between 1 and 60),
  age        int not null check (age between 19 and 99),
  gender     text not null check (gender in ('male', 'female', 'none')),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  on_until   timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists buddy_presence_on_idx on buddy_presence (on_until, lat, lng);

create table if not exists buddy_chats (
  id         uuid primary key default gen_random_uuid(),
  a_id       uuid not null references auth.users (id) on delete cascade,  -- 먼저 말 건 사람
  b_id       uuid not null references auth.users (id) on delete cascade,
  a_name     text not null,
  b_name     text not null,
  a_profile  jsonb not null,
  b_profile  jsonb not null,
  created_at timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  ended_at   timestamptz,
  ended_by   uuid,
  check (a_id <> b_id)
);
-- 두 사람 사이 진행 중인 대화는 하나만
create unique index if not exists buddy_chats_open_pair_idx on buddy_chats (least(a_id, b_id), greatest(a_id, b_id)) where ended_at is null;
create index if not exists buddy_chats_a_idx on buddy_chats (a_id, last_at desc);
create index if not exists buddy_chats_b_idx on buddy_chats (b_id, last_at desc);

create table if not exists buddy_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references buddy_chats (id) on delete cascade,
  sender_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists buddy_messages_chat_idx on buddy_messages (chat_id, created_at);

-- 메시지가 들어오면 대화의 last_at 갱신
create or replace function buddy_chat_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update buddy_chats set last_at = new.created_at where id = new.chat_id;
  return null;
end $$;
revoke all on function buddy_chat_touch() from public, anon, authenticated;
drop trigger if exists buddy_messages_touch on buddy_messages;
create trigger buddy_messages_touch after insert on buddy_messages for each row execute function buddy_chat_touch();

alter table buddy_presence enable row level security;
alter table buddy_chats    enable row level security;
alter table buddy_messages enable row level security;

-- 보관: 끝난 지 7일 지난 대화(메시지 포함)와 7일 동안 안 켠 위치를 지운다 (pg_cron 으로 select purge_buddy();)
create or replace function purge_buddy(keep_days int default 7) returns bigint
language sql security definer set search_path = public as $$
  with c as (delete from buddy_chats where ended_at < now() - make_interval(days => keep_days) returning 1),
       p as (delete from buddy_presence where on_until < now() - make_interval(days => keep_days) returning 1)
  select (select count(*) from c) + (select count(*) from p);
$$;
revoke all on function purge_buddy(int) from public, anon, authenticated;
