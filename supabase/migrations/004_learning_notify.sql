-- 004: 좋은 결과물 → SOP 학습 제안 · 단계 완료 이메일 알림
-- 001~003 실행 후 이어서 실행합니다. (재실행 안전)

-- AI가 처음 만든 산출물 스냅샷 (사람이 고친 뒤 승인하면 차이를 학습)
alter table public.steps add column if not exists ai_output jsonb;

-- 좋은/아쉬운/수정 예 (콘텐츠를 지워도 스냅샷은 남김)
create table if not exists public.exemplars (
  id bigserial primary key,
  content_id uuid references public.contents(id) on delete set null,
  step text not null,
  kind text not null check (kind in ('good', 'bad', 'edit')),
  note text,                      -- 왜 좋은지/아쉬운지 (운영자 메모)
  output jsonb not null,          -- 선택 당시 산출물 (edit 은 사람이 고친 최종본)
  before jsonb,                   -- edit: AI 원본
  topic text,
  source text not null default 'human',   -- human | edit | metrics | mcp
  used_in bigint,                 -- 반영된 SOP 제안 id (null = 아직 학습 안 됨)
  created_at timestamptz not null default now()
);
create index if not exists exemplars_step_idx on public.exemplars (step, used_in, created_at desc);

-- SOP 학습 제안 (기존 SOP 대비 추가/수정/삭제 목록)
create table if not exists public.sop_proposals (
  id bigserial primary key,
  step text not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'superseded')),
  base_content text not null,     -- 제안 당시 SOP
  changes jsonb not null default '[]'::jsonb,   -- [{op, section, target, text, reason, evidence, warn}]
  patterns jsonb not null default '[]'::jsonb,
  summary text,
  exemplar_ids bigint[] not null default '{}',
  provider text,
  applied_content text,           -- 반영 후 SOP
  applied_changes int[],          -- 반영한 변경 번호
  decided_by text,                -- human | auto
  decided_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists sop_proposals_step_idx on public.sop_proposals (step, status, created_at desc);

-- 이메일 발송 기록
create table if not exists public.notifications (
  id bigserial primary key,
  content_id uuid references public.contents(id) on delete set null,
  step text,
  event text not null,
  recipients text[] not null default '{}',
  subject text,
  status text not null,           -- sent | failed | skipped
  error text,
  created_at timestamptz not null default now()
);
create index if not exists notifications_created_idx on public.notifications (created_at desc);

alter table public.exemplars enable row level security;
alter table public.sop_proposals enable row level security;
alter table public.notifications enable row level security;
do $$
declare t text;
begin
  foreach t in array array['exemplars','sop_proposals','notifications'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

update public.settings set value = jsonb_build_object(
  'notify_emails', '[]'::jsonb,
  'notify_events', jsonb_build_array('step_done','step_review','step_failed','render_done','published','sop_proposal','sop_applied','digest'),
  'learn_mode', 'propose',      -- off | propose(제안만, 사람이 반영) | auto(안전한 변경 자동 반영)
  'learn_min', 3,               -- 단계별 미반영 좋은/수정 예가 이만큼 쌓이면 제안 생성
  'learn_from_edits', true      -- 사람이 고친 뒤 승인한 차이를 자동으로 학습 재료로
) || value where id = 1;
