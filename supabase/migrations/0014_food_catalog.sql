-- 0014: 음식 카탈로그를 SQL 로 (docs/design/22). 0001 이후 아무 때나 실행 가능. 여러 번 실행해도 안전.
-- 지금까지 화면(홈·지도·맛집탐방·라디오·국가·검색)은 공개 음식 1만여 개(약 7MB)를 요청마다 통째로 받아 앱에서 걸렀고,
-- 나라 안 유명도 순위는 DB 밖 JSON(apps/web/lib/content/fame.json)에 있었다.
-- → 순위를 foods 컬럼으로 옮기고, 화면이 필요한 만큼만 Postgres 에서 골라 받게 뷰·함수를 둔다.
-- 앱은 food_cards 뷰가 보여야 live 로 붙는다 (lib/content/index.ts). 실행 뒤 `pnpm db:fame` 으로 순위를 채운다.

-- ── 유명도: fame_rank = 나라 안 순위(1 = 가장 대표적, 사람이 고른 순서 → Wikidata 언어판 수), popularity = Wikidata 언어판 수(세계적 유명도)
alter table foods add column if not exists fame_rank  int;
alter table foods add column if not exists popularity int;
create index if not exists foods_country_fame_idx on foods (country_code, fame_rank);

-- ── 카드 한 장에 필요한 것만 평평하게 (나라 이름·국기·색 포함 — 조인 없이 바로 쓴다)
-- fame_rank 는 '나라 안 실제 순위'로 다시 매긴다: 순위가 아직 없는 새 음식도 언어판 수 → 사진 유무 → slug 순으로 뒤에 붙어 빈칸이 없다.
-- security_invoker: 부르는 사람의 RLS 를 그대로 따른다 (anon 은 검수된 음식만). verified 조건은 service_role 로 불러도 같게 하려고 한 번 더.
-- 컬럼은 끝에 덧붙이기만 한다 — search_food_cards 가 이 뷰의 행 모양을 돌려줘서, 뷰를 지우려면 함수부터 지워야 한다.
create or replace view food_cards with (security_invoker = on) as
select
  f.id, f.slug, f.name_ko, f.name_en, f.country_code,
  f.summary, f.taste_tags, f.image_url, f.image_credit, f.allergens,
  f.diet_vegan, f.diet_vegetarian, f.diet_halal, f.diet_gluten_free, f.diet_dairy_free,
  c.name_ko as country_name, c.flag_emoji, c.accent_color, c.region, c.continent_group,
  f.popularity,
  (row_number() over (
    partition by f.country_code
    order by f.fame_rank nulls last, f.popularity desc nulls last, (f.image_url is not null) desc, f.slug
  ))::int as fame_rank
from foods f
join countries c on c.code = f.country_code
where f.verified;

-- ── 나라별 음식 수 (지도 색칠·라디오 채널 준비 여부)
create or replace view country_food_counts with (security_invoker = on) as
select country_code, count(*)::int as food_count
from foods
where verified
group by country_code;

grant select on food_cards, country_food_counts to anon, authenticated, service_role;

-- ── 이름 검색: 한국어·영어 이름 부분 일치, 띄어쓰기 무시 ("팟타이" 로 "팟 타이", "pad thai" 로 "Pad Thai").
-- 띄어쓰기를 뺀 이름에 트라이그램 인덱스를 둔다 (세 글자 이상부터 인덱스를 탄다 — 두 글자 검색은 1만 개를 훑어도 수십 ms).
-- 정확히 같은 이름 → 앞부분 일치 → 나라 안 유명도 순. %·_ 는 글자 그대로 찾는다.
create index if not exists foods_name_compact_trgm on foods
  using gin ((replace(name_ko, ' ', '') || '|' || replace(name_en, ' ', '')) gin_trgm_ops);

create or replace function search_food_cards(q text, lim int default 40)
returns setof food_cards
language sql stable
as $$
  with p as (
    select lower(replace(q, ' ', '')) as t,
           '%' || replace(replace(replace(replace(q, ' ', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  ),
  hit as (
    select f.id
      from foods f, p
     where f.verified
       and length(p.t) > 0
       and (replace(f.name_ko, ' ', '') || '|' || replace(f.name_en, ' ', '')) ilike p.pat
  )
  select c.*
    from food_cards c
    join hit on hit.id = c.id
   cross join p
   order by (lower(replace(c.name_ko, ' ', '')) = p.t or lower(replace(c.name_en, ' ', '')) = p.t) desc,
            (starts_with(lower(replace(c.name_ko, ' ', '')), p.t) or starts_with(lower(replace(c.name_en, ' ', '')), p.t)) desc,
            c.fame_rank,
            length(c.name_ko),
            c.slug
   limit least(greatest(coalesce(lim, 40), 1), 100);
$$;

grant execute on function search_food_cards(text, int) to anon, authenticated, service_role;

-- ── 순위 적재 (tools/gen-fame-rank.mjs 가 부른다): { "<slug>": { "rank": 1, "popularity": 87 }, ... }
-- 값이 바뀐 행만 고친다. 서버(service_role)만 부를 수 있다.
create or replace function set_food_fame(ranks jsonb)
returns int
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  update public.foods f
     set fame_rank = (r.value ->> 'rank')::int,
         popularity = (r.value ->> 'popularity')::int
    from jsonb_each(ranks) r
   where f.slug = r.key
     and (f.fame_rank is distinct from (r.value ->> 'rank')::int
          or f.popularity is distinct from (r.value ->> 'popularity')::int);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function set_food_fame(jsonb) from public, anon, authenticated;
grant execute on function set_food_fame(jsonb) to service_role;

-- PostgREST 가 새 뷰·함수를 바로 보게
notify pgrst, 'reload schema';
