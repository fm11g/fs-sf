# 오늘의 정책자금 — 숏폼 공장

유튜브 쇼츠·인스타 릴스 채널 '오늘의 정책자금'의 **조사 → 기획 → 40초 대사 → 이벤트 → 랜딩 문구 → 디자인·모션 → 채널 카피 → SEO 정보글 → 렌더 → 업로드**를 한 관리자 페이지에서 단계별로 확인·결정하며 흘려보내는 웹 공장입니다.

- 단계마다 **중간 산출물 → 규칙 검사 → AI 의견 → 결정(사람 / AI / 자동)** 을 거쳐야 다음 단계가 그 값을 받아 진행합니다.
- 단계마다 **SOP(md)** 가 있어 AI가 무엇에 집중할지, 얼마나 자유롭게 일할지(자유도 0~3), 누가 결정할지를 관리자에서 언제든 바꿉니다.
- **현황판**(어느 콘텐츠가 어느 단계에서 무엇을 기다리는지)과 **작업 효율**(단계별 작업·대기 시간, 재작업률, AI 결정 비율, 비용, 조회→신청 전환)을 제공합니다.
- **API + MCP 서버 + CLI**로 Claude Code · Codex · 그 밖의 에이전트에서 같은 스킬로 공장을 조작합니다.
- 작업 중 내가 고른 **좋은 결과물(👍·직접 고친 것·성과)에서 패턴을 찾아 기존 SOP 를 줄 단위로 보완**합니다. 제안만 받거나 자동 반영하거나, 변경별로 골라·고쳐 반영하고 되돌릴 수 있습니다.
- 단계가 끝날 때마다 **입력한 이메일로 일의 흐름과 정리된 내용**을 보내고, 매일 18시에 하루 요약을 보냅니다.
- 서버 AI는 **Claude → OpenAI → 오픈소스 모델** 순으로 자동 전환되고, 전부 안 되면 **에이전트가 직접 작성해 제출**하는 경로가 있습니다.

## 흐름

```
01 조사 ──▶ 02 기획 ──▶ 03 40초 대사 ──┬─▶ 04 이벤트·오퍼 ──┬─▶ 05 랜딩 문구 ─────────┐
 (웹검색·MCP)            (모든 하위 단계의 기준) │                  ├─▶ 07 채널 카피 ─────────┤
                                       │                  └─▶ 08 SEO 정보글 ───────┤
                                       └─▶ 06 디자인·모션 ──▶ 09 렌더(음성·자막·BGM) ─┴─▶ 10 업로드·공개
```

| 구성 | 역할 |
|---|---|
| **Vercel** (Next.js 14) | 관리자 `/admin`, AI 단계 실행 API, MCP 서버 `/api/mcp`, 공개 랜딩 `/l/슬러그`·`/l/today`, 정보글 `/policy/슬러그`, 신청 접수 `/api/leads` |
| **GitHub Actions** (`worker/`) | AI 목소리(Fish Audio) → Remotion 모션그래픽·자막·BGM 렌더 → 유튜브·인스타 업로드·댓글. 매일 06:10 KST 자동 가동 |
| **Supabase** | 콘텐츠·단계 상태·SOP·랜딩·신청 데이터, 영상·음성·이미지 스토리지 |
| **GitHub 저장소** | 코드 + `sop/*.md`(SOP 기본값, 관리자에서 고친 내용을 커밋 가능) |

## 폴더

