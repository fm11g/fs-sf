-- 012: 렌더 진행 상황 (진행 바 · % · 단계별 작업 과정 · 로그)
-- 워커가 1~2초마다 갱신, 관리자 작업대·현황판이 읽어 표시. 구조: worker/video/stages.ts RenderProgress
alter table public.contents add column if not exists render_progress jsonb;

-- 렌더 서버 준비 단계(설치 중, Node 시작 전)에서 GitHub Actions 가 curl 로 부분 갱신할 때 씀
-- patch 의 최상위 키를 덮어쓰고, stages·log 는 합침. 같은 job 이 아니면 무시(예전 실행이 늦게 쓰는 것 방지)
create or replace function public.render_progress_patch(cid uuid, patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare cur jsonb;
begin
  select coalesce(render_progress, '{}'::jsonb) into cur from public.contents where id = cid for update;
  if not found then return; end if;
  -- 이미 끝난 기록에 '실패' 덮어쓰기 금지 (워커가 실제 사유를 먼저 기록함)
  if patch->>'status' = 'failed' and cur->>'status' in ('failed', 'done') then return; end if;
  -- 다른 요청(job)의 늦은 기록은 무시
  if coalesce(patch->>'job', '') <> '' and coalesce(cur->>'job', '') <> '' and cur->>'job' <> patch->>'job' then return; end if;
  if coalesce(patch->>'job', '') = '' then patch := patch - 'job'; end if;
  -- 끝난 기록 위에 새 실행(수동 실행 등)이 시작되면 새로 시작
  if cur->>'status' in ('failed', 'done') then
    cur := jsonb_build_object('job', coalesce(patch->>'job', 'manual'), 'requested_at', to_jsonb(now()), 'stages', '{}'::jsonb, 'log', '[]'::jsonb);
  end if;
  update public.contents set render_progress =
    (cur || (patch - 'stages' - 'log_add'))
    || jsonb_build_object('stages', coalesce(cur->'stages', '{}'::jsonb) || coalesce(patch->'stages', '{}'::jsonb))
    || jsonb_build_object('log', (
         select coalesce(jsonb_agg(x order by i), '[]'::jsonb) from (
           select x, i from jsonb_array_elements(coalesce(cur->'log', '[]'::jsonb) || coalesce(patch->'log_add', '[]'::jsonb)) with ordinality as e(x, i)
           order by i desc limit 80
         ) s))
    || jsonb_build_object('updated_at', to_jsonb(now()))
  where id = cid;
end $$;
revoke all on function public.render_progress_patch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.render_progress_patch(uuid, jsonb) to service_role;
