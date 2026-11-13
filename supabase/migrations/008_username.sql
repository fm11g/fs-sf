-- 008: 이메일 대신 아이디로 로그인
-- 아이디만 있는 계정은 로그인용 내부 주소(아이디@users.example.com)로 Supabase 계정을 만든다. 메일은 보내지 않음.
alter table public.admins add column if not exists username text;
create unique index if not exists admins_username_key on public.admins (lower(username)) where username is not null;
-- 기존 계정: 이메일 앞부분을 아이디로 (겹치면 비워 둠 → 직원·권한 화면에서 지정)
with c as (
  select email, lower(split_part(email, '@', 1)) as u,
         row_number() over (partition by lower(split_part(email, '@', 1)) order by (role = 'owner') desc, created_at) as rn
  from public.admins where username is null
)
update public.admins a set username = c.u
from c
where a.email = c.email and c.rn = 1
  and c.u ~ '^[a-z0-9][a-z0-9._-]{2,19}$'
  and not exists (select 1 from public.admins b where lower(b.username) = c.u);
