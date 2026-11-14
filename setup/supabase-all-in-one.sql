-- ════════════════════════════════════════════════════════════════════
-- 오늘의 정책자금 숏폼 공장 — Supabase 전체 설치 SQL (001 ~ 010 통합)
-- 사용법: Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전합니다(이미 있는 것은 건너뜀). 예전 버전을 이미 실행했어도 그대로 다시 실행하면 됩니다.
-- 관리자 이메일은 여기서 넣지 않습니다: 배포 후 사이트에 처음 접속하면 '대표 계정 만들기' 화면이 나옵니다.
-- ════════════════════════════════════════════════════════════════════


-- ┌──────────────────────────────────────────────
-- │ 001_init.sql
-- └──────────────────────────────────────────────
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

-- ┌──────────────────────────────────────────────
-- │ 002_workflow.sql
-- └──────────────────────────────────────────────
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

-- ┌──────────────────────────────────────────────
-- │ 003_providers.sql
-- └──────────────────────────────────────────────
-- 003: AI 제공자 전환(Claude → OpenAI → 오픈소스) · 에이전트 직접 작업 기록
-- 001, 002 실행 후 이어서 실행합니다. (재실행 안전)

alter table public.steps add column if not exists provider text;   -- claude | openai | oss | agent:<이름>
alter table public.steps add column if not exists model text;
alter table public.sops add column if not exists provider text not null default 'auto';  -- auto | claude | openai | oss

update public.settings set value = jsonb_build_object(
  'llm_chain', jsonb_build_array('claude', 'openai', 'oss')
) || value where id = 1;

-- ┌──────────────────────────────────────────────
-- │ 004_learning_notify.sql
-- └──────────────────────────────────────────────
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

-- ┌──────────────────────────────────────────────
-- │ 005_scores_export.sql
-- └──────────────────────────────────────────────
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

-- ┌──────────────────────────────────────────────
-- │ 006_channels_editorial.sql
-- └──────────────────────────────────────────────
-- 006: 내 채널 성과 수집 · 최종 콘텐츠 점수 · 댓글 분석 · 새로움 유지 편성표
-- 001~005 실행 후 이어서 실행합니다. (재실행 안전)

-- 채널에 올라간 영상 (공장에서 만든 것 + 직접 올린 것 모두)
create table if not exists public.channel_posts (
  id bigserial primary key,
  platform text not null check (platform in ('youtube', 'instagram')),
  external_id text not null,
  url text,
  title text,
  caption text,
  thumbnail_url text,
  published_at timestamptz,
  duration_sec numeric,
  content_id uuid references public.contents(id) on delete set null,   -- 공장에서 만든 콘텐츠면 연결
  metrics jsonb not null default '{}'::jsonb,      -- {views, likes, comments, shares, saves, reach, avg_view_pct, avg_watch_sec, subs_gained}
  comments jsonb not null default '[]'::jsonb,     -- 상위 댓글 [{text, likes, at}]
  comments_hash text,                              -- 댓글이 바뀌었을 때만 다시 분석
  comment_analysis jsonb,                          -- {sentiment, themes, questions, intent, requests, complaints, quality, summary}
  attrs jsonb not null default '{}'::jsonb,        -- 형태: {topic_category, angle, hook_type, format, target, tone}
  attrs_source text,                               -- content | ai | manual
  perf jsonb,                                      -- {score, components, maturity, rank_pct, computed_at}
  perf_score numeric,
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform, external_id)
);
create index if not exists channel_posts_pub_idx on public.channel_posts (published_at desc);
create index if not exists channel_posts_content_idx on public.channel_posts (content_id);

-- 일별 지표 스냅샷 (성장 곡선·나이 보정용)
create table if not exists public.post_snapshots (
  id bigserial primary key,
  post_id bigint not null references public.channel_posts(id) on delete cascade,
  taken_at timestamptz not null default now(),
  age_hours numeric,
  metrics jsonb not null
);
create index if not exists post_snapshots_post_idx on public.post_snapshots (post_id, taken_at);

