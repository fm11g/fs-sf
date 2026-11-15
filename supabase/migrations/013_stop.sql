-- 013: 강제 중지 · 자동 정지
-- [중지] 또는 자동 정지 때 사이트가 시각을 기록 → 렌더 워커가 4초마다 확인하고 스스로 멈춤 (GitHub 실행 취소가 안 될 때 대비)
alter table public.contents add column if not exists cancel_requested_at timestamptz;

-- 렌더 진행 부분 갱신 함수: '중지됨(canceled)' 상태를 끝난 상태로 취급
create or replace function public.render_progress_patch(cid uuid, patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare cur jsonb;
begin
  select coalesce(render_progress, '{}'::jsonb) into cur from public.contents where id = cid for update;
  if not found then return; end if;
  -- 이미 끝난 기록에 '실패' 덮어쓰기 금지 (워커가 실제 사유를 먼저 기록함)
  if patch->>'status' = 'failed' and cur->>'status' in ('failed', 'done', 'canceled') then return; end if;
  if coalesce(patch->>'job', '') = '' then patch := patch - 'job'; end if;
  if cur->>'status' in ('failed', 'done', 'canceled') then
    -- 같은 요청이 이미 끝났으면(중지·자동 정지·완료) 늦게 온 설치 단계 기록은 무시
    if coalesce(patch->>'job', '') <> '' and patch->>'job' = cur->>'job' then return; end if;
    -- 끝난 기록 위에 새 실행(수동 실행 등)이 시작되면 새로 시작
    cur := jsonb_build_object('job', coalesce(patch->>'job', 'manual'), 'requested_at', to_jsonb(now()), 'stages', '{}'::jsonb, 'log', '[]'::jsonb);
  elsif coalesce(patch->>'job', '') <> '' and coalesce(cur->>'job', '') <> '' and cur->>'job' <> patch->>'job' then
    -- 진행 중인 다른 요청(job)이 있으면 늦게 온 예전 기록은 무시
    return;
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