```
app/admin/            현황판 · 작업대(contents/[id]) · 작업 효율 · SOP·AI 제어 · 랜딩 템플릿 · 신청 내역 · 설정
app/api/              pipeline(단계 실행·advance) · steps(결정) · sop · board · metrics · leads · track · mcp · render · publish
app/(site)/, app/l/   공개 사이트(SEO 정보글) · 랜딩 서빙
lib/steps.ts          공정 정의(순서·의존 관계) ← 단계를 추가/변경할 때 여기부터
lib/pipeline.ts       생성 → 규칙 검사 → 결정 방식 적용 → 하위 단계 무효화
lib/prompts.ts        단계별 출력 형식(JSON 스키마). SOP md 는 여기에 주입됨
lib/learn.ts          좋은 결과물 → SOP 학습 제안·반영·되돌리기 (lib/sop-merge.ts: 줄 단위 적용)
lib/notify.ts         이메일 알림 (lib/email.ts: 발송·템플릿) · vercel.json 크론(매일 18시 요약)
lib/llm.ts            AI 제공자 전환 (claude → openai → oss) · 외부 검색 주입
lib/sop.ts, sop/*.md  SOP 로딩·저장·GitHub 커밋 / 단계별 SOP 기본값
skills/               에이전트 스킬 원본 → .claude/skills · .agents/skills 로 동기화 (npm run skills:sync)
.claude/agents/       Claude Code 서브에이전트 (producer · reviewer · researcher · sop-editor)
AGENTS.md, CLAUDE.md  에이전트 공통 지침 (Codex 등 / Claude Code)
bin/tpf.mjs           공장 CLI — MCP가 없는 에이전트도 같은 명령으로 조작
landing/template.html 신청 유도형 랜딩 샘플(슬롯 30개 + 신청폼)
worker/               렌더·업로드 워커 (video/Short.tsx = 모션그래픽)
supabase/migrations/  001 → 002 → 003 → 004_learning_notify.sql 순서로 실행
docs/                 SETUP · OPERATIONS(운영 SOP) · API-MCP
```

## 문서

- [docs/SETUP.md](docs/SETUP.md) — 설치 (Supabase → GitHub → Vercel → 채널 연결), 30분
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — 매일 운영하는 법, 결정 방식·자유도 조정 기준, 성과를 SOP에 반영하는 법
- [docs/LEARNING-NOTIFY.md](docs/LEARNING-NOTIFY.md) — 좋은 결과물로 SOP 자동 보완, 수동 조절, 이메일 알림 설정과 내용
- [docs/AGENTS-SKILLS.md](docs/AGENTS-SKILLS.md) — Claude Code·Codex·오픈소스 에이전트 연결, 스킬 사용법, AI 제공자 전환, API 키 없이 진행하는 법
- [docs/API-MCP.md](docs/API-MCP.md) — REST API와 MCP 도구 목록, Claude 연결 방법
- [sop/README.md](sop/README.md) — SOP 작성 규칙과 단계별 파일

## 알아둘 제약

| 항목 | 내용 |
|---|---|
| 유튜브 **고정** 댓글 | 댓글 작성은 자동, "고정"은 API에 없어 스튜디오에서 1회 클릭 |
| 유튜브 API 감사 | 감사 통과 전 프로젝트로 올린 영상은 비공개로 잠김 → 운영 전 신청 |
| 인스타 캡션 링크 | 클릭 불가 → 프로필 링크를 `/l/today` 로 고정 |
| 오픈소스 모델 | Vercel이 접근할 수 있는 주소여야 함(내 PC localhost 불가). 조사 단계는 별도 검색 키 필요. 품질 편차가 커서 처음엔 사람 검수 권장 |
| 영상 검수 | AI는 영상을 보지 못함. 렌더 단계의 AI/자동 결정은 길이 등 규칙 검사만 수행 |
| Vercel 함수 시간 | 한 단계 = 생성 + AI 검수 + 재작업까지 한 요청. Pro 플랜(300초) 권장 |
| Remotion 라이선스 | 4인 이상 회사는 Company License 필요 |
| 이벤트 문구 | AI는 설정의 "제공 가능한 혜택" 안에서만 구성. 마감은 공고의 실제 날짜만 사용 |
| 신청 개인정보 | 랜딩 폼의 수집·이용 동의 문구와 보유기간을 실제 운영에 맞게 수정 |
