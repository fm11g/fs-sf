---
name: tpf-status
description: 오늘의 정책자금 숏폼 공장의 현황을 확인한다. "현황판", "지금 뭐 기다려?", "어디까지 됐어", "검수 대기", "작업 효율" 같은 요청에 사용.
---

# 현황 확인

1. `tpf board` (MCP: `factory_board`) 로 콘텐츠별 단계 상태를 가져온다.
2. 다음 순서로 짧게 보고한다.
   - **결정이 필요한 것**: `current_step` 의 상태가 `review` 인 콘텐츠 — 주제, 단계, 한 줄 요약
   - **재작업 필요/실패**: `stale` `rejected` `failed`
   - **진행 중**: `running`
   - 나머지는 개수만
3. 운영자가 특정 콘텐츠를 물으면 `tpf get <id>` 로 단계별 상태·규칙 검사·AI 의견 요약을, `tpf get <id> <step>` 으로 산출물 전문을 본다.
4. 효율을 물으면 `tpf metrics --days 30`: 가장 오래 걸리는 단계, 재작업이 많은 단계, AI 결정 비율, 조회→신청 전환을 먼저 말한다.
5. 채널 반응을 물으면 `tpf channels`, 편성은 `tpf lineup` (`tpf-editorial`).
6. 점수를 물으면 `tpf learn` (단계별 평가 수·평균), 데이터 저장 상태는 `tpf export status` (GitHub·시트 대기·실패).
7. 서버 AI가 안 돌면 `tpf providers` 로 어떤 제공자가 준비됐는지 확인한다.

표로 길게 나열하지 말고, 운영자가 지금 해야 할 일 위주로 말한다.

## 공장 조작 방법 (모든 스킬 공통)

두 가지 중 되는 것을 씁니다. 도구 이름과 인자는 같습니다.

1. **MCP 도구** — `tpf` 서버가 연결되어 있으면 `factory_board`, `content_get`, `pipeline_advance`, `step_run`, `step_decide`, `step_brief`, `step_submit`, `sop_get` … 을 직접 호출
2. **CLI** — MCP가 없으면 저장소 루트에서 `node bin/tpf.mjs <명령>` (환경변수 `TPF_URL`, `MCP_TOKEN` 또는 `.env.tpf`). `node bin/tpf.mjs help` 로 전체 명령 확인

단계 키: `research`(조사) `plan`(기획) `script`(40초 대사) `offer`(이벤트) `landing`(랜딩 문구) `design`(디자인) `copy`(채널 카피) `post`(SEO 글) `render`(렌더) `publish`(업로드)
상태: `pending` 대기 · `running` 작업 중 · `review` 검수 대기 · `approved` 승인 · `rejected` 반려 · `stale` 재작업 필요 · `failed` 실패

## 반드시 지킬 것

- `publish`(외부 공개)는 운영자가 이번 대화에서 명시적으로 요청했을 때만 실행합니다.
- 승인(`approve`)은 운영자가 맡겼을 때만 대신 합니다. 맡기지 않았으면 산출물을 요약해 보여주고 결정을 묻습니다.
- 금액·금리·기간·자격은 조사 산출물에 있는 것만 씁니다. 승인·한도 보장 표현, 근거 없는 마감·선착순은 만들지 않습니다.
