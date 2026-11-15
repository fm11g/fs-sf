#!/usr/bin/env bash
# 렌더 서버 준비 단계 진행 기록 (Node 가 뜨기 전, GitHub Actions 설치 단계에서 호출)
# 사용: bash scripts/progress.sh <setup 단계 %> "<설명>" [state]   (state: running|done|failed, 기본 running)
# 렌더(MODE=render)이고 CONTENT_ID 가 있을 때만 기록. 실패해도 빌드는 계속.
set -u
[ "${MODE:-}" = "render" ] || exit 0
[ -n "${CONTENT_ID:-}" ] || exit 0
[ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || exit 0
PCT="${1:-0}"; MSG="${2:-}"; STATE="${3:-running}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
if [ "$STATE" = "failed" ]; then
  PATCH="$(jq -n --arg job "${RENDER_JOB:-}" --arg msg "$MSG" --arg now "$NOW" --arg run "$RUN_URL" --argjson pct "$PCT" '{
    job:$job, status:"failed", stage:"setup", error:$msg, finished_at:$now, run_url:$run,
    stages:{queue:{state:"done",pct:100}, setup:{state:"failed",pct:$pct,detail:$msg}},
    log_add:[{t:$now,stage:"setup",msg:$msg,level:"error"}] }')"
else
  PATCH="$(jq -n --arg job "${RENDER_JOB:-}" --arg msg "$MSG" --arg now "$NOW" --arg run "$RUN_URL" --argjson pct "$PCT" '{
    job:$job, status:"running", stage:"setup", run_url:$run,
    stages:{queue:{state:"done",pct:100,detail:"렌더 서버 배정됨"}, setup:{state:"running",pct:$pct,detail:$msg}},
    log_add:[{t:$now,stage:"setup",msg:$msg}] }')"
fi
BODY="$(jq -n --arg cid "$CONTENT_ID" --argjson patch "$PATCH" '{cid:$cid, patch:$patch}')"
curl -sS -m 15 -o /dev/null -w "progress ${PCT}%% → %{http_code}\n" -X POST "${SUPABASE_URL%/}/rest/v1/rpc/render_progress_patch" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" -d "$BODY" || true
