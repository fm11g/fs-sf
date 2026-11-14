-- 009: API 사용 기록부 — 모든 산출물마다 어떤 플랫폼·모델·생각 깊이로 얼마나(토큰·검색·글자·분) 썼는지
create table if not exists public.usage_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  content_id uuid references public.contents(id) on delete set null,
  step text,                 -- 공정 단계 (research … publish)
  task text,                 -- 작업 키 (lib/models.ts TASKS: plan, review, judge, fix, learn, reference …)
  kind text not null default 'llm',   -- llm | search | tts | stt | render | upload | analytics | email
  platform text not null,    -- anthropic | openai | oss | tavily | searxng | fish | github | youtube | instagram | email | agent
  model text,
  effort text,               -- 생각 깊이 (low … max)
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,   -- 생각 토큰 포함 (출력으로 청구)
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  searches int not null default 0,
  units numeric not null default 0,           -- 글자·분·쿼터 등
  unit text,
  cost_usd numeric(14,6) not null default 0,
  priced boolean not null default true,       -- false = 단가 미입력으로 0 처리
  ok boolean not null default true,
  error text,
  ms int,
  attempt int,               -- 같은 요청 안에서 몇 번째 시도 (제공자 전환 시 2, 3 …)
  ref_table text, ref_id text,                -- 콘텐츠 밖 산출물 (sop_proposals, ref_videos, editorial_plans …)
  by text                    -- 실행 주체 (계정 · auto · cron · worker · agent:이름)
);
create index if not exists usage_log_content on public.usage_log (content_id, step);
create index if not exists usage_log_at on public.usage_log (at desc);
create index if not exists usage_log_pm on public.usage_log (platform, model);
create index if not exists usage_log_ref on public.usage_log (ref_table, ref_id);
alter table public.usage_log enable row level security;
drop policy if exists admin_all on public.usage_log;
create policy admin_all on public.usage_log for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 단계 행에 누적 비용 (작업대·효율 화면용 빠른 합계)
alter table public.steps add column if not exists cost_usd numeric(14,6) not null default 0;
alter table public.steps add column if not exists effort text;
-- 학습 예시에도 어떤 모델로 만든 결과인지
alter table public.exemplars add column if not exists effort text;
