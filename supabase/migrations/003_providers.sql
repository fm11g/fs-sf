-- 003: AI 제공자 전환(Claude → OpenAI → 오픈소스) · 에이전트 직접 작업 기록
-- 001, 002 실행 후 이어서 실행합니다. (재실행 안전)

alter table public.steps add column if not exists provider text;   -- claude | openai | oss | agent:<이름>
alter table public.steps add column if not exists model text;
alter table public.sops add column if not exists provider text not null default 'auto';  -- auto | claude | openai | oss

update public.settings set value = jsonb_build_object(
  'llm_chain', jsonb_build_array('claude', 'openai', 'oss')
) || value where id = 1;
