# 설치

> 빠른 길: `setup/README.md` (SQL 한 번 · Vercel 3개 · GitHub 2개 · 첫 가입)

## 1. Supabase
1. 새 프로젝트 → SQL Editor에서 `setup/supabase-all-in-one.sql` 한 번 실행 (= migrations 001~008)
2. Settings → API에서 `URL`, `anon key`, `service_role key` 복사
3. 관리자 계정은 SQL 로 넣지 않습니다 — 배포 후 첫 접속 때 **대표 계정 만들기** 화면에서 생성

## 2. GitHub
1. 이 폴더 전체를 새 저장소(비공개 권장)에 push
2. Settings → Secrets and variables → Actions → `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 두 개만 등록
   (워커는 나머지 키를 Supabase `app_secrets` 에서 읽음 · 관리자 [연결·키] → [워커에 적용]으로 자동 등록도 가능)

## 3. Vercel
1. 저장소 Import (Framework: Next.js, Root: 저장소 루트)
2. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 세 개만
3. 배포 → 사이트 접속 → 대표 계정 만들기(아이디 로그인, 이메일 선택) → **연결·키** 메뉴에서 AI 키(하나 이상)·GitHub 저장소/토큰(Contents·Secrets 읽기/쓰기)·Fish Audio·유튜브·인스타·이메일 입력
   (`.env.example` 은 로컬 개발용. 환경변수와 관리자 입력값이 둘 다 있으면 관리자 입력값 우선)
4. **AI 모델** 메뉴에서 작업별 모델·생각 깊이 선택, **직원 · 권한** 메뉴에서 직원 추가·권한 블록 지정. 플랜은 Pro 권장(함수 300초)

## 4. 채널 연결
**유튜브**
1. Google Cloud → YouTube Data API v3 사용 설정 → OAuth 클라이언트(웹 애플리케이션)
2. 승인된 리디렉션 URI: `https://사이트/api/oauth/youtube/callback`
3. 관리자 → 연결·키 → "유튜브 계정 연결" → 리프레시 토큰이 자동 저장됨 (워커도 그대로 사용)
4. 공개 업로드를 위해 YouTube API 서비스 감사 신청 (통과 전에는 비공개로 잠김)

**인스타그램**
1. 비즈니스/크리에이터 계정 + 연결된 페이스북 페이지
2. Meta 개발자 앱 → `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`(채널 성과) 권한의 장기 토큰
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

## 8. 채널 성과 · 편성 (권장)
관리자 → 채널 성과에 유튜브·인스타 링크 저장 → "지금 수집". 유튜브 공유수·시청 지속률까지 쓰려면 설정 → 유튜브 채널 연결을 한 번 더 해서 새 `YT_REFRESH_TOKEN` 을 GitHub Secret 에 저장(Analytics 권한 추가). 자세히: [CHANNELS-EDITORIAL.md](CHANNELS-EDITORIAL.md)

## 8-1. 데이터 저장 (권장)
GitHub: `GITHUB_TOKEN` 에 Contents 쓰기 권한이 있으면 같은 저장소의 `data` 브랜치에 자동 저장 → 설정 → 데이터 저장 → "GitHub 테스트". 구글 시트: 서비스 계정 또는 Apps Script(`integrations/google-sheets/Code.gs`) → "시트 테스트". 자세히: [DATA-SCORES.md](DATA-SCORES.md)

## 9. 에이전트 연결 (선택)
Claude Code·Codex에서 스킬로 공장을 조작하려면 Vercel에 `MCP_TOKEN` 을 넣고 [AGENTS-SKILLS.md](AGENTS-SKILLS.md)의 "연결"을 따릅니다.

## 로컬 실행
```
cp .env.example .env.local   # 값 채우기
npm install && npm run dev   # http://localhost:3000/admin
cd worker && npm install && bash scripts/fonts.sh && npm run studio   # 모션그래픽 미리보기
```
