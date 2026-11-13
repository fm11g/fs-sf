# 연결 순서 (Supabase → GitHub → Vercel → 첫 가입)

## 1. Supabase
1. 새 프로젝트 생성 (리전: Northeast Asia (Seoul))
2. **SQL Editor → New query** → `supabase-all-in-one.sql` 전체 붙여넣기 → **Run** → 마지막에 테이블 21개 목록이 나오면 완료
   (예전 버전 SQL 을 이미 실행했어도 그대로 다시 실행하면 됩니다)
3. **Project Settings → API** 에서 Project URL · anon public · service_role 키 복사
4. 관리자 계정은 여기서 만들지 않습니다 → 4단계 첫 가입에서 만듭니다

## 2. GitHub
1. 비공개 저장소 생성 → 압축을 푼 폴더 전체 push
2. `github-secrets.txt` 의 2개(SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY)를 Actions Secrets 에 등록

## 3. Vercel
1. **Add New → Project → Import** (위 저장소, Framework: Next.js 자동)
2. **Environment Variables** 에 `vercel-env.txt` 의 3개만 입력 → **Deploy**
3. 함수 실행 시간 때문에 Pro 플랜 권장 (Hobby 는 60초에서 끊길 수 있음)

## 4. 첫 가입 → 관리자 페이지에서 나머지 입력
1. `https://배포주소/` 접속 → 대표 계정이 없으면 **대표 계정 만들기** 화면이 뜸 → 아이디·이름·비밀번호 입력 (이메일은 선택 — 작업 알림 받을 주소)
   (사이트 주소·워커 비밀값·MCP 토큰은 이때 자동 생성)
2. 로그인 → **연결·키** 메뉴: Claude/OpenAI 키, GitHub 저장소·토큰, Fish Audio, 유튜브, 인스타, 이메일 입력 → 저장
   → [워커에 적용]으로 GitHub Secrets 자동 등록 · [유튜브 계정 연결]로 리프레시 토큰 자동 저장
3. **AI 모델** 메뉴: 작업마다 Claude 모델과 생각 깊이 선택 (기본은 추천 분류: 깊은 생각 / 보통 / 빠른 처리)
4. **직원 · 권한** 메뉴: 직원 추가(아이디 + 임시 비밀번호) → 볼 수 있는 블록(화면·공정 단계)과 보기/작업 권한 지정
5. 현황판 → 새 숏폼 → "가능한 곳까지 자동 진행"

Vercel 환경변수에 같은 이름의 값이 있어도 관리자 페이지에 저장한 값이 우선합니다.
