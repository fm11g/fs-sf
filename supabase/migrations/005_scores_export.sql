-- 005: 점수(1~5)·태그 · 점수 기반 최적화 · GitHub/구글 시트 내보내기 큐 · SOP 재정리
-- 001~004 실행 후 이어서 실행합니다. (재실행 안전)

-- 평가(학습 재료): 점수 · 내 태그 · 자동 특징 태그 · 생성 당시 입력
alter table public.exemplars drop constraint if exists exemplars_kind_check;
alter table public.exemplars add constraint exemplars_kind_check check (kind in ('good', 'neutral', 'bad', 'edit'));
alter table public.exemplars add column if not exists score smallint check (score between 1 and 5);
alter table public.exemplars add column if not exists tags text[] not null default '{}';
alter table public.exemplars add column if not exists features jsonb not null default '{}'::jsonb;
alter table public.exemplars add column if not exists input jsonb;          -- {system, prompt} 생성 당시 지시문 (학습 데이터용)
alter table public.exemplars add column if not exists sop_hash text;
alter table public.exemplars add column if not exists provider text;
alter table public.exemplars add column if not exists model text;
alter table public.exemplars add column if not exists github_path text;
alter table public.exemplars add column if not exists updated_at timestamptz not null default now();
-- 004 의 👍/👎 를 점수로 이관 (👍=4, 👎=2)
update public.exemplars set score = case kind when 'good' then 4 when 'bad' then 2 end where score is null and kind in ('good', 'bad');
create index if not exists exemplars_score_idx on public.exemplars (step, score desc, created_at desc);

-- 단계 실행 기록: 지시문 · SOP 버전 · 자유도 · 후보 수 · AI 예측 점수 · 참고한 고득점 예시
alter table public.steps add column if not exists ai_input jsonb;
alter table public.steps add column if not exists sop_hash text;
alter table public.steps add column if not exists freedom smallint;
alter table public.steps add column if not exists candidates smallint;
alter table public.steps add column if not exists pred_score numeric;
alter table public.steps add column if not exists refs bigint[];

-- 단계별 후보 수 (1 = 한 번 생성, 2~4 = 여러 개 만들어 점수 예측이 가장 높은 것 선택)
alter table public.sops add column if not exists best_of smallint not null default 1;
alter table public.sops drop constraint if exists sops_best_of_check;
alter table public.sops add constraint sops_best_of_check check (best_of between 1 and 4);

-- 제안 종류: patch(줄 단위 보완) · rewrite(누적 학습 기반 전체 재정리)
alter table public.sop_proposals add column if not exists kind text not null default 'patch';
alter table public.sop_proposals drop constraint if exists sop_proposals_kind_check;
alter table public.sop_proposals add constraint sop_proposals_kind_check check (kind in ('patch', 'rewrite'));
alter table public.sop_proposals add column if not exists proposed_content text;
alter table public.sop_proposals add column if not exists changelog jsonb not null default '[]'::jsonb;
alter table public.sop_proposals add column if not exists stats jsonb;

-- 내보내기 큐: 모든 결과물·중간 데이터 → GitHub(data 브랜치) · 구글 시트. 실패하면 남아서 재시도
create table if not exists public.export_queue (
  id bigserial primary key,
  target text not null check (target in ('github', 'sheets')),
  kind text not null,              -- run | rating | sop | rebuild
  ref text,                        -- content_id:step · exemplar id · proposal id
  payload jsonb not null,          -- github: {files:[{path, content}], message} · sheets: {tab, header, rows}
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists export_queue_status_idx on public.export_queue (status, created_at);
alter table public.export_queue enable row level security;
drop policy if exists admin_all on public.export_queue;
create policy admin_all on public.export_queue for all to authenticated using (public.is_admin()) with check (public.is_admin());

update public.settings set value = jsonb_build_object(
  'export_github', true,           -- 모든 실행·평가·SOP 변경을 GitHub data 브랜치에 저장
  'github_data_repo', '',          -- 비우면 GITHUB_REPO (같은 저장소의 data 브랜치)
  'github_data_branch', 'data',
  'export_sheets', false,          -- 구글 시트 전송
  'sheets_id', '',                 -- 서비스 계정 방식: 시트 ID
  'sheets_webhook', '',            -- Apps Script 방식: 웹앱 URL
  'sheets_secret', '',
  'fewshot_k', 2,                  -- 생성 시 참고로 넣을 고득점 예시 수 (0 = 끔)
  'fewshot_min_score', 4
) || value where id = 1;
