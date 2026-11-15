---
name: tpf-review
description: 검수 대기 중인 단계 산출물을 SOP 체크리스트로 검수하고 승인·반려·수정안을 제시한다. "검수해줘", "이거 통과시켜도 돼?", "대사 봐줘", "랜딩 문구 점검" 같은 요청에 사용.
---

# 단계 검수

1. 대상 확인: `tpf waiting` 또는 운영자가 지정한 `<id> <step>`.
2. 근거 수집 (세 가지를 모두 읽는다)
   - 산출물: `tpf get <id> <step>` — `step.checks`(규칙 검사), `step.ai_notes`(작성 AI 의견) 포함
   - 기준: `tpf sop get <step>` 의 `체크리스트`·`금지`
   - 상위 산출물: 이 단계가 읽는 단계 (`research` 는 항상) — 숫자·기관명 대조용
3. 판정 — 봐주지 않는다
   - 체크리스트 항목마다 통과/미달과 근거 한 줄
   - 조사 산출물에 없는 숫자·사실, 금지 표현, 승인 보장 뉘앙스, 근거 없는 마감은 무조건 미달
   - 취향 차이만으로는 반려하지 않는다 (제안으로 분리)
4. 보고: `통과 / 수정 필요` + 반드시 고칠 것 + 고치면 좋은 것 + 재작업 지시문 초안(그대로 `--feedback` 에 쓸 수 있게).
5. 실행은 운영자 뜻대로
   - "통과시켜" → `tpf approve <id> <step> --note "검수 요약"`
   - "고쳐" → `tpf run <id> <step> --feedback "…"` 후 결과를 다시 검수
   - 서버 AI 검수자에게 맡기려면 `tpf ai-decide <id> <step> [--apply]`

6. 검수 판정을 점수로 남길지 운영자에게 묻고, 동의하면 `tpf rate <id> <step> <1-5> --tags … --note "근거"` — 다음 생성의 참고 예시와 SOP 학습 근거가 된다 (`tpf-learn` 스킬). 검수자 의견만으로 점수를 매기지 말고 운영자 판단을 따른다.

렌더(영상)는 직접 볼 수 없다. 길이·규칙 검사 결과만 말하고 영상 확인은 운영자에게 맡긴다.

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