-- 편성표 (7일). 슬롯은 콘텐츠가 만들어질 때 하나씩 배정됨
create table if not exists public.editorial_plans (
  id bigserial primary key,
  start_date date not null,
  slots jsonb not null default '[]'::jsonb,        -- [{date, order, topic_category, angle, hook_type, format, target, title_idea, hook_example, reason, flow_note, expected, novelty, experiment, locked, content_id}]
  series_note text,
  warnings jsonb not null default '[]'::jsonb,
  inputs jsonb,                                    -- 편성 근거 요약 (후보 점수·시청자 요청·최근 흐름)
  status text not null default 'active' check (status in ('active', 'superseded')),
  provider text,
  created_at timestamptz not null default now()
);
create index if not exists editorial_plans_active_idx on public.editorial_plans (status, start_date desc);

alter table public.contents add column if not exists editorial jsonb;   -- 배정된 편성 슬롯

alter table public.channel_posts enable row level security;
alter table public.post_snapshots enable row level security;
alter table public.editorial_plans enable row level security;
do $$
declare t text;
begin
  foreach t in array array['channel_posts','post_snapshots','editorial_plans'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

update public.settings set value = jsonb_build_object(
  'youtube_channel', '',           -- 예: https://www.youtube.com/@todaypolicyfund
  'instagram_account', '',         -- 예: https://www.instagram.com/today_policy_fund
  'channel_lookback_days', 60,
  'editorial_enabled', true,       -- 조사 전에 오늘 편성 슬롯을 배정
  'novelty_strength', 0.35,        -- 0 = 점수만, 1 = 새로움 최우선 (기본: 점수 우선 + 반복 방지)
  'explore_rate', 0.2,             -- 일주일 중 실험 슬롯 비율
  'cooldown_days', 3,              -- 같은 주제 분류·각도를 다시 쓰기까지 최소 일수
  'perf_to_learning', true,        -- 성과 점수가 확정되면 기획·대사·카피 평가로 학습에 반영
  'perf_weights', jsonb_build_object('views', 0.35, 'engagement', 0.2, 'shares', 0.15, 'comments', 0.1, 'retention', 0.1, 'conversion', 0.1)
) || value where id = 1;

-- ┌──────────────────────────────────────────────
-- │ 007_members_keys_refs.sql
-- └──────────────────────────────────────────────
-- 007: 직원 계정·권한 블록 / 연결·키(관리자 페이지에서 입력) / 참고 영상 학습

-- ── 1. 계정: 대표(owner) · 직원(staff) ─────────────────────────────
alter table public.admins add column if not exists role text not null default 'owner';
alter table public.admins add column if not exists name text;
alter table public.admins add column if not exists perms jsonb not null default '{}'::jsonb;  -- {"board":"view","step:script":"work",...}
alter table public.admins add column if not exists active boolean not null default true;
alter table public.admins add column if not exists last_login_at timestamptz;
alter table public.admins add column if not exists created_by text;
do $$ begin
  alter table public.admins add constraint admins_role_chk check (role in ('owner', 'staff'));
exception when duplicate_object then null; end $$;

-- 예전 SQL 의 자리표시자 계정 정리 (첫 가입 화면이 뜨도록)
delete from public.admins where email in ('your-email@example.com', 'you@example.com');

-- 브라우저에서 테이블을 직접 읽고 쓰는 권한은 대표만.
-- 직원은 서버 API 를 거쳐서 권한 블록에 해당하는 데이터만 받는다.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where email = auth.jwt() ->> 'email' and role = 'owner' and active
  );
$$;

-- ── 2. 연결·키 (API 키·토큰·비밀번호) ───────────────────────────────
-- 정책 없음 = 브라우저에서 절대 접근 불가, 서버(service role)·워커만 읽음
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

