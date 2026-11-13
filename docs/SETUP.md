# 설치

## 1. Supabase
1. 새 프로젝트 → SQL Editor에서 `supabase/migrations/001_init.sql`, `002_workflow.sql`, `003_providers.sql`, `004_learning_notify.sql`, `005_scores_export.sql` 순서로 실행
2. Authentication → Users → 관리자 계정 생성(이메일·비밀번호)
3. SQL: `insert into admins (email) values ('관리자 이메일');`
4. Settings → API에서 `URL`, `anon key`, `service_role key` 복사

## 2. GitHub
1. 이 폴더 전체를 새 저장소(비공개 권장)에 push
2. Settings → Secrets and variables → Actions → Secrets

| Secret | 값 |
|---|---|
| `SUPABASE_URL` `SUPABASE_SERVICE_ROLE_KEY` | 1-4에서 복사 |
| `SITE_URL` | Vercel 배포 주소 (예: https://today-policy-fund.vercel.app) |
| `WORKER_SECRET` | 임의의 긴 문자열 (Vercel에도 같은 값) |
| `FISH_AUDIO_API_KEY` | Fish Audio API 키 |
| `YT_CLIENT_ID` `YT_CLIENT_SECRET` `YT_REFRESH_TOKEN` | 4번에서 발급 |
| `IG_USER_ID` `IG_ACCESS_TOKEN` | 4번에서 발급 |

3. Fine-grained PAT 발급(이 저장소, Contents: Read and write) → Vercel의 `GITHUB_TOKEN`

## 3. Vercel
1. 저장소 Import (Framework: Next.js, Root: 저장소 루트)
2. Environment Variables — `.env.example` 상단 블록. AI 제공자는 **하나 이상**만 있으면 됩니다(Claude / OpenAI / 오픈소스). 여러 개 넣으면 실패 시 자동 전환 → [AGENTS-SKILLS.md](AGENTS-SKILLS.md)
3. 배포 후 `/login` 접속 확인. 플랜은 Pro 권장(함수 300초)

## 4. 채널 연결
**유튜브**
1. Google Cloud → YouTube Data API v3 사용 설정 → OAuth 클라이언트(웹 애플리케이션)
2. 승인된 리디렉션 URI: `https://사이트/api/oauth/youtube/callback`
3. 관리자 → 설정 → "유튜브 채널 연결" → 표시된 값을 GitHub Secret `YT_REFRESH_TOKEN`에 저장
4. 공개 업로드를 위해 YouTube API 서비스 감사 신청 (통과 전에는 비공개로 잠김)

**인스타그램**
1. 비즈니스/크리에이터 계정 + 연결된 페이스북 페이지
2. Meta 개발자 앱 → `instagram_content_publish`, `instagram_manage_comments` 권한의 장기 토큰
3. 프로필 링크를 `https://사이트/l/today` 로 설정

## 5. 관리자 초기 세팅 (순서대로)
1. **설정**: 사이트 URL · 타깃 · 제공 가능한 혜택(이벤트 재료) · Fish Audio 보이스 ID · BGM 업로드(무드별 2곡 이상)
2. **랜딩 템플릿**: "샘플 불러오기" 또는 기존 랜딩 HTML 붙여넣기 → `data-slot` 표시 → 활성 → 저장
3. **SOP·AI 제어**: 단계별 결정 방식 확인 (처음 2주는 01~04·09·10 을 "사람이 결정"으로 유지 권장)
4. **현황판** → "새 숏폼" → "가능한 곳까지 자동 진행"으로 첫 편 제작

## 6. 기존 랜딩 도메인을 그대로 쓰는 경우 (govbizfund.co.kr 등)
1. 기존 index.html의 바꿀 문구에 `data-slot="키" data-max="글자수" data-label="용도"` 추가
2. 신청폼에 `data-tpf-form`, 신청 버튼에 `data-cta` 추가 (자체 폼을 유지하려면 생략)
3. `</body>` 앞에 `<script src="https://사이트/sync.js" data-slug="today" defer></script>`
4. 같은 HTML을 관리자 [랜딩 템플릿]에도 등록(슬롯 정의용). 유튜브·인스타 링크를 기존 도메인으로 보내려면 설정의 사이트 URL 대신 링크 규칙(`lib/pipeline.ts`의 `landingLink`)을 수정

## 7. 이메일 알림 (권장)
Vercel 에 `RESEND_API_KEY`+`EMAIL_FROM` 또는 `SMTP_*`, 그리고 `CRON_SECRET` 을 넣고 → 관리자 설정 → 📧 이메일 알림에서 받는 주소 저장 → 테스트 메일. 자세히: [LEARNING-NOTIFY.md](LEARNING-NOTIFY.md)

## 8. 데이터 저장 (권장)
GitHub: `GITHUB_TOKEN` 에 Contents 쓰기 권한이 있으면 같은 저장소의 `data` 브랜치에 자동 저장 → 설정 → 데이터 저장 → "GitHub 테스트". 구글 시트: 서비스 계정 또는 Apps Script(`integrations/google-sheets/Code.gs`) → "시트 테스트". 자세히: [DATA-SCORES.md](DATA-SCORES.md)

## 9. 에이전트 연결 (선택)
Claude Code·Codex에서 스킬로 공장을 조작하려면 Vercel에 `MCP_TOKEN` 을 넣고 [AGENTS-SKILLS.md](AGENTS-SKILLS.md)의 "연결"을 따릅니다.

## 로컬 실행
```
cp .env.example .env.local   # 값 채우기
npm install && npm run dev   # http://localhost:3000/admin
cd worker && npm install && bash scripts/fonts.sh && npm run studio   # 모션그래픽 미리보기
```
