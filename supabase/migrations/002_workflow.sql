-- 002: 단계별 검수 게이트 · SOP · 이벤트(오퍼) · 신청(리드) · 효율 지표
-- 001_init.sql 실행 후 이어서 실행합니다. (재실행 안전)

alter table public.contents add column if not exists offer jsonb;
alter table public.contents add column if not exists current_step text default 'research';

-- 단계별 상태/결정/지표 ---------------------------------------------
create table if not exists public.steps (
  content_id uuid not null references public.contents(id) on delete cascade,
  step text not null,
  state text not null default 'pending',
  -- pending(대기) | running(작업 중) | review(검수 대기) | approved(승인) | rejected(반려) | stale(상위 변경으로 재작업 필요) | failed
  attempts int not null default 0,
  decided_by text,                 -- human | ai | auto
  decision_note text,
  feedback text,                   -- 다음 재생성에 반영할 지시
  ai_notes jsonb,                  -- 생성 시 AI 의견·제안·대안
  ai_review jsonb,                 -- AI 검수 결과 {verdict, score, issues, suggestions, feedback}
  checks jsonb not null default '[]'::jsonb,   -- 코드 규칙 검사 결과 [{level, msg}]
  started_at timestamptz,
  finished_at timestamptz,
  decided_at timestamptz,
  work_ms bigint not null default 0,           -- 누적 AI/워커 작업 시간
  wait_ms bigint not null default 0,           -- 누적 검수 대기 시간(완료→결정)
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (content_id, step)
);
create index if not exists steps_state_idx on public.steps (state);
drop trigger if exists steps_touch on public.steps;
create trigger steps_touch before update on public.steps
  for each row execute function public.touch_updated_at();

-- SOP (단계별 AI 지침 md + 자유도 + 결정 방식) -----------------------
create table if not exists public.sops (
  step text primary key,
  content text not null,
  freedom int not null default 2 check (freedom between 0 and 3),
  gate text not null default 'manual' check (gate in ('manual','ai','auto')),
  updated_at timestamptz not null default now()
);
create table if not exists public.sop_versions (
  id bigserial primary key,
  step text not null,
  content text not null,
  freedom int,
  gate text,
  note text,
  created_at timestamptz not null default now()
);

-- 랜딩 신청(리드) + 이벤트 로그 --------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  content_slug text,
  name text not null,
  phone text not null,
  company text,
  memo text,
  consent boolean not null default false,
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists leads_slug_idx on public.leads (content_slug, created_at desc);

create table if not exists public.events (
  id bigserial primary key,
  content_slug text,
  type text not null,               -- view | cta
  created_at timestamptz not null default now()
);
create index if not exists events_slug_idx on public.events (content_slug, type);

alter table public.steps enable row level security;
alter table public.sops enable row level security;
alter table public.sop_versions enable row level security;
alter table public.leads enable row level security;
alter table public.events enable row level security;
do $$
declare t text;
begin
  foreach t in array array['steps','sops','sop_versions','leads','events'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 설정 기본값 추가 (기존 값 유지) -------------------------------------
update public.settings set value = jsonb_build_object(
  'offers', '무료 정책자금 자격 진단(전화 10분) / 공고 마감 일정 알림 / 필요 서류 체크리스트 제공',
  'offer_rules', '실제로 제공 가능한 혜택만 사용. 가짜 선착순·가짜 마감 금지. 마감은 공고의 실제 접수 마감일만 사용.',
  'lead_webhook', '',
  'mcp_servers', '[]'::jsonb
) || value where id = 1;
