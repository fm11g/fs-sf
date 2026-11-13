# API · MCP

## MCP 서버 — Claude에서 공장 조작

엔드포인트 `https://사이트/api/mcp` (Streamable HTTP, JSON 응답) · 인증 `Authorization: Bearer $MCP_TOKEN`

```
# Claude Code — 저장소의 .mcp.json 이 자동으로 잡힙니다 (TPF_URL, MCP_TOKEN 환경변수 필요). 수동 추가:
claude mcp add --transport http tpf https://사이트/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
# Codex — .codex/config.toml 의 url 수정, 또는:
codex mcp add tpf --url https://사이트/api/mcp --bearer-token-env-var MCP_TOKEN
# MCP 없이: node bin/tpf.mjs help
```
claude.ai 커스텀 커넥터는 OAuth 방식만 받는 경우가 있어, 헤더 토큰 방식인 이 서버는 Claude Code·API(MCP connector)·자체 에이전트 연결을 기준으로 합니다.

| 도구 | 용도 |
|---|---|
| `factory_board` | 현황판 (콘텐츠별 단계 상태) |
| `factory_metrics` | 효율 지표 |
| `content_create` / `content_get` | 콘텐츠 생성 / 단계 상태·산출물 조회 |
| `pipeline_advance` | 다음 단계 1개 진행 (`continue` 면 반복 호출) |
| `step_run` | 특정 단계 실행, `feedback` 으로 수정 지시, `provider` 로 제공자 지정 |
| `step_brief` / `step_submit` | 에이전트 직접 작업: 지시문 받기 / 작성한 산출물 제출 |
| `providers_status` | 서버 AI 제공자 준비 상태·전환 순서 |
| `step_decide` | 승인 / 반려 |
| `step_ai_decide` | AI 검수자에게 판단 위임 |
| `step_update_output` | 산출물 직접 교체 |
| `sop_list` / `sop_get` / `sop_update` | SOP md·자유도·결정 방식 조회·수정 |
| `exemplar_mark` | 👍 좋은 예 / 👎 아쉬운 예 저장 |
| `sop_learn_status` / `sop_learn_propose` | 학습 재료 현황 / SOP 보완 제안 생성 |
| `sop_proposals` / `sop_proposal_decide` | 제안 목록 / 반영(선택·문구 수정)·거절·되돌리기 |
| `render_request` / `publish_request` | 워커에 렌더 / 게시 요청 |

사용 예 (Claude Code): "tpf 현황판 보고 검수 대기인 것 요약해줘", "오늘 콘텐츠 03 대사를 더 단호한 어조로 재생성하고 결과 보여줘", "기획 SOP 집중 포인트 맨 위에 '마감 훅 우선' 추가해줘".

## 조사 단계에 외부 MCP 연결 (선택)

설정 → `mcp_servers` 에 `[{"name":"bizinfo","url":"https://…/mcp","token":"…"}]` 형태로 넣으면 01 조사 단계에서 Claude가 웹검색과 함께 그 MCP 도구를 사용합니다 (Messages API MCP connector, beta `mcp-client-2025-11-20`).

## REST API

관리자 세션 쿠키 또는 `x-worker-secret: $WORKER_SECRET` 헤더.

| 메서드 · 경로 | 본문 | 설명 |
|---|---|---|
| POST `/api/contents` | `{topic?}` | 콘텐츠 생성 |
| GET/PATCH/DELETE `/api/contents/:id` | PATCH `{research|plan|script|offer|design|copy|post|landing_values|bgm_id}` | 조회 / 산출물 직접 수정 / 삭제 |
| POST `/api/pipeline/:step` | `{contentId, feedback?, force?, provider?}` | AI 단계 실행 |
| POST `/api/pipeline/brief` · `/api/pipeline/submit` | `{contentId, step, feedback?}` · `{contentId, step, output, agent?}` | 에이전트 직접 작업 |
| GET `/api/providers` | | AI 제공자 상태 |
| POST/GET/DELETE `/api/exemplars` | `{contentId, step, kind: good|bad, note}` | 학습 재료 |
| GET/POST `/api/learn` | `{action: propose|apply|reject|revert, step|id, selected?, edits?, content?}` | SOP 학습 제안 |
| POST `/api/notify` · `/api/notify/test` | `{event, contentId?, step?}` · `{kind: basic|digest}` | 알림 발송 / 테스트 |
| GET `/api/cron/daily` | `Authorization: Bearer $CRON_SECRET` | 하루 요약 + 학습 제안 일괄 |
| POST `/api/pipeline/advance` | `{contentId}` | 다음 단계 1개. `action`: continue · wait_review · worker · running · done |
| POST `/api/steps/decide` | `{contentId, step, decision, note?}` | 승인 / 반려 |
| POST `/api/steps/ai-decide` | `{contentId, step, apply?}` | AI 판단 |
| GET/POST `/api/sop` | `{action: save|commit|default|versions, step, …}` | SOP |
| GET `/api/board` · `/api/metrics?days=30` | | 현황판 · 지표 |
| POST `/api/render` · `/api/publish` · `/api/factory` | `{contentId}` · `{contentId, targets}` · `{topic?}` | 워커 호출 |
| POST `/api/leads` (공개) | `{name, phone, company?, consent, slug, utm}` | 랜딩 신청 접수 |
| GET `/api/landing/:slug` (공개) | | 랜딩 슬롯 문구 (sync.js 용) |

## 단계 상태

`pending` 대기 → `running` 작업 중 → `review` 검수 대기 → `approved` 승인
· `rejected` 반려(사유가 다음 실행의 지시가 됨) · `stale` 상위 변경으로 재작업 필요 · `failed` 실패

## 단계를 추가하려면

1. `lib/steps.ts` 의 `STEP_DEFS` 에 정의 추가 (deps = 읽는 상위 단계)
2. `lib/prompts.ts` 의 `ROLE`, `USER` 에 역할과 출력 스키마
3. `lib/pipeline.ts` 의 `lint` 에 규칙 검사, 필요하면 `generate` 후처리
4. `sop/NN-키.md` 작성, `lib/sop.ts` 의 `DEFAULTS` 에 자유도·결정 방식
5. `contents` 테이블에 jsonb 컬럼 추가 (마이그레이션), 워커 `syncCurrent` 순서 배열 갱신
