-- 0016 의미 검색 v2 (docs/design/19 §5 · docs/design/20 최적화). 여러 번 실행해도 안전.
-- match_foods(v1)는 '0.55·유사도 + 0.30·취향 + 가산'으로 정렬해서 HNSW 인덱스(food_embeddings_hnsw)를 못 탄다 → 1만 개를 매번 전부 훑는다.
-- 앱(lib/foodi/rank.ts)이 점수를 따로 계산하므로 DB 는 '가까운 순 후보'만 주면 된다 → 거리순 정렬 + LIMIT 으로 인덱스를 탄다.
-- 앱은 이 함수가 있으면 쓰고, 없으면 v1 을 순수 유사도 순으로 쓴다 (lib/db/foodis-repo.ts) — 실행 전·후 모두 동작한다.

create or replace function match_foods_v2(
  query_embedding vector(1536),
  exclude_food_ids uuid[] default '{}',
  need_vegan boolean default false,
  need_vegetarian boolean default false,
  need_halal boolean default false,
  need_gluten_free boolean default false,
  need_dairy_free boolean default false,
  avoid_allergens text[] default '{}',
  country_filter text default null,
  match_count int default 120
) returns table (food_id uuid, vec_sim float)
language sql stable
-- 기본 ef_search(40)면 후보가 40개에서 끊긴다 → 후보 풀(120)보다 넉넉하게
set hnsw.ef_search = 300
as $$
  select e.food_id, (1 - (e.embedding <=> query_embedding))::float as vec_sim
    from food_embeddings e
    join foods f on f.id = e.food_id
   where f.verified
     and not (f.id = any(exclude_food_ids))
     and (country_filter is null or f.country_code = country_filter)
     and (not need_vegan       or f.diet_vegan       in ('yes','depends'))
     and (not need_vegetarian  or f.diet_vegetarian  in ('yes','depends'))
     and (not need_halal       or f.diet_halal       in ('yes','depends'))
     and (not need_gluten_free or f.diet_gluten_free in ('yes','depends'))
     and (not need_dairy_free  or f.diet_dairy_free  in ('yes','depends'))
     and not (f.allergens && avoid_allergens)
   order by e.embedding <=> query_embedding
   limit match_count;
$$;

grant execute on function match_foods_v2 to anon, authenticated, service_role;
