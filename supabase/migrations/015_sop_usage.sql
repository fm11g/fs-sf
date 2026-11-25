-- 015: SOP 사용 기록 — 어떤 SOP 버전이 언제 어떤 결과물(콘텐츠·단계)에 쓰였는지
-- sop_versions.hash = 내용 해시 8자 (steps.sop_hash 와 같은 값) → 결과물에서 그때의 SOP 전문을 바로 찾음
alter table public.sop_versions add column if not exists hash text;
create index if not exists sop_versions_step_hash_idx on public.sop_versions(step, hash);

create table if not exists public.sop_usage (
  id bigserial primary key,
  step text not null,
  sop_hash text not null,
  version_id bigint references public.sop_versions(id) on delete set null,
  content_id uuid references public.contents(id) on delete cascade,
  outcome text,                 -- approved(바로 승인) | review(검수 대기) | failed | stopped
  decided_by text,              -- ai | auto | null
  freedom int,
  gate text,
  provider text,
  model text,
  feedback boolean not null default false,  -- 수정 지시로 재생성한 실행인지
  attempt int,
  created_at timestamptz not null default now()
);
create index if not exists sop_usage_step_idx on public.sop_usage(step, created_at desc);
create index if not exists sop_usage_hash_idx on public.sop_usage(step, sop_hash);
create index if not exists sop_usage_content_idx on public.sop_usage(content_id);
alter table public.sop_usage enable row level security;
drop policy if exists admin_all on public.sop_usage;
create policy admin_all on public.sop_usage for all to authenticated using (public.is_admin()) with check (public.is_admin());
