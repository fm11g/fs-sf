# 에이전트 · 스킬 · AI 제공자

같은 공장을 **Claude Code, Codex, 그 밖의 에이전트** 어디서든 같은 스킬로 조작하고, 서버 파이프라인은 **Claude → OpenAI → 오픈소스 모델** 순으로 자동 전환됩니다.

## 한눈에

| 층 | 무엇 | 안 될 때 |
|---|---|---|
| ① 서버 파이프라인 (`lib/llm.ts`) | 관리자·워커·MCP가 단계를 실행할 때 쓰는 모델 | `claude` 실패 → `openai` → `oss` 자동 전환 |
| ② 에이전트 직접 작업 (`brief` → `submit`) | 지금 대화 중인 에이전트가 산출물을 직접 작성 | 서버에 API 키가 하나도 없어도 진행 가능 |
| ③ 스킬·역할 (`skills/`, `.claude/agents/`, `AGENTS.md`) | 어떤 에이전트든 같은 절차로 일하게 하는 지침 | MCP가 안 되면 CLI(`bin/tpf.mjs`)로 동일하게 |

## 1. 연결 (한 번만)

공통: Vercel에 `MCP_TOKEN` 을 설정하고, 작업하는 컴퓨터 셸에 같은 값을 둡니다.

```bash
export TPF_URL=https://사이트        # 또는 저장소 루트에 .env.tpf (예시: .env.tpf.example)
export MCP_TOKEN=…
node bin/tpf.mjs providers           # 연결 확인
```

| 에이전트 | 스킬 위치 | MCP 연결 |
|---|---|---|
| **Claude Code** | `.claude/skills/tpf-*` (자동 인식), 서브에이전트 `.claude/agents/tpf-*` | `.mcp.json` 이 저장소에 있음 → 승인만 하면 됨 |
| **Codex** | `.agents/skills/tpf-*` (자동 인식), 지침 `AGENTS.md` | `.codex/config.toml` 의 url 수정 (신뢰한 프로젝트에서만 읽힘) 또는 `codex mcp add tpf --url https://사이트/api/mcp --bearer-token-env-var MCP_TOKEN` |
| **그 외 / 오픈소스 에이전트** | `AGENTS.md` 와 `skills/*/SKILL.md` 를 읽게 함 | MCP 지원 시 같은 엔드포인트, 아니면 CLI `node bin/tpf.mjs` |

스킬 원본은 `skills/` 입니다. 고친 뒤 `npm run skills:sync` 로 두 위치에 복사합니다 (CI가 동기화 여부를 검사).

## 2. 스킬 쓰는 법

말로 부르면 됩니다. 명시적으로 부르려면 Claude Code는 `/tpf-produce`, Codex는 `$tpf-produce`.

| 이렇게 말하면 | 스킬 | 하는 일 |
|---|---|---|
| "현황 보여줘", "뭐 기다리고 있어?" | `tpf-status` | 결정 대기·재작업·진행 중 요약, 효율 지표 |
| "오늘 영상 하나 돌려줘", "이어서 진행" | `tpf-produce` | 사람 결정 지점까지 진행하고 산출물을 요약해 결정 요청 |
| "대사 검수해줘", "통과시켜도 돼?" | `tpf-review` | SOP 체크리스트 대조, 재작업 지시문 초안 |
| "서버 AI 안 되니까 네가 직접 써" | `tpf-step-local` | brief 받아 직접 작성 후 submit |
| "기획 SOP에 마감 훅 우선 추가" | `tpf-sop-tune` | 지표 확인 → 변경 전/후 제시 → 적용 |
| "이 랜딩 HTML 연동해줘" | `tpf-landing-slots` | `data-slot`·신청폼·집계 속성 추가 |

역할(서브에이전트)은 Claude Code에서 `tpf-producer` · `tpf-reviewer` · `tpf-researcher` · `tpf-sop-editor` 로 호출합니다. Codex 등에서는 `AGENTS.md` 의 역할 표를 따라 같은 스킬 조합으로 수행합니다.

## 3. 서버 AI 제공자 전환

`.env`(Vercel 환경변수)에 **있는 것만** 쓰고, 실패하면 다음으로 넘어갑니다.

