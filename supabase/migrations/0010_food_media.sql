-- 0010: 음식 미디어 — 갤러리 사진 · 유튜브 영상. s10_gallery.py / s11_youtube.py 결과 보관처.
-- preview 모드는 apps/web/lib/preview/media.json 을 쓰고, live 모드는 이 테이블을 조인한다.
-- RLS: anon 은 verified 음식에 묶인 미디어만 읽는다 (foods RLS 와 짝).

create table if not exists food_photos (
  food_id     uuid not null references foods (id) on delete cascade,
  url         text not null,
  thumb       text not null,
  title       text,
  source      text not null check (source in ('wikimedia_commons', 'openverse', 'web')),
  license     text not null,
  credit_url  text,
  author      text,
  fit         real not null default 0,         -- 0~1, s10 이름 매칭 점수
  rank        int  not null default 0,         -- 음식 안에서 보여줄 순서 (낮을수록 먼저)
  updated_at  timestamptz not null default now(),
  primary key (food_id, url)
);
create index if not exists food_photos_food_rank_idx on food_photos (food_id, rank);

-- 음식당 유튜브는 한 개만 노출 (s11 이 조회수·길이·이름 매칭을 통과한 최고점 하나를 고른다)
create table if not exists food_youtube (
  food_id       uuid primary key references foods (id) on delete cascade,
  video_id      text not null,
  url           text not null,
  title         text not null,
  channel       text not null,
  duration_sec  int  not null,
  view_count    bigint not null,
  fit           real,
  updated_at    timestamptz not null default now()
);

alter table food_photos  enable row level security;
alter table food_youtube enable row level security;

drop policy if exists food_photos_read  on food_photos;
drop policy if exists food_youtube_read on food_youtube;
create policy food_photos_read  on food_photos  for select using (
  exists (select 1 from foods f where f.id = food_photos.food_id and f.verified = true)
);
create policy food_youtube_read on food_youtube for select using (
  exists (select 1 from foods f where f.id = food_youtube.food_id and f.verified = true)
);
