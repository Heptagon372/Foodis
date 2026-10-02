-- 0007: 커뮤니티 모임(카페형) + 음식·문화 뉴스 자동 수집 (docs/design/15_모임_뉴스_급상승_v1.md). 0006 다음에 실행한다. 여러 번 실행해도 안전.
-- 모임: 누구나 만들고(로그인), 가입한 사람만 그 안에 글을 쓴다. 읽기는 공개 (카페의 '전체 공개' 모임).
-- 뉴스: 공식 API(네이버 검색 API) 결과의 제목·링크·언론사·요약·날짜만 저장한다. 기사 본문은 저장하지 않고 원문으로 연결한다.

create table if not exists community_clubs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 30),
  topic        text not null check (topic in ('diet', 'halal', 'vegetarian', 'meat', 'collab', 'korean', 'chinese', 'western', 'japanese', 'etc')),
  description  text not null check (char_length(description) between 1 and 300),
  cover        jsonb,                                  -- {url, path} (Storage 버킷 community/clubs/…)
  owner_id     uuid not null references auth.users (id) on delete cascade,
  owner_name   text not null check (char_length(owner_name) between 1 and 40),
  member_count int not null default 0,
  post_count   int not null default 0,
  last_post_at timestamptz,
  status       text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at   timestamptz not null default now()
);
-- 같은 이름 모임은 하나만 (대소문자·공백 무시)
create unique index if not exists community_clubs_name_idx on community_clubs (lower(regexp_replace(name, '\s+', '', 'g')));
create index if not exists community_clubs_topic_idx on community_clubs (topic, member_count desc) where status = 'visible';

create table if not exists community_club_members (
  club_id   uuid not null references community_clubs (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists community_club_members_user_idx on community_club_members (user_id);
create index if not exists community_club_members_at_idx on community_club_members (joined_at);

-- 글은 게시판(club_id 없음) 또는 모임 안(club_id)
alter table community_posts add column if not exists club_id uuid references community_clubs (id) on delete cascade;
create index if not exists community_posts_club_idx on community_posts (club_id, created_at desc) where status = 'visible';

-- 카운터: 회원 수 · 글 수 · 마지막 글 시각
create or replace function community_club_bump() returns trigger language plpgsql security definer set search_path = public as $$
declare
  d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'community_club_members' then
    update community_clubs set member_count = greatest(0, member_count + d) where id = coalesce(new.club_id, old.club_id);
  elsif coalesce(new.club_id, old.club_id) is not null then
    update community_clubs
      set post_count = greatest(0, post_count + d),
          last_post_at = case when tg_op = 'INSERT' then new.created_at else last_post_at end
      where id = coalesce(new.club_id, old.club_id);
  end if;
  return null;
end $$;
revoke all on function community_club_bump() from public, anon, authenticated;

drop trigger if exists community_club_members_count on community_club_members;
drop trigger if exists community_club_posts_count on community_posts;
create trigger community_club_members_count after insert or delete on community_club_members for each row execute function community_club_bump();
create trigger community_club_posts_count after insert or delete on community_posts for each row execute function community_club_bump();

alter table community_clubs        enable row level security;
alter table community_club_members enable row level security;
drop policy if exists "public visible clubs" on community_clubs;
create policy "public visible clubs" on community_clubs for select using (status = 'visible');
-- 회원 목록·가입 쓰기는 서버(service_role)만

-- ── 뉴스
create table if not exists news_articles (
  id           uuid primary key default gen_random_uuid(),
  url          text not null unique,
  title        text not null check (char_length(title) between 1 and 300),
  source       text,
  snippet      text check (char_length(snippet) <= 300),
  category     text not null check (category in ('food', 'culture')),
  provider     text not null check (provider in ('naver', 'google_rss')),
  query        text,
  terms        text[] not null default '{}',   -- 제목에서 찾은 음식 키워드 (lib/trends/keywords.ts)
  food_slugs   text[] not null default '{}',   -- 그중 DB 음식
  published_at timestamptz not null,
  fetched_at   timestamptz not null default now()
);
create index if not exists news_articles_pub_idx on news_articles (published_at desc);
create index if not exists news_articles_cat_idx on news_articles (category, published_at desc);
create index if not exists news_articles_fetched_idx on news_articles (fetched_at desc);

alter table news_articles enable row level security;
drop policy if exists "public news" on news_articles;
create policy "public news" on news_articles for select using (true);

-- 보관: 60일 (pg_cron 으로 select purge_old_news();)
create or replace function purge_old_news(keep_days int default 60) returns bigint
language sql security definer set search_path = public as $$
  with d as (delete from news_articles where published_at < now() - make_interval(days => keep_days) returning 1)
  select count(*) from d;
$$;
revoke all on function purge_old_news(int) from public, anon, authenticated;
