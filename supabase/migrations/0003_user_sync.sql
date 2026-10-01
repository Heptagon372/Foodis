-- 0003: 회원 동기화 (F-AUTH-01·02). 0001 → 0002 다음에 실행한다. 여러 번 실행해도 안전.
-- 게스트가 브라우저에 쌓은 온보딩 취향·온보딩 완료 여부를 계정에도 남긴다 (식이·Passport·Food DNA 는 0001 테이블 사용)
alter table profiles add column if not exists tastes text[] not null default '{}';
alter table profiles add column if not exists onboarded boolean not null default false;
alter table profiles add column if not exists updated_at timestamptz not null default now();

-- 내 Passport 를 최근 순으로 읽는 인덱스
create index if not exists passport_entries_user_idx on passport_entries (user_id, created_at desc);
