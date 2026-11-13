# 연결 순서 (Supabase → GitHub → Vercel)

## 1. Supabase
1. 새 프로젝트 생성 (리전: Northeast Asia (Seoul))
2. **Authentication → Users → Add user**: 관리자 이메일·비밀번호로 계정 생성 (Auto Confirm 체크)
3. `supabase-all-in-one.sql` 맨 아래의 `your-email@example.com` 을 2번 이메일로 바꾸기
4. **SQL Editor → New query** → 파일 전체 붙여넣기 → **Run** → 마지막에 테이블 19개 목록이 나오면 완료
5. **Project Settings → API** 에서 Project URL · anon public · service_role 키 복사

## 2. GitHub
1. 비공개 저장소 생성 → 압축을 푼 폴더 전체 push
2. `github-secrets.txt` 의 값들을 Secrets 에 등록 (WORKER_SECRET 은 이미 채워져 있음)
3. Fine-grained 토큰 발급: 이 저장소 · Contents(Read and write) → Vercel 의 GITHUB_TOKEN

## 3. Vercel
1. **Add New → Project → Import** (위 저장소, Framework: Next.js 자동)
2. **Environment Variables** 에 `vercel-env.txt` 내용 붙여넣기 → 1·2·3·4번 묶음은 필수
3. **Deploy** → 받은 주소를 NEXT_PUBLIC_SITE_URL(Vercel)·SITE_URL(GitHub) 에 넣고 **Redeploy**
4. 함수 실행 시간 때문에 Pro 플랜 권장 (Hobby 는 60초에서 끊길 수 있음)

## 4. 확인
- `https://배포주소/login` → 관리자 로그인
- 설정 → AI 제공자 상태 · 테스트 메일 · GitHub 테스트
- 현황판 → 새 숏폼 → "가능한 곳까지 자동 진행"

`vercel-env.txt`·`github-secrets.txt` 에는 서로 맞춰야 하는 비밀값(WORKER_SECRET·MCP_TOKEN·CRON_SECRET)을 새로 생성해 넣었습니다. 이 두 파일은 저장소에 올리지 마세요 (.gitignore 에 포함).
