---
name: tpf-produce
description: 오늘의 정책자금 숏폼 1편을 조사부터 렌더 직전까지 진행한다. "오늘 영상 만들어줘", "숏폼 하나 돌려줘", "이어서 진행해줘", 특정 주제로 새 콘텐츠를 만들 때 사용.
---

# 숏폼 제작 진행

## 절차

1. 새로 만들면 `tpf new [주제]` → `id` 확보. 반환의 `editorial` 이 오늘 편성 슬롯(주제 분류·각도·훅·구성) — 운영자에게 한 줄로 알린다 (`tpf-editorial`). 이어서 하면 `tpf board` 에서 해당 `id` (가장 최근이면 `latest`).
2. `tpf advance <id> --loop` — "사람이 결정" 단계나 워커 단계에서 멈춘다. 반환 `action` 에 따라:
   - `continue` → 다시 advance
   - `wait_review` → **멈춘다.** `tpf get <id> <step>` 으로 산출물을 읽고 아래 "검수 보고" 형식으로 운영자에게 보여준 뒤 결정을 받는다
   - `worker` + `render` → `tpf render <id>` 요청 후 3~6분 걸린다고 알린다
   - `worker` + `publish` → 운영자에게 게시 여부를 묻는다 (자동 실행 금지)
   - `running` → 잠시 뒤 `tpf get <id>` 로 다시 확인
3. 운영자 결정 반영
   - 승인 → `tpf approve <id> <step>` 후 2번으로
   - 수정 지시 → `tpf run <id> <step> --feedback "지시 그대로"` (이전 산출물을 그 지시대로 고친다)
   - 반려 → `tpf reject <id> <step> --note "사유"`
   - 평가를 말하면("이거 5점", "좋다") → `tpf rate <id> <step> <점수> --tags … --note "이유"` 후 승인 (`tpf-learn`)
4. 서버 AI가 모두 실패하면(`모든 AI 제공자 실패`, `사용 가능한 AI 제공자가 없습니다`) → `tpf-step-local` 스킬로 그 단계를 직접 작성해 제출한다.

## 검수 보고 형식 (단계마다 3~6줄)

- **조사**: 선택한 주제와 편성 슬롯 일치 여부, 핵심 숫자(한도·금리·마감)와 출처 기관, 확인 못 한 것(risk_notes), 탈락 후보
- **기획**: 선택한 훅과 나머지 후보, 장면 수·총 초
- **대사**: 내레이션 전문(짧으므로 그대로), 글자수
- **이벤트**: 이벤트명, 주력 혜택, 마감 문구와 근거, 실제 운영 가능한지 질문
- 공통: 규칙 검사에 `error`/`warn` 이 있으면 먼저, AI 의견의 `questions` 가 있으면 함께 묻는다

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