-- ── 3. 참고 영상 (내가 발견한 좋은 영상 → 분석 → 학습) ───────────────
create table if not exists public.ref_videos (
  id bigserial primary key,
  kind text not null default 'youtube' check (kind in ('youtube', 'upload', 'link')),
  url text,
  storage_path text,
  title text,
  channel text,
  note text,                                  -- 왜 좋은지 (내 메모)
  tags text[] not null default '{}',
  weight int not null default 3 check (weight between 1 and 5),  -- 학습 반영 강도
  learn_steps text[] not null default '{plan,script,design,copy}',
  active boolean not null default true,       -- 학습에 사용
  status text not null default 'queued' check (status in ('queued', 'analyzing', 'ready', 'failed')),
  error text,
  meta jsonb,                                 -- 길이·조회수·좋아요·해상도 등
  transcript text,
  cuts jsonb,                                 -- 컷 전환 시각(초) 배열
  frames jsonb,                               -- 대표 프레임 이미지 URL 배열
  analysis jsonb,                             -- 구조·훅·자막·색·모션·재현 규칙
  uses int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists ref_videos_active_idx on public.ref_videos (active, status, weight desc);
drop trigger if exists ref_videos_touch on public.ref_videos;
create trigger ref_videos_touch before update on public.ref_videos for each row execute function public.touch_updated_at();
alter table public.ref_videos enable row level security;
drop policy if exists admin_all on public.ref_videos;
create policy admin_all on public.ref_videos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- "이 영상처럼 만들기" 로 생긴 콘텐츠
alter table public.contents add column if not exists reference_id bigint references public.ref_videos (id) on delete set null;

-- ┌──────────────────────────────────────────────
-- │ 008_username.sql
-- └──────────────────────────────────────────────
-- 008: 이메일 대신 아이디로 로그인
-- 아이디만 있는 계정은 로그인용 내부 주소(아이디@users.example.com)로 Supabase 계정을 만든다. 메일은 보내지 않음.
alter table public.admins add column if not exists username text;
create unique index if not exists admins_username_key on public.admins (lower(username)) where username is not null;
-- 기존 계정: 이메일 앞부분을 아이디로 (겹치면 비워 둠 → 직원·권한 화면에서 지정)
with c as (
  select email, lower(split_part(email, '@', 1)) as u,
         row_number() over (partition by lower(split_part(email, '@', 1)) order by (role = 'owner') desc, created_at) as rn
  from public.admins where username is null
)
update public.admins a set username = c.u
from c
where a.email = c.email and c.rn = 1
  and c.u ~ '^[a-z0-9][a-z0-9._-]{2,19}$'
  and not exists (select 1 from public.admins b where lower(b.username) = c.u);

-- ┌──────────────────────────────────────────────
-- │ 009_usage.sql
-- └──────────────────────────────────────────────
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

-- ┌──────────────────────────────────────────────
-- │ 010_cases.sql
-- └──────────────────────────────────────────────
-- 010: 실제 사례(후기) 목록 — 랜딩의 후기 카드(case{n}_*)는 AI 가 쓰지 않고 여기서 골라 원문 그대로 채움
create table if not exists public.landing_cases (
  id bigserial primary key,
  industry text not null,            -- 업종 (예: 정보통신업(IT), 도배업)
  years int,                         -- 사업 연차
  who text not null,                 -- 카드 상단 표기: "정보통신업(IT) / 사업 2년차 / 김** 님"
  amount text not null,              -- 승인금액 표기: "₩20,000,000"
  amount_won bigint,                 -- 승인금액 숫자 (정렬·검증용)
  count text,                        -- 총 정책자금 횟수: "1회"
  rate text,                         -- 금리: "3%"
  badge1 text, badge2 text,          -- 자금 용도 태그
  title text not null,
  body text not null,
  img text,                          -- 사진 경로 (템플릿 기준 상대경로 가능: ./img/h9.jpg)
  fund_type text,                    -- 운전자금·시설자금·창업자금 …
  tags text[] not null default '{}', -- 선택 기준 키워드 (제조업, 매출하락, 저신용 …)
  verified boolean not null default false, -- 실제 고객 동의·서류 확인 완료
  active boolean not null default true,
  note text,                         -- 내부 메모 (근거 서류 위치 등)
  used_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists landing_cases_active on public.landing_cases (active, verified);
alter table public.landing_cases enable row level security;
drop policy if exists admin_all on public.landing_cases;
create policy admin_all on public.landing_cases for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 랜딩 변형에 어떤 사례를 몇 번 카드에 넣었는지
alter table public.landing_variants add column if not exists case_ids bigint[] not null default '{}';

-- 확인용: 테이블 목록 (23개가 나오면 완료)
select table_name from information_schema.tables where table_schema = 'public' order by table_name;
