---
name: tpf-produce
description: 오늘의 정책자금 숏폼 1편을 조사부터 렌더 직전까지 진행한다. "오늘 영상 만들어줘", "숏폼 하나 돌려줘", "이어서 진행해줘", 특정 주제로 새 콘텐츠를 만들 때 사용.
---

# 숏폼 제작 진행

## 절차

1. 새로 만들면 `tpf new [주제]` → `id` 확보. 이어서 하면 `tpf board` 에서 해당 `id` (가장 최근이면 `latest`).
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
   - "이거 좋다" → 승인과 함께 `tpf good <id> <step> --note "좋은 이유"` (SOP 학습 재료, `tpf-learn`)
4. 서버 AI가 모두 실패하면(`모든 AI 제공자 실패`, `사용 가능한 AI 제공자가 없습니다`) → `tpf-step-local` 스킬로 그 단계를 직접 작성해 제출한다.

## 검수 보고 형식 (단계마다 3~6줄)

- **조사**: 선택한 주제, 핵심 숫자(한도·금리·마감)와 출처 기관, 확인 못 한 것(risk_notes), 탈락 후보
- **기획**: 선택한 훅과 나머지 후보, 장면 수·총 초
- **대사**: 내레이션 전문(짧으므로 그대로), 글자수
- **이벤트**: 이벤트명, 주력 혜택, 마감 문구와 근거, 실제 운영 가능한지 질문
- 공통: 규칙 검사에 `error`/`warn` 이 있으면 먼저, AI 의견의 `questions` 가 있으면 함께 묻는다

{{COMMON}}
