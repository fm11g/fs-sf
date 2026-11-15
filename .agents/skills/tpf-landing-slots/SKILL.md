---
name: tpf-landing-slots
description: 기존 랜딩페이지 HTML에 data-slot 속성을 붙여 공장의 랜딩 문구 자동 교체·신청폼·집계에 연결한다. "랜딩에 슬롯 붙여줘", "이 랜딩을 연동해줘", 새 랜딩 템플릿을 등록할 때 사용.
---

# 랜딩 HTML 슬롯 작업

참고 구현: `landing/template.html` (슬롯 50개 + 신청폼 · 선택 슬롯은 비우면 자동 숨김), 파서: `lib/landing.ts`.

1. 대상 HTML을 읽고 **바뀌어야 하는 문구**만 고른다: 배지, 헤드라인, 서브, 핵심 포인트 제목·설명, 이벤트명·설명·혜택·마감, 진행 단계, 폼 제목·버튼, Q&A, 유의사항, `<title>`, meta description, og:title. 회사 정보·약관·메뉴는 건드리지 않는다.
2. 각 요소에 속성 추가 (태그 구조·클래스·스타일은 그대로 둔다)
   - `data-slot="키"` — 영문 소문자+밑줄, 문서에서 유일. 샘플과 같은 역할이면 같은 키(`hero_title`, `event_title`, `cta_label` …)
   - `data-max="N"` — 공백 포함 최대 글자수. **현재 문구 길이와 레이아웃을 보고** 정한다(보통 현재 길이의 1.0~1.2배, 한 줄 제목은 모바일에서 줄이 넘지 않는 값)
   - `data-label="용도"` — AI가 읽는 설명. 무엇을 써야 하는지 구체적으로 (예: "메인 헤드라인(영상 훅과 같은 단어)")
   - 속성값을 바꿀 때: `data-slot-attr="content"` (meta 등) · 신청 완료 메시지는 `<form data-tpf-form data-slot-attr="data-done">`
   - 슬롯 요소 안에는 글자만 (안쪽 태그는 교체 때 사라짐). 줄바꿈은 원문에 `<br>`, AI 값은 `\n`
   - `data-label` 은 AI 가 읽는 작성 지침: "용도 — 지침" 형식. 근거가 있을 때만 쓰는 슬롯은 "(선택) …" 으로 시작
   - 선택 슬롯이 비면 숨기기: `#id [data-slot]:empty{display:none!important}` (+ 묶음은 `:has(.x:empty)`)
   - 유의사항·개인정보 동의 같은 법적 문구는 슬롯으로 만들지 않음
   - 문구 안에 `<br>` 만 있으면 그대로 두면 된다(줄바꿈으로 처리). 문구 안에 다른 태그가 섞여 있으면 안쪽 텍스트 노드를 `<span data-slot>` 으로 감싼다
3. 신청 연결
   - 신청 버튼·링크에 `data-cta` (클릭 집계)
   - 공장 신청폼을 쓰면 `<form data-tpf-form>` + 필드명 `name` `phone` `company` `memo` `consent`(체크박스) + 허니팟 `website` + 메시지 영역 `<p data-tpf-msg>`. 기존 자체 폼을 유지하면 건드리지 않는다
4. 자체 도메인에서 서비스하면 `</body>` 앞에 `<script src="https://사이트/sync.js" data-slug="today" defer></script>`.
5. 검증: `node -e` 또는 `npx tsx` 로 `parseSlots` 를 돌려 슬롯 수·키 중복·`data-max` 누락을 확인하고, 슬롯 표(키/용도/최대/현재 문구)를 운영자에게 보여준다.
6. 등록은 관리자 [랜딩 템플릿]에 붙여넣기(활성 체크). 등록 후 `landing` 단계를 다시 실행하면 새 슬롯으로 문구가 채워진다.

개인정보 동의 문구와 보유기간은 임의로 바꾸지 않는다.
