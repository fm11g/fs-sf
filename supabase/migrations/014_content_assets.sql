-- 014: 콘텐츠 첨부 파일 (피드백에 붙인 이미지·영상, 장면에 넣을 자료화면)
-- 파일은 스토리지 media 버킷 contents/{slug}/assets/ 에 저장 → 렌더 워커가 그 주소로 읽어 영상에 넣음
create table if not exists public.content_assets (
  id bigserial primary key,
  content_id uuid not null references public.contents(id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  path text not null,                 -- 스토리지 경로 (media 버킷)
  url text not null,                  -- 공개 주소 (워커·편집기·AI 가 씀)
  name text,                          -- 원래 파일 이름
  mime text,
  size bigint,
  width int, height int,
  duration numeric,                   -- 영상 길이(초)
  note text,                          -- 설명 (AI 에게 전달: "공단 홍보영상 중 공장 장면")
  step text,                          -- 어느 단계 피드백에 붙였는지 (없으면 장면 자료)
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists content_assets_content_idx on public.content_assets(content_id, created_at);
alter table public.content_assets enable row level security;
drop policy if exists admin_all on public.content_assets;
create policy admin_all on public.content_assets for all to authenticated using (public.is_admin()) with check (public.is_admin());
