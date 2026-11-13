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
