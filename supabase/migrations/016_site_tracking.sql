-- 016: 오늘의 정책자금 홈페이지 연동 — 숏폼 고유 코드 · 사이트 정보글 · 신청(DB) 수 · DB 가중 성과 점수
--  · contents.track_code : 숏폼마다 하나 (slug 2026-11-19-a1b2 → 261119a1b2). 유튜브/인스타 링크에 c=코드 로 들어감
--  · contents.site_post  : 홈페이지 정책자금 정보글 {id, url, slug, commit, at}
--  · contents.lead_stats : 홈페이지 관리자에서 받아온 이 숏폼의 신청 수 {total, by_channel{youtube,instagram,seo,…}, by_status, first_at, last_at}
--  · channel_posts.leads : 플랫폼 영상별 신청 수 (자기 채널 신청 + 검색·정보글 신청 배분) → 성과 점수의 가장 큰 구성 요소
alter table public.contents add column if not exists track_code text;
alter table public.contents add column if not exists site_post jsonb;
alter table public.contents add column if not exists lead_stats jsonb;
alter table public.contents add column if not exists leads_synced_at timestamptz;
alter table public.contents add column if not exists instagram_url text;

-- 기존 콘텐츠도 코드 채우기
update public.contents
   set track_code = lower(regexp_replace(substr(slug, 3), '[^a-z0-9]', '', 'gi'))
 where track_code is null and slug ~ '^\d{4}-\d{2}-\d{2}-[a-z0-9]+$';
create unique index if not exists contents_track_code_idx on public.contents (track_code) where track_code is not null;

-- 새 콘텐츠는 만들어질 때 코드 자동 부여 (lib/track.ts trackCode 와 같은 규칙)
create or replace function public.contents_track_code() returns trigger language plpgsql as $$
begin
  if new.track_code is null and new.slug ~ '^\d{4}-\d{2}-\d{2}-[a-z0-9]+$' then
    new.track_code := lower(regexp_replace(substr(new.slug, 3), '[^a-z0-9]', '', 'gi'));
  end if;
  return new;
end $$;
drop trigger if exists contents_track_code on public.contents;
create trigger contents_track_code before insert on public.contents
  for each row execute function public.contents_track_code();

alter table public.channel_posts add column if not exists leads numeric;          -- 이 영상으로 들어온 신청 수
alter table public.channel_posts add column if not exists leads_detail jsonb;     -- {own, organic_share, by_channel}

-- 숏폼 공장 자체 랜딩 신청에도 코드
alter table public.leads add column if not exists track_code text;
alter table public.leads add column if not exists forwarded_at timestamptz;      -- 홈페이지 관리자로 전달한 시각

-- 성과 가중치: DB(신청) 수가 가장 큰 비중 · 구독 추가
update public.settings set value = value
  || jsonb_build_object(
    'perf_weights', case when coalesce(value->'perf_weights', '{}'::jsonb) ? 'leads' then value->'perf_weights'   -- 이미 DB 가중치를 정했으면 유지
      else jsonb_build_object('leads', 0.40, 'views', 0.12, 'engagement', 0.10, 'shares', 0.10, 'comments', 0.10, 'subscribers', 0.10, 'retention', 0.05, 'conversion', 0.03) end,
    'tpf_site_url', coalesce(value->>'tpf_site_url', ''),      -- 예: https://todaypolicyfund.co.kr  (go.html 추적 링크 · 정보글 주소)
    'tpf_admin_url', coalesce(value->>'tpf_admin_url', ''),    -- 예: https://today-fund-admin.vercel.app (연동 API)
    'tpf_post_on_publish', coalesce((value->>'tpf_post_on_publish')::boolean, true),
    'tpf_forward_leads', coalesce((value->>'tpf_forward_leads')::boolean, true)
  )
 where id = 1;