| 제공자 | 필요한 환경변수 | 조사 단계 웹검색 |
|---|---|---|
| `claude` | `ANTHROPIC_API_KEY` (모델·생각 깊이: 관리자 [AI 모델]에서 작업별 선택) | 내장 |
| `openai` | `OPENAI_API_KEY`, `OPENAI_MODEL` | 내장 (Responses API `web_search`) |
| `oss` | `OSS_BASE_URL`, `OSS_MODEL` (`OSS_API_KEY`) — OpenAI 호환 `/chat/completions` | 없음 → `TAVILY_API_KEY` 또는 `SEARXNG_URL` 로 검색 결과 주입 |

- **전환 순서**: 관리자 → 설정 → "AI 제공자 전환 순서" (기본 `claude, openai, oss`). 같은 화면의 "AI 제공자 상태"에서 준비 여부와 실제 적용 순서를 봅니다.
- **단계별 지정**: SOP·AI 제어 → 단계 선택 → "AI 제공자". 지정한 제공자가 실패하면 전환 순서대로 넘어갑니다. 예) 대사는 Claude, SEO 글은 오픈소스.
- **한 번만 지정**: `tpf run <id> <step> --provider oss`.
- **전환이 일어나면** 작업대의 규칙 검사에 `제공자 전환: claude 실패 → openai 사용` 이 남고, 작업 효율의 "누가 만들었나"에 집계됩니다.
- 전환 조건: 키 오류, 한도 초과, 장애, 시간 초과(`LLM_TIMEOUT_MS`), JSON이 깨진 응답(같은 제공자로 1회 재시도 후).

### 오픈소스 모델 연결 예

| 방식 | `OSS_BASE_URL` | 비고 |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | 여러 오픈 모델을 키 하나로 |
| Groq | `https://api.groq.com/openai/v1` | 빠름 |
| 자체 서버 (vLLM · Ollama) | `https://내서버/v1` | **Vercel에서 접근 가능한 공개 주소**여야 함. 내 PC의 `localhost:11434` 는 Vercel이 못 부릅니다 → 터널/서버 필요 |

오픈소스 모델은 한국어 카피와 긴 JSON에서 품질·형식 오류가 더 잦습니다. 그래서:
- JSON이 깨지면 재시도 → 다음 제공자, 그래도 통과한 결과는 규칙 검사(글자수·금지 표현·출처 URL)와 결정 방식(사람/AI)이 그대로 적용됩니다.
- 조사 단계는 검색 결과에 있는 URL만 출처로 쓰도록 강제하고, 검색 수단이 없으면 실패 처리합니다(지어내지 않음).
- 오픈소스가 만든 단계는 처음엔 결정 방식을 "사람"으로 두고 통과율을 본 뒤 조정하세요.

## 4. 에이전트 직접 작업 (API 키 없이)

Codex·Claude Code 구독만 있고 API 키가 없거나, 서버 제공자가 전부 막혔을 때의 경로입니다.

```bash
node bin/tpf.mjs brief latest script            # 지시문: system(역할·SOP·자유도) + task(상위 산출물·출력 JSON 형식)
#  → 에이전트가 그 지시대로 JSON 작성 → /tmp/tpf-script.json
node bin/tpf.mjs submit latest script /tmp/tpf-script.json --agent codex
#  → 후처리 + 규칙 검사 + 결정 방식 적용. checks 에 error 가 있으면 고쳐서 다시 제출
```

- 제출물은 서버 실행과 **같은 규칙 검사·게이트**를 지나므로 품질 기준이 달라지지 않습니다.
- 결정 방식이 "AI가 결정"인데 서버 제공자가 없으면 AI 검수를 건너뛰고 사람 검수로 넘깁니다.
- 로컬 오픈소스 모델(내 PC의 Ollama 등)은 이 경로로 씁니다: 로컬 모델을 쓰는 에이전트가 CLI로 brief/submit.
- 조사 단계는 에이전트에 웹 검색 도구가 있어야 합니다.

## 5. CLI 요약

```
tpf board | waiting | get <id> [step] | metrics | providers
tpf new [주제] | advance <id> --loop | run <id> <step> [--feedback …] [--provider …]
tpf approve|reject <id> <step> [--note …] | ai-decide <id> <step> [--apply]
tpf brief <id> <step> | submit <id> <step> <file.json> [--agent 이름]
tpf sop list|get|set … | render <id> | publish <id>
```
`<id>` 자리에 `latest` 가능. 전체: `node bin/tpf.mjs help`.
