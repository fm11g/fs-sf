-- 018: 공고 변경 감지 — 이미 다룬 정책자금 공고의 일정 · 내용이 바뀌었는지 매일 다시 확인하고, 반영 여부를 사람이 결정
--  · program_changes : 감지된 변경 1건 = 바뀐 항목(전 → 후) + 실제 변경 공고 링크(근거) + 결정(반영 · 무시)
--  · contents.program_check : 마지막 확인 결과 {at, status, changed, summary}
create table if not exists public.program_changes (
  id bigserial primary key,
  content_id uuid not null references public.contents(id) on delete cascade,
  detected_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  program_status text,                  -- 접수중 · 접수예정 · 마감 · 조기마감 · 취소 · 확인불가
  summary text,
  confidence text,                      -- 높음 · 보통 · 낮음
  changes jsonb not null default '[]',  -- [{field, label, before, after}]
  evidence jsonb not null default '[]', -- [{title, url, date, quote}] 실제 변경 공고 · 정정 공고 링크
  proposed jsonb,                       -- 반영하면 바뀔 program 값 {deadline_iso, period, amount, …}
  decided_by text,
  decided_at timestamptz,
  note text,
  applied jsonb                         -- 반영 결과 (홈페이지 랜딩 · 진행 중인 정책자금 갱신)
);
create index if not exists program_changes_status_idx on public.program_changes(status, detected_at desc);
create index if not exists program_changes_content_idx on public.program_changes(content_id, detected_at desc);
alter table public.program_changes enable row level security;
drop policy if exists admin_all on public.program_changes;
create policy admin_all on public.program_changes for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.contents add column if not exists program_check jsonb;
