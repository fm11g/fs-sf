---
name: tpf-step-local
description: 서버 AI(Claude·OpenAI·오픈소스 API)를 쓰지 않고, 지금 대화 중인 에이전트가 직접 공장의 한 단계 산출물을 작성해 제출한다. 서버 제공자가 모두 실패했거나 API 키가 없을 때, 또는 "네가 직접 써줘"라고 할 때 사용.
---

# 에이전트 직접 작업 (brief → 작성 → submit)

Codex, Claude Code, OpenCode 등 어떤 에이전트든 같은 절차입니다. 서버에 API 키가 없어도 공정이 굴러갑니다.

1. 지시문 받기: `tpf brief <id> <step> [--feedback "수정 지시"]` (MCP: `step_brief`)
   - `system`: 역할·고정 규칙·이 단계 SOP·자유도
   - `task`: 상위 산출물과 **출력 JSON 스키마**
   - `needs_web_search`: true 면(조사 단계) 반드시 실제 웹 검색을 한다
2. 작성: `system` 과 `task` 를 그대로 따른다.
   - 스키마의 키를 바꾸거나 빼지 않는다. 최상위 `_ai` (opinion·suggestions·alternatives·questions·confidence) 도 채운다
   - 조사: 기관 공식 페이지에서 확인한 사실만 `facts` 에 넣고 `source_url` 을 실제 URL로. 검색 도구가 없으면 **조사 단계는 하지 않는다** — 운영자에게 검색 가능한 환경이 필요하다고 알린다
   - 글자수 규칙(대사 210~250자·자막 14자·랜딩 슬롯 최대치)을 제출 전에 직접 세어 본다
   - 링크 자리는 `{LINK}` 토큰 그대로 둔다 (서버가 채움)
3. 파일로 저장 후 제출: `/tmp/tpf-<step>.json` 에 JSON만 저장 → `tpf submit <id> <step> /tmp/tpf-<step>.json --agent <codex|claude-code|opencode…>`
4. 결과 확인: 반환의 `checks` 에 `error` 가 있으면 그 항목만 고쳐 다시 제출한다. `state` 가 `review` 면 운영자 결정을 기다리고, `approved` 면 다음 단계로.

여러 단계를 연달아 직접 작업할 때는 단계마다 운영자 결정 방식(SOP의 gate)을 그대로 따른다 — 건너뛰지 않는다.

{{COMMON}}
