# CLAUDE.md

@AGENTS.md

## Claude Code 전용

- 스킬은 `.claude/skills/tpf-*`, 서브에이전트는 `.claude/agents/tpf-*` 에 있습니다.
- 공장 MCP 서버는 `.mcp.json` 의 `tpf` 입니다. 셸에 `TPF_URL`, `MCP_TOKEN` 이 있어야 연결됩니다.
- 검수는 산출물을 만든 컨텍스트와 분리하기 위해 `tpf-reviewer` 서브에이전트에 맡깁니다.
