-- 0006: 커뮤니티 World Table (F-SOC-01, docs/design/14_커뮤니티_World_Table_v1.md). 0005 다음에 실행한다. 여러 번 실행해도 안전.
-- 밥친구 찾기 + 모임(다이어트·할랄·채식·육식·콜라보·한식·중식·양식·일식·기타) 게시판. 글·사진·위치·투표·따봉·댓글·참여·공유.
-- 쓰기는 모두 서버 라우트(/api/community/*)가 로그인 확인 후 service_role 로 한다 → 공개 정책은 "보이는 글 읽기"만.
-- community_signals 는 카테고리 탭·글 열람·따봉·댓글·글쓰기를 모아 AI 트렌드(lib/community/trends.ts)·푸디 브리핑의 재료가 된다.
-- 위치는 사용자가 직접 적은 약속 장소 글자만 저장한다 (기기 좌표는 저장하지 않는다 — 0005 원칙과 같음).

create table if not exists community_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references auth.users (id) on delete cascade,
  author_name   text not null check (char_length(author_name) between 1 and 40),
  category      text not null check (category in ('buddy', 'diet', 'halal', 'vegetarian', 'meat', 'collab', 'korean', 'chinese', 'western', 'japanese', 'etc')),
  title         text not null check (char_length(title) between 2 and 60),
  body          text not null check (char_length(body) between 1 and 2000),
  place         text check (char_length(place) <= 60),
  meet_at       timestamptz,                                   -- 밥친구: 만날 시각
  capacity      smallint check (capacity between 1 and 20),    -- 밥친구: 함께할 인원 (글쓴이 제외)
  photos        jsonb not null default '[]'::jsonb,            -- [{url, path}] 최대 4장 (Storage 버킷 community)
  poll          jsonb,                                         -- {question, options: string[2..5]}
  food_slugs    text[] not null default '{}',                  -- 글에서 찾은 DB 음식 (lib/community/tags.ts)
  country_codes text[] not null default '{}',
  like_count    int not null default 0,
  comment_count int not null default 0,
  join_count    int not null default 0,
  report_count  int not null default 0,
  status        text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at    timestamptz not null default now()
);
create index if not exists community_posts_feed_idx on community_posts (created_at desc) where status = 'visible';
create index if not exists community_posts_cat_idx on community_posts (category, created_at desc) where status = 'visible';
create index if not exists community_posts_author_idx on community_posts (author_id);

create table if not exists community_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references community_posts (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists community_comments_post_idx on community_comments (post_id, created_at);

-- 따봉 · 밥친구 참여 · 투표 · 신고: 1인 1회
create table if not exists community_likes (
  post_id    uuid not null references community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists community_joins (
  post_id    uuid not null references community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists community_votes (
  post_id    uuid not null references community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  option     smallint not null check (option between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists community_reports (
  post_id    uuid not null references community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  reason     text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- AI 반영용 행동 신호. 자유 텍스트 없음 (종류 · 카테고리 · 글 id 만). anon_id 는 브라우저 무작위 id (0004 events 와 같음)
create table if not exists community_signals (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  anon_id    text,
  user_id    uuid references auth.users (id) on delete set null,
  kind       text not null check (kind in ('tap', 'view', 'like', 'comment', 'vote', 'join', 'post', 'share')),
  category   text,
  post_id    uuid references community_posts (id) on delete set null
);
create index if not exists community_signals_at_idx on community_signals (at);

-- 투표 집계: 화면은 선택지별 개수만 쓴다 (누가 뭘 골랐는지는 공개하지 않는다)
create or replace view community_poll_counts as
  select post_id, option, count(*)::int as count from community_votes group by post_id, option;

-- ── 카운터 트리거 (피드가 글마다 count(*) 를 돌리지 않게)
create or replace function community_bump() returns trigger language plpgsql security definer set search_path = public as $$
declare
  col text := tg_argv[0];
  pid uuid := coalesce(new.post_id, old.post_id);
  d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  execute format('update community_posts set %I = greatest(0, %I + $1) where id = $2', col, col) using d, pid;
  -- 신고 3건 누적 → 자동 숨김 (07 문서 §3 거버넌스, 어드민이 다시 열 수 있다)
  if col = 'report_count' and tg_op = 'INSERT' then
    update community_posts set status = 'hidden' where id = pid and report_count >= 3;
  end if;
  return null;
end $$;
revoke all on function community_bump() from public, anon, authenticated;

drop trigger if exists community_likes_count on community_likes;
drop trigger if exists community_joins_count on community_joins;
drop trigger if exists community_comments_count on community_comments;
drop trigger if exists community_reports_count on community_reports;
create trigger community_likes_count    after insert or delete on community_likes    for each row execute function community_bump('like_count');
create trigger community_joins_count    after insert or delete on community_joins    for each row execute function community_bump('join_count');
create trigger community_comments_count after insert or delete on community_comments for each row execute function community_bump('comment_count');
create trigger community_reports_count  after insert or delete on community_reports  for each row execute function community_bump('report_count');

-- ── RLS: 보이는 글·그 댓글만 공개 읽기. 나머지(좋아요·투표·신고·신호)는 공개 정책 없음 = service_role 만
alter table community_posts    enable row level security;
alter table community_comments enable row level security;
alter table community_likes    enable row level security;
alter table community_joins    enable row level security;
alter table community_votes    enable row level security;
alter table community_reports  enable row level security;
alter table community_signals  enable row level security;

drop policy if exists "public visible posts" on community_posts;
drop policy if exists "public comments of visible posts" on community_comments;
create policy "public visible posts" on community_posts for select using (status = 'visible');
create policy "public comments of visible posts" on community_comments for select
  using (exists (select 1 from community_posts p where p.id = post_id and p.status = 'visible'));

revoke all on community_poll_counts from anon, authenticated;

-- ── 사진: 공개 읽기 버킷 (업로드는 서버가 service_role 로, 1장 2MB · JPEG/PNG/WebP)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 신호 보관 기간: 90일 권장 (0004 purge_old_events 와 같이 pg_cron 으로 select purge_old_community_signals();)
create or replace function purge_old_community_signals(keep_days int default 90) returns bigint
language sql security definer set search_path = public as $$
  with d as (delete from community_signals where at < now() - make_interval(days => keep_days) returning 1)
  select count(*) from d;
$$;
revoke all on function purge_old_community_signals(int) from public, anon, authenticated;
