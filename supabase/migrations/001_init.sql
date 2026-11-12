-- 오늘의 정책자금 숏폼 공장 — 초기 스키마
create extension if not exists pgcrypto;

-- 관리자 화이트리스트 ------------------------------------------------
create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = auth.jwt() ->> 'email');
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- 앱 설정 (단일 행) ---------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (id, value) values (1, jsonb_build_object(
  'brand', '오늘의 정책자금',
  'site_url', 'https://today-policy-fund.vercel.app',
  'voice_id', '',
  'tts_model', 's1',
  'tts_speed', 1.05,
  'auto_publish', false,
  'daily_enabled', true,
  'default_hashtags', jsonb_build_array('정책자금','소상공인','중소기업','정부지원금','오늘의정책자금'),
  'cta_text', '내 사업장 조건으로 받을 수 있는 정책자금 확인하기',
  'target', '연매출 5억 이상 제조업·중소기업 대표',
  'banned_phrases', jsonb_build_array('무조건 승인','100% 승인','누구나 대출','심사 없이','확정 지원')
)) on conflict (id) do nothing;

-- BGM 라이브러리 ------------------------------------------------------
create table if not exists public.bgm_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  mood text not null default 'hopeful',   -- urgent | calm | hopeful | serious
  url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 콘텐츠 (숏폼 1편 = 1행) --------------------------------------------
create table if not exists public.contents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  status text not null default 'draft',
  -- draft → researched → planned → scripted → designed → copied → landed → posted
  -- → rendering → rendered → approved → publishing → published | failed
  topic text,
  research jsonb,
  plan jsonb,
  script jsonb,
  design jsonb,
  copy jsonb,
  post jsonb,
  audio jsonb,
  images jsonb not null default '[]'::jsonb,
  video_url text,
  thumbnail_url text,
  bgm_id uuid references public.bgm_tracks(id) on delete set null,
  youtube_id text,
  instagram_id text,
  error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contents_status_idx on public.contents (status, created_at desc);
drop trigger if exists contents_touch on public.contents;
create trigger contents_touch before update on public.contents
  for each row execute function public.touch_updated_at();

-- 실행 로그 -----------------------------------------------------------
create table if not exists public.jobs (
  id bigserial primary key,
  content_id uuid references public.contents(id) on delete cascade,
  step text not null,
  status text not null,           -- running | done | failed
  message text,
  created_at timestamptz not null default now()
);
create index if not exists jobs_content_idx on public.jobs (content_id, created_at desc);

-- 랜딩 템플릿 (전체 HTML + data-slot 표시) ---------------------------
create table if not exists public.landing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  html text not null,
  slots jsonb not null default '[]'::jsonb,   -- [{key,label,max,attr,current}]
  asset_base text,                            -- 상대경로 에셋용 <base href>
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- 콘텐츠별 랜딩 문구 -------------------------------------------------
create table if not exists public.landing_variants (
  id uuid primary key default gen_random_uuid(),
  content_id uuid unique references public.contents(id) on delete cascade,
  template_id uuid references public.landing_templates(id) on delete set null,
  slug text unique not null,
  "values" jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  is_live boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS: 관리자만 (공개 페이지는 서버에서 service role로 조회) ---------
alter table public.admins enable row level security;
alter table public.settings enable row level security;
alter table public.bgm_tracks enable row level security;
alter table public.contents enable row level security;
alter table public.jobs enable row level security;
alter table public.landing_templates enable row level security;
alter table public.landing_variants enable row level security;

do $$
declare t text;
begin
  foreach t in array array['admins','settings','bgm_tracks','contents','jobs','landing_templates','landing_variants'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 스토리지 (영상·음성·이미지·BGM, 공개 URL 필요: 인스타 Reels는 공개 video_url 필수)
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;

drop policy if exists media_admin_write on storage.objects;
create policy media_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin());
drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- 최초 관리자 등록 (이메일 교체 후 실행)
-- insert into public.admins (email) values ('you@example.com');
