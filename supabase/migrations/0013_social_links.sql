-- 0013: 소셜 계정 연결 — 인스타그램 로그인 · 계정 연결 (docs/design/06 §7). 0003 이후 아무 때나 실행 가능. 여러 번 실행해도 안전.
-- Supabase 에 인스타그램 제공자가 없어 OAuth 를 직접 돌고(app/auth/instagram/*), "인스타 계정 ↔ FOODIS 회원" 을 여기에 적는다.
-- 카카오·Google 연결은 Supabase 의 auth.identities 가 맡는다 (Allow manual linking). 인스타 토큰은 저장하지 않는다 — 신원(id)과 표시용 이름·사진만.

create table if not exists social_links (
  provider     text not null,                 -- 'instagram'
  provider_uid text not null,                 -- 인스타그램 사용자 id (17자리 숫자라 문자열로)
  user_id      uuid not null references auth.users (id) on delete cascade,
  username     text,                          -- @아이디 (화면 표시용)
  avatar_url   text,
  created_at   timestamptz not null default now(),
  primary key (provider, provider_uid),       -- 인스타 계정 하나는 회원 한 명에게만
  unique (user_id, provider)                  -- 회원 한 명은 제공자마다 하나만
);

-- 본인 행만 읽기. 쓰기·지우기 정책은 두지 않는다 — 서버(service_role)만 쓴다
alter table social_links enable row level security;
drop policy if exists "own social links" on social_links;
create policy "own social links" on social_links for select using (auth.uid() = user_id);
