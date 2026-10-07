-- 0015 알레르기 표기 통일 (docs/design/19 §2). 여러 번 실행해도 안전.
-- 1만 개 정리본(2026-10-07)은 allergens 를 한국어(우유·밀·계란 …)로, 어드민·초기 데이터는 영어 키(dairy·wheat·egg …)로 적었다.
-- 사용자가 고르는 알레르기는 영어 키라서 한국어 값은 match_foods 의 `allergens && avoid_allergens` 비교에 걸리지 않았다.
-- 앱은 읽을 때 표준 키로 바꾸고(lib/diet/allergens.ts) SQL 에는 두 표기를 다 넘기므로 이 마이그레이션 없이도 안전하다.
-- 이 파일은 DB 자체를 정리한다 → 어드민 편집 화면의 알레르기 칩이 1만 개 음식에서도 제대로 켜진다.
-- 표는 lib/diet/allergens.ts SYNONYMS 와 같다 (모르는 표기는 그대로 둔다).

create or replace function canon_allergen(a text) returns text language sql immutable as $$
  select case lower(trim(a))
    when '견과' then 'nuts' when '견과류' then 'nuts' when '호두' then 'nuts' when '잣' then 'nuts' when '아몬드' then 'nuts'
    when '헤이즐넛' then 'nuts' when '캐슈너트' then 'nuts' when '피스타치오' then 'nuts'
    when '땅콩' then 'peanut'
    when '갑각류' then 'shellfish' when '새우' then 'shellfish' when '게' then 'shellfish' when '가재' then 'shellfish' when '랍스터' then 'shellfish'
    when '어류' then 'fish' when '생선' then 'fish' when '고등어' then 'fish'
    when '계란' then 'egg' when '달걀' then 'egg' when '난류' then 'egg' when '알류' then 'egg'
    when '대두' then 'soy' when '콩' then 'soy' when '두류' then 'soy'
    when '밀' then 'wheat' when '밀가루' then 'wheat'
    when '우유' then 'dairy' when '유제품' then 'dairy' when '유당' then 'dairy'
    when '참깨' then 'sesame' when '깨' then 'sesame'
    when '조개류' then 'mollusc' when '오징어' then 'mollusc' when '연체류' then 'mollusc' when '홍합' then 'mollusc'
    when '굴' then 'mollusc' when '전복' then 'mollusc' when '조개' then 'mollusc'
    when '겨자' then 'mustard'
    when '셀러리' then 'celery'
    when '메밀' then 'buckwheat'
    when '아황산류' then 'sulfite' when '아황산염' then 'sulfite'
    when '보리' then 'barley'
    when '호밀' then 'rye'
    else trim(a)
  end
$$;

update foods f
   set allergens = coalesce((select array_agg(distinct canon_allergen(x)) from unnest(f.allergens) x), '{}'),
       updated_at = now()
 where exists (select 1 from unnest(f.allergens) x where canon_allergen(x) <> x);

-- match_foods 의 알레르기 겹침(&&) 비교용
create index if not exists foods_allergens_idx on foods using gin(allergens);
