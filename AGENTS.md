# AGENTS.md

'오늘의 정책자금' 숏폼 공장 저장소. 이 파일은 Codex를 비롯해 AGENTS.md를 읽는 모든 코딩 에이전트의 공통 지침이며, Claude Code는 `CLAUDE.md` 를 통해 같은 내용을 읽습니다.

이 저장소에서 에이전트가 하는 일은 두 가지입니다.

| 일 | 무엇을 쓰나 |
|---|---|
| **A. 공장 운영** — 영상 제작 진행, 검수, SOP 조정 | 스킬(`tpf-*`) + MCP 도구 또는 `node bin/tpf.mjs` |
| **B. 코드 수정** — 관리자·파이프라인·워커 개발 | 아래 "코드 작업 규칙" |

## A. 공장 운영

### 스킬 (원본 `skills/`, 동기화본 `.agents/skills/` · `.claude/skills/`)

| 스킬 | 언제 |
|---|---|
| `tpf-status` | 현황판, 결정 대기, 작업 효율 확인 |
| `tpf-produce` | 숏폼 1편을 조사부터 렌더 직전까지 진행 |
| `tpf-review` | 단계 산출물을 SOP 체크리스트로 검수 |
| `tpf-step-local` | 서버 AI 없이 지금 이 에이전트가 단계 산출물을 직접 작성·제출 |
| `tpf-learn` | 좋은 결과물(👍·사람이 고친 예·성과)로 SOP 보완 제안 → 선택 반영 → 되돌리기 |
| `tpf-sop-tune` | 단계별 SOP·자유도·결정 방식·AI 제공자 직접 조정 |
| `tpf-landing-slots` | 랜딩 HTML에 `data-slot` 을 붙여 연동 |

### 역할 (Claude Code는 `.claude/agents/` 의 서브에이전트로, 그 외 에이전트는 아래 설명대로 역할을 나눠 수행)

| 역할 | 하는 일 | 쓰는 스킬 |
|---|---|---|
| producer | 공정 진행, 사람 결정 지점에서 멈추고 보고 | `tpf-produce`, `tpf-step-local` |
| reviewer | 엄격한 검수, 재작업 지시문 작성 (만든 쪽과 분리) | `tpf-review` |
| researcher | 공식 출처 웹 조사로 조사 단계 직접 수행 | `tpf-step-local` |
| sop-editor | 좋은 결과물·지표·반려 사유 근거로 SOP 개선 | `tpf-learn`, `tpf-sop-tune` |

### 도구 연결

- MCP: 서버 이름 `tpf` (`.mcp.json` / `.codex/config.toml`). 환경변수 `TPF_URL`, `MCP_TOKEN`.
- CLI: `node bin/tpf.mjs help`. MCP가 안 되는 환경(오픈소스 에이전트 포함)에서도 동일하게 동작. `.env.tpf` 에 `TPF_URL`, `MCP_TOKEN`.

### AI가 안 될 때의 순서

1. 서버 파이프라인은 설정의 전환 순서(기본 `claude → openai → oss`)대로 자동으로 넘어간다. `tpf providers` 로 상태 확인.
2. 서버 제공자가 모두 안 되면 **에이전트 직접 작업**: `tpf brief` → 직접 작성 → `tpf submit` (`tpf-step-local` 스킬).
3. 조사 단계는 어떤 경우에도 실제 웹 검색이 필요하다. 검색 수단이 없으면 지어내지 말고 멈춘다.

### 운영 규칙

- 업로드(`publish`)는 운영자가 명시적으로 요청했을 때만.
- 승인은 운영자가 맡겼을 때만 대신한다.
- 금액·금리·기간·자격은 조사 산출물에 있는 것만. 승인·한도 보장 표현, 근거 없는 마감·선착순 금지.

## B. 코드 작업 규칙

Next.js 14 App Router(Vercel) + Supabase + GitHub Actions 워커(Remotion).

### 명령
- 앱: `npm run dev` · `npx tsc --noEmit` · `npm run build` (빌드 시 Supabase 환경변수 3개는 더미라도 필요)
- 워커: `cd worker && npx tsc --noEmit` · `npm run studio` (먼저 `bash scripts/fonts.sh`)
- 스킬: `skills/` 원본만 수정 후 `npm run skills:sync` (`.claude/skills`, `.agents/skills` 는 생성물)

### 지켜야 할 것
- 공정 순서·의존 관계의 단일 출처는 `lib/steps.ts`. 워커의 `syncCurrent` 순서 배열(`worker/src/env.ts`)과 맞춘다.
- 모델 호출은 반드시 `lib/llm.ts` 의 `ask()` 를 거친다(제공자 전환·사용량 기록). 특정 제공자 SDK를 다른 파일에서 직접 부르지 않는다.
- SOP md(`sop/*.md`)에는 "무엇에 집중할지"만. JSON 스키마·글자수 상한 같은 기계 규칙은 `lib/prompts.ts`·`lib/pipeline.ts(lint)`에 둔다.
- SOP 자동 보완은 `lib/learn.ts`(제안·반영) + `lib/sop-merge.ts`(줄 단위 적용, 순수 함수). 학습 제안이 SOP 전체를 다시 쓰게 만들지 않는다.
- 알림은 `lib/notify.ts` 의 `notify()` 한 곳에서만 보낸다(워커는 `/api/notify` 호출). 알림 실패가 파이프라인을 멈추면 안 된다.
- 산출물이 바뀌는 모든 경로는 `runStep` · `stepSubmit` · `onEdited` 중 하나를 거쳐 하위 단계를 `stale` 로 만든다. `contents` 를 직접 update 하는 새 경로를 만들지 않는다.
- 금융 광고: 승인·한도 보장 표현, 근거 없는 마감·선착순을 만드는 프롬프트/문구 금지.
- 관리자 UI는 `#tpf-admin` 스코프 CSS(`app/admin/admin.css`)만 사용, 전역 CSS 추가 금지.
- 공개 API(`/api/leads`, `/api/track`, `/api/landing/*`) 외에는 반드시 `requireAdmin`.
- 한국어 UI·주석 유지.
