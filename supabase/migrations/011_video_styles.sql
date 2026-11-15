-- 011: 영상 스타일 프리셋 — 레퍼런스(캡처·링크)에서 뽑은 디자인 묶음
create table if not exists public.video_styles (
  id bigserial primary key,
  name text not null,
  description text,
  style jsonb not null,                -- lib/video-style.ts StyleSpec (템플릿·색·폰트·굵기·자막·장식·모션 성향·규칙)
  source jsonb not null default '{}',  -- { kind: 'image'|'youtube'|'ref'|'design'|'builtin', urls: [], ref_id }
  images text[] not null default '{}', -- 분석에 쓴 캡처 이미지
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.video_styles enable row level security;
drop policy if exists admin_all on public.video_styles;
create policy admin_all on public.video_styles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 콘텐츠별 스타일 ('news-navy' 같은 기본 프리셋 키 또는 video_styles.id). 비우면 설정의 기본 스타일
alter table public.contents add column if not exists style_key text;
