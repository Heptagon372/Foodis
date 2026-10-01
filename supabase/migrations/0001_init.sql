-- FOODIS initial schema (04 문서 + 07 PRD 보강 반영)
-- 실행: Supabase SQL Editor 또는 `supabase db push`

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ───────────────────────── enums
do $$ begin
  create type diet_level as enum ('yes', 'depends', 'no', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type relation_type as enum ('similar_taste', 'shares_ingredient', 'same_technique', 'historical_link', 'regional_variant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type passport_status as enum ('explored', 'tried', 'liked', 'saved');
exception when duplicate_object then null; end $$;

-- ───────────────────────── FOOD DB (사실 영역)
create table if not exists countries (
  code            text primary key,              -- ISO 3166-1 alpha-2
  name_ko         text not null,
  name_en         text not null,
  region          text not null,                 -- East Asia, Horn of Africa ...
  continent_group text not null,                 -- asia / europe / mena_africa / americas
  flag_emoji      text not null,
  accent_color    text not null,                 -- hex, 국기 주색 채도 낮춤
  culture_summary text,
  dining_style    text,
  wikidata_qid    text,
  updated_at      timestamptz not null default now()
);

create table if not exists foods (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name_ko           text not null,
  name_en           text not null,
  name_local        text,
  country_code      text not null references countries(code),
  region_in_country text,
  origin_note       text,                         -- 기원 논쟁·다국가 음식 메모
  summary           text,                         -- 1~2문장 (음성용)
  history           text,
  culture_story     text,                         -- 60초 분량
  cooking_method    text,
  taste_tags        text[] not null default '{}',
  course_type       text,
  image_url         text,
  image_credit      text,                         -- 작가·라이선스 (CC BY-SA 등)
  diet_vegan        diet_level not null default 'unknown',
  diet_vegetarian   diet_level not null default 'unknown',
  diet_halal        diet_level not null default 'unknown',
  diet_gluten_free  diet_level not null default 'unknown',
  diet_dairy_free   diet_level not null default 'unknown',
  allergens         text[] not null default '{}',
  diet_note         text,
  wikidata_qid      text unique,
  wikipedia_en      text,
  wikipedia_ko      text,
  verified          boolean not null default false,
  created_by        uuid,
  verified_by       uuid,
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists foods_country_idx on foods(country_code);
create index if not exists foods_taste_idx on foods using gin(taste_tags);
create index if not exists foods_name_trgm on foods using gin((name_ko || ' ' || name_en) gin_trgm_ops);

create table if not exists ingredients (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name_ko       text not null,
  name_en       text not null,
  category      text,                             -- grain, legume, meat, seafood, dairy, vegetable, spice ...
  origin_region text,
  allergen      text,                             -- nuts, shellfish, peanut, egg, soy, wheat, dairy, fish, sesame
  animal_origin boolean,                          -- 비건 판정 보조
  pork          boolean,                          -- 할랄 판정 보조
  wikidata_qid  text unique
);

create table if not exists food_ingredients (
  food_id       uuid not null references foods(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  role          text not null default 'main',     -- main / seasoning / optional
  primary key (food_id, ingredient_id)
);

create table if not exists food_relations (
  id            uuid primary key default gen_random_uuid(),
  from_food_id  uuid not null references foods(id) on delete cascade,
  to_food_id    uuid not null references foods(id) on delete cascade,
  relation_type relation_type not null,
  description   text not null,
  strength      smallint not null default 3 check (strength between 1 and 5),
  verified      boolean not null default false,
  unique (from_food_id, to_food_id, relation_type),
  check (from_food_id <> to_food_id)
);

create table if not exists sources (
  id          uuid primary key default gen_random_uuid(),
  food_id     uuid references foods(id) on delete cascade,
  country_code text references countries(code) on delete cascade,
  field       text not null,                      -- summary / history / diet_halal ...
  url         text not null,
  title       text,
  source_type text not null,                      -- wikidata / wikipedia / gov / academic / media / themealdb
  license     text,                               -- CC0 / CC BY-SA 4.0 / KOGL ...
  accessed_at date not null default current_date,
  unique (food_id, field, url)
);
create index if not exists sources_food_idx on sources(food_id);

create table if not exists food_embeddings (
  food_id    uuid primary key references foods(id) on delete cascade,
  embedding  vector(1536) not null,
  text_used  text not null,
  model      text not null default 'text-embedding-3-small',
  updated_at timestamptz not null default now()
);
create index if not exists food_embeddings_hnsw on food_embeddings using hnsw (embedding vector_cosine_ops);

-- ───────────────────────── USER DB (역이용 영역)
create table if not exists profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale       text not null default 'ko',
  created_at   timestamptz not null default now()
);

create table if not exists dietary_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  vegan       boolean not null default false,
  vegetarian  boolean not null default false,
  halal       boolean not null default false,
  gluten_free boolean not null default false,
  dairy_free  boolean not null default false,
  allergens   text[] not null default '{}',
  updated_at  timestamptz not null default now()
);

create table if not exists passport_entries (
  user_id    uuid not null references auth.users(id) on delete cascade,
  food_id    uuid not null references foods(id) on delete cascade,
  status     passport_status not null,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id, status)
);

create table if not exists food_dna (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  tag_weights jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table if not exists conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  input_mode text not null default 'voice',
  intent     text,
  user_text  text not null,
  ai_json    jsonb,
  food_ids   uuid[] not null default '{}',
  validated  boolean,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  food_id    uuid not null references foods(id) on delete cascade,
  field      text not null,
  message    text,
  status     text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role    text not null check (role in ('editor', 'reviewer', 'admin'))
);

-- 외부 API 사용량·비용 추적 (11 상세 아키텍처)
create table if not exists api_usage (
  id         bigserial primary key,
  provider   text not null,                       -- anthropic / openai / google_tts / kakao ...
  operation  text not null,                       -- intent / generate / tts / stt / embed / places
  units      numeric not null,                    -- tokens / seconds / chars / calls
  unit_type  text not null,
  cost_usd   numeric(10, 6),
  conversation_id uuid references conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 응답 캐시 (데모 질문, TTS 오디오 키)
create table if not exists response_cache (
  cache_key  text primary key,                    -- sha256(normalized_text + user_profile_hash)
  kind       text not null,                       -- answer / tts
  payload    jsonb,
  storage_path text,                              -- TTS mp3 in Supabase Storage
  hits       integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ───────────────────────── 신고 3건 → 해당 식이 필드 unknown 자동 강등
create or replace function demote_on_reports() returns trigger language plpgsql as $$
declare open_cnt int;
begin
  select count(*) into open_cnt from reports
   where food_id = new.food_id and field = new.field and status = 'open';
  if open_cnt >= 3 and new.field in ('diet_vegan','diet_vegetarian','diet_halal','diet_gluten_free','diet_dairy_free') then
    execute format('update foods set %I = %L, updated_at = now() where id = %L', new.field, 'unknown', new.food_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_demote_on_reports on reports;
create trigger trg_demote_on_reports after insert on reports
  for each row execute function demote_on_reports();

-- ───────────────────────── 하이브리드 검색 RPC (RAG ②~④)
create or replace function match_foods(
  query_embedding vector(1536),
  user_tag_weights jsonb default '{}',
  exclude_food_ids uuid[] default '{}',
  explored_countries text[] default '{}',
  need_vegan boolean default false,
  need_vegetarian boolean default false,
  need_halal boolean default false,
  need_gluten_free boolean default false,
  need_dairy_free boolean default false,
  avoid_allergens text[] default '{}',
  country_filter text default null,
  match_count int default 5
) returns table (food_id uuid, score float, vec_sim float, tag_score float)
language sql stable as $$
  with base as (
    select f.id, f.country_code, f.taste_tags,
           1 - (e.embedding <=> query_embedding) as vec_sim
      from foods f join food_embeddings e on e.food_id = f.id
     where f.verified
       and not (f.id = any(exclude_food_ids))
       and (country_filter is null or f.country_code = country_filter)
       and (not need_vegan       or f.diet_vegan       in ('yes','depends'))
       and (not need_vegetarian  or f.diet_vegetarian  in ('yes','depends'))
       and (not need_halal       or f.diet_halal       in ('yes','depends'))
       and (not need_gluten_free or f.diet_gluten_free in ('yes','depends'))
       and (not need_dairy_free  or f.diet_dairy_free  in ('yes','depends'))
       and not (f.allergens && avoid_allergens)
  ), scored as (
    select b.id, b.vec_sim,
           coalesce((select sum((user_tag_weights ->> t)::float) from unnest(b.taste_tags) t
                      where user_tag_weights ? t), 0) / greatest(cardinality(b.taste_tags), 1) as tag_score,
           case when b.country_code = any(explored_countries) then 0 else 0.3 end as unexplored_bonus
      from base b
  )
  select id, (0.55 * vec_sim + 0.30 * tag_score + unexplored_bonus)::float as score, vec_sim::float, tag_score::float
    from scored order by score desc limit match_count;
$$;

-- ───────────────────────── RLS
alter table profiles          enable row level security;
alter table dietary_profiles  enable row level security;
alter table passport_entries  enable row level security;
alter table food_dna          enable row level security;
alter table conversations     enable row level security;
alter table reports           enable row level security;

create policy "own profile"   on profiles         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own dietary"   on dietary_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own passport"  on passport_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own dna"       on food_dna         for select using (auth.uid() = user_id);
create policy "own convo"     on conversations    for select using (auth.uid() = user_id);
create policy "insert report" on reports          for insert with check (auth.uid() = user_id);

-- 공개 읽기: 검수된 콘텐츠만
alter table countries        enable row level security;
alter table foods            enable row level security;
alter table ingredients      enable row level security;
alter table food_ingredients enable row level security;
alter table food_relations   enable row level security;
alter table sources          enable row level security;

create policy "public countries"  on countries        for select using (true);
create policy "public foods"      on foods            for select using (verified);
create policy "public ingredients" on ingredients     for select using (true);
create policy "public food_ing"   on food_ingredients for select using (true);
create policy "public relations"  on food_relations   for select using (verified);
create policy "public sources"    on sources          for select using (true);
-- 쓰기는 service_role(서버·수집 스크립트)만. /admin 은 서버 라우트에서 admin_roles 확인 후 service_role로 처리.
