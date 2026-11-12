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
