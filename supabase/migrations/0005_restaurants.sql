-- 0005: 한국에서 맛보기 — 주변 음식점 (docs/design/12_한국에서_맛보기_지도.md). 0004 다음에 실행한다. 여러 번 실행해도 안전.
-- 원칙: 공식 API·공개 데이터만. 쿠폰·이벤트·공동구매·포장은 공식 API 가 없어 사장님·어드민 등록 + 이용자 제보(검수 후 공개)로만 채운다.
-- 사용자 좌표는 어디에도 저장하지 않는다 (검색 대리 호출에만 쓰고 버림).
--
-- ⚠️ 약관 때문에 저장하지 않는 것 (확인일 2026-10-02, 근거는 docs/design/12 §약관):
--  · 카카오 로컬 API 결과: DB 에 남길 수 있는 건 장소 id 와 place_url 뿐. 이름·주소·전화·좌표는 저장 금지
--    (카카오 운영정책 제5조 제20항, 데브톡 공식 답변 https://devtalk.kakao.com/t/topic/151720 · 2026-09-17).
--    → 아래 name·address·lat·lng 는 사장님·어드민이 "직접 받은" 정보만 넣는다(info_source). 카카오 응답을 복사해 넣지 않는다.
--  · Google Places: place_id 만 무기한 저장 가능. rating·userRatingCount·takeout 등은 캐시·저장 금지
--    (Google Maps Platform Service Specific Terms §14.3 · https://cloud.google.com/maps-platform/terms/maps-service-terms).
--    → 처음 설계의 google_rating/google_rating_count/takeout/delivery 컬럼은 만들지 않는다. 화면에 보일 때마다 새로 받는다.

create table if not exists restaurants (
  id                uuid primary key default gen_random_uuid(),
  kakao_place_id    text not null unique,             -- 저장 허용 (카카오 공식 답변)
  place_url         text,                             -- 저장 허용
  -- 아래는 사장님·어드민이 직접 받은 정보만 (카카오·Google 응답 복사 금지). 비어 있으면 화면은 카카오 실시간 결과를 쓴다
  name              text,
  category          text,
  address           text,
  road_address      text,
  phone             text,
  lat               double precision,
  lng               double precision,
  info_source       text check (info_source in ('owner', 'admin')),
  -- Google: place_id 만 저장 (다음 조회를 싼 Place Details 로). checked_at 은 "찾아봤는데 없음"을 7일 기억하는 용도
  google_place_id   text,
  google_checked_at timestamptz,
  -- 공정위 가맹 브랜드 목록(franchise_brands)과 이름을 맞춘 결과 — 우리 판단값
  franchise_brand   text,
  is_franchise      boolean,                          -- null = 브랜드 목록 동기화 전
  updated_at        timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index if not exists restaurants_lat_lng_idx on restaurants (lat, lng) where lat is not null;

-- 어느 음식점이 어느 음식을 파는지. search = 검색어로 추정, admin = 어드민 확인, report = 이용자 제보
create table if not exists restaurant_foods (
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  food_id       uuid not null references foods (id) on delete cascade,
  source        text not null default 'search' check (source in ('search', 'admin', 'report')),
  confirmed     boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, food_id)
);
create index if not exists restaurant_foods_food_idx on restaurant_foods (food_id) where confirmed;

-- 혜택: 쿠폰·이벤트·공동구매·포장 (+ info = 이용자 정보 정정 제보, 화면 배지 없음)
create table if not exists restaurant_offers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  kind          text not null check (kind in ('coupon', 'event', 'group_buy', 'takeout', 'info')),
  title         text not null check (char_length(title) between 1 and 80),
  detail        text check (char_length(detail) <= 500),
  starts_at     timestamptz,
  ends_at       timestamptz,
  source        text not null check (source in ('owner', 'admin', 'report')),
  verified      boolean not null default false,
  verified_by   uuid references auth.users (id) on delete set null,
  verified_at   timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index if not exists restaurant_offers_restaurant_idx on restaurant_offers (restaurant_id);
create index if not exists restaurant_offers_queue_idx on restaurant_offers (created_at desc) where not verified;

-- 푸디 앱 평점: 로그인 사용자 1인 1표(음식점당), 고치면 덮어쓴다
create table if not exists restaurant_ratings (
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  food_id       uuid references foods (id) on delete set null,
  stars         smallint not null check (stars between 1 and 5),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

-- 공정거래위원회 가맹사업 정보공개 브랜드 목록 캐시 (어드민 "가맹 브랜드 동기화", 이용허락범위 제한 없음)
create table if not exists franchise_brands (
  normalized        text primary key,               -- lib/places/franchise.ts normalizeBrand()
  brand_name        text not null,
  company           text,                           -- 가맹본부 법인명 (대표자 이름 같은 개인 정보는 받지 않는다)
  industry          text,                           -- 업종 중분류 (한식·치킨·커피 …)
  source_updated_at text,                           -- 공정위 데이터 기준 연도 (jngBizCrtraYr)
  synced_at         timestamptz not null default now()
);

-- 평균 평점 뷰: 화면은 평균과 개수만 쓴다 (누가 몇 점 줬는지는 공개하지 않는다)
create or replace view restaurant_rating_stats as
  select restaurant_id, round(avg(stars)::numeric, 2) as avg, count(*)::int as count
  from restaurant_ratings group by restaurant_id;

-- ── RLS
alter table restaurants        enable row level security;
alter table restaurant_foods   enable row level security;
alter table restaurant_offers  enable row level security;
alter table restaurant_ratings enable row level security;
alter table franchise_brands   enable row level security;

drop policy if exists "public restaurants"       on restaurants;
drop policy if exists "public restaurant_foods"  on restaurant_foods;
drop policy if exists "public verified offers"   on restaurant_offers;
drop policy if exists "report offers"            on restaurant_offers;
drop policy if exists "own ratings read"         on restaurant_ratings;
drop policy if exists "own ratings insert"       on restaurant_ratings;
drop policy if exists "own ratings update"       on restaurant_ratings;
drop policy if exists "public franchise brands"  on franchise_brands;

create policy "public restaurants"      on restaurants       for select using (true);
create policy "public restaurant_foods" on restaurant_foods  for select using (true);
create policy "public verified offers"  on restaurant_offers for select using (verified);
-- 제보: 로그인 사용자만, 본인 이름으로, 확인 전 상태로만 넣을 수 있다 (사장님·어드민 등록은 service_role)
create policy "report offers" on restaurant_offers for insert to authenticated
  with check (source = 'report' and verified = false and created_by = auth.uid() and verified_by is null and verified_at is null);
create policy "own ratings read"   on restaurant_ratings for select to authenticated using (auth.uid() = user_id);
create policy "own ratings insert" on restaurant_ratings for insert to authenticated with check (auth.uid() = user_id);
create policy "own ratings update" on restaurant_ratings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public franchise brands" on franchise_brands for select using (true);
-- 그 밖의 쓰기(음식점 id 저장·혜택 등록·검수·브랜드 동기화)는 서버 라우트가 권한 확인 후 service_role 로만 한다

-- 뷰는 소유자 권한으로 집계만 돌려준다 (개별 행·user_id 는 보이지 않음). 서버는 service_role 로 읽는다
revoke all on restaurant_rating_stats from anon, authenticated;
grant select on restaurant_rating_stats to anon, authenticated;
