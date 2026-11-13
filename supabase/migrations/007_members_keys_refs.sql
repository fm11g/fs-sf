-- 007: 직원 계정·권한 블록 / 연결·키(관리자 페이지에서 입력) / 참고 영상 학습

-- ── 1. 계정: 대표(owner) · 직원(staff) ─────────────────────────────
alter table public.admins add column if not exists role text not null default 'owner';
alter table public.admins add column if not exists name text;
alter table public.admins add column if not exists perms jsonb not null default '{}'::jsonb;  -- {"board":"view","step:script":"work",...}
alter table public.admins add column if not exists active boolean not null default true;
alter table public.admins add column if not exists last_login_at timestamptz;
alter table public.admins add column if not exists created_by text;
do $$ begin
  alter table public.admins add constraint admins_role_chk check (role in ('owner', 'staff'));
exception when duplicate_object then null; end $$;

-- 예전 SQL 의 자리표시자 계정 정리 (첫 가입 화면이 뜨도록)
delete from public.admins where email in ('your-email@example.com', 'you@example.com');

-- 브라우저에서 테이블을 직접 읽고 쓰는 권한은 대표만.
-- 직원은 서버 API 를 거쳐서 권한 블록에 해당하는 데이터만 받는다.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where email = auth.jwt() ->> 'email' and role = 'owner' and active
  );
$$;

-- ── 2. 연결·키 (API 키·토큰·비밀번호) ───────────────────────────────
-- 정책 없음 = 브라우저에서 절대 접근 불가, 서버(service role)·워커만 읽음
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

-- ── 3. 참고 영상 (내가 발견한 좋은 영상 → 분석 → 학습) ───────────────
create table if not exists public.ref_videos (
  id bigserial primary key,
  kind text not null default 'youtube' check (kind in ('youtube', 'upload', 'link')),
  url text,
  storage_path text,
  title text,
  channel text,
  note text,                                  -- 왜 좋은지 (내 메모)
  tags text[] not null default '{}',
  weight int not null default 3 check (weight between 1 and 5),  -- 학습 반영 강도
  learn_steps text[] not null default '{plan,script,design,copy}',
  active boolean not null default true,       -- 학습에 사용
  status text not null default 'queued' check (status in ('queued', 'analyzing', 'ready', 'failed')),
  error text,
  meta jsonb,                                 -- 길이·조회수·좋아요·해상도 등
  transcript text,
  cuts jsonb,                                 -- 컷 전환 시각(초) 배열
  frames jsonb,                               -- 대표 프레임 이미지 URL 배열
  analysis jsonb,                             -- 구조·훅·자막·색·모션·재현 규칙
  uses int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists ref_videos_active_idx on public.ref_videos (active, status, weight desc);
drop trigger if exists ref_videos_touch on public.ref_videos;
create trigger ref_videos_touch before update on public.ref_videos for each row execute function public.touch_updated_at();
alter table public.ref_videos enable row level security;
drop policy if exists admin_all on public.ref_videos;
create policy admin_all on public.ref_videos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- "이 영상처럼 만들기" 로 생긴 콘텐츠
alter table public.contents add column if not exists reference_id bigint references public.ref_videos (id) on delete set null;
