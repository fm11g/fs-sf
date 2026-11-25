# 오늘의 정책자금 홈페이지 연동 — 숏폼별 DB 추적 · 정보글 자동 발행 · DB 가중 성과

숏폼 한 편마다 **고유 코드**가 붙고, 그 코드가 유튜브·인스타 링크 → 홈페이지 방문 → 신청(DB)까지 따라갑니다.
홈페이지 관리자에서는 DB 마다 어느 숏폼·어느 채널에서 왔는지 보이고, 공장에서는 숏폼별 DB 수가 성과 점수의 가장 큰 비중(기본 40%)이 됩니다.

## 전체 흐름

```
[공장] 콘텐츠 생성 ── track_code 자동 부여 (slug 2026-11-19-a1b2 → 261119a1b2)
   │
   ├─ 07 채널 카피: {LINK} → 홈페이지 추적 링크 (자리마다 다른 ch)
   │     유튜브 설명   https://홈페이지/go.html?c=261119a1b2&ch=yt&utm_source=youtube&utm_medium=shorts_description&utm_campaign=261119a1b2
   │     유튜브 댓글   …&ch=ytc     인스타 캡션 …&ch=ig     인스타 첫 댓글 …&ch=igc
   │     인스타 프로필 https://홈페이지/go.html?c=today&ch=igp   (항상 가장 최근 숏폼)
   │
   ├─ 08 SEO 정보글: 검색형 제목 · 메타 설명 · 키워드 · ## 소제목(목차) · 표 · FAQ · {LINK}
   │
   └─ 10 업로드 완료 → 워커가 /api/notify(published) → 공장 서버 siteSync()
          ├─ POST 홈페이지관리자/api/integration/posts   → 「정책자금 정보」 notice-N.html
          │     목차(TOC) · FAQ(FAQPage) · Article/Breadcrumb/VideoObject JSON-LD · 쇼츠 임베드 · 하단 신청폼 · body data-short-code
          └─ POST 홈페이지관리자/api/integration/shorts  → data/shorts.json (go.html 목적지 = 그 정보글) + shorts 테이블

[홈페이지] go.html?c=코드&ch=yt → 정보글로 이동 (코드·채널 유지)
           js/site.js TF_TRACK: 첫 유입·마지막 유입 30일 보관
             · 추적 링크  → 채널 youtube / instagram + 코드
             · 검색으로 정보글에 바로 들어옴(구글·네이버·리퍼러 없는 앱) → 채널 seo + 그 글의 코드
             · 사이트 안에서 정보글을 읽고 신청 → 유입 채널 그대로 + 읽은 글의 코드
           신청폼 → leads.track_code · channel · landing_page · first_touch · last_touch

[홈페이지 관리자] 상담 신청 목록(유입 열 · #코드 필터) · 유입 분석(채널별 · 숏폼별 · 일별 · 첫 페이지)

[공장] 매일 채널 분석 직전 + 18시 크론 → GET 홈페이지관리자/api/integration/leads?since=…
           → contents.lead_stats {total, by_channel}
           → channel_posts.leads = 자기 플랫폼 신청 + (검색·정보글·기타) 신청 × 조회수 비율
           → 성과 점수 DB 40% → 7일 확정 후 기획·대사·이벤트·랜딩·카피·정보글 평가(성과:DB상위…) → SOP 학습
```

## 연결 (한 번만)

| 어디 | 무엇 |
|---|---|
| 홈페이지 Supabase | `today-fund-admin/sql/05_tracking.sql`, `06_short_metrics.sql` 실행 |
| 홈페이지 관리자 Vercel 환경변수 | `FACTORY_API_KEY` = 16자 이상 임의 문자열 (`openssl rand -hex 24`) |
| 공장 Supabase | `supabase/migrations/016_site_tracking.sql` 실행 (또는 all-in-one 다시 실행) |
| 공장 관리자 [연결·키 > 오늘의 정책자금 사이트] | `TPF_ADMIN_KEY` = 위와 같은 값 |
| 공장 관리자 [설정 > 홈페이지 연동] | 홈페이지 주소 · 홈페이지 관리자 주소 → 저장 → [연결 확인] |
| 인스타 프로필 링크 | `https://홈페이지/go.html?c=today&ch=igp` |

설정 전에 만든 카피에는 공장 랜딩 링크가 들어 있습니다. 홈페이지 주소를 넣은 뒤 07 채널 카피를 다시 생성하면 추적 링크로 바뀝니다.

## 정보글 대표 이미지 (썸네일)

1. 08 SEO 정보글 단계가 `thumb_query`(영문 사진 검색어 2~4단어)를 함께 만듭니다 — 장면·사물 위주, 얼굴 클로즈업·국기·화폐는 피함
2. 업로드 후 공장이 **Pexels → Unsplash** 순서로 가로 사진을 찾습니다 (최근 정보글에 쓴 사진은 다시 안 씀)
3. 홈페이지 관리자가 사진 위에 브랜드 녹색 그라데이션 + 제목 · 분류를 얹은 1200×630 PNG 를 만들어 목록 카드 · 메인 소식 · og:image 로 씁니다
4. 사진 키가 없거나 못 찾으면 **브랜드 녹색 카드**(제목 · 분류)

키: [연결·키 › 오늘의 정책자금 사이트] `PEXELS_API_KEY`(pexels.com/api, 무료) · `UNSPLASH_ACCESS_KEY`(선택). 사진 출처는 글 아래 작게 표시됩니다.

## 성과 한눈에 (공장 · 홈페이지 관리자 양쪽)

| 어디 | 화면 | 보이는 것 |
|---|---|---|
| 공장 | [성과 한눈에] `/admin/performance` | 숏폼마다 DB(채널별) · 조회 · 좋아요 · 댓글 · 공유 · 구독 · DB/1천 조회 · 성과 점수 · 유튜브/인스타/정보글 링크 · 추적 링크, 행을 누르면 플랫폼별 분해. 정렬: DB · 최신 · 점수 · 조회 · 공유 · 구독 |
| 홈페이지 관리자 | [유입 분석] › 숏폼별 성과 한눈에 | 같은 지표 + 상담 완료 수 + 공장 콘텐츠 링크 |

- 공장은 매일 채널 분석이 끝나면 `POST /api/integration/metrics` 로 콘텐츠별 지표를 홈페이지 관리자에 보냅니다. 지금 바로: 공장 [성과 한눈에] › [DB 수 받아오기 · 홈페이지에 지표 보내기]
- CLI · MCP: `tpf perf [일수]` / `performance_overview`

## 채널 값

| channel | 뜻 | 판정 |
|---|---|---|
| youtube | 유튜브 | `ch=yt·ytc` · utm_source=youtube · 리퍼러 youtube.com |
| instagram | 인스타그램 | `ch=ig·igc·igp` · utm_source=instagram · 리퍼러 instagram.com |
| seo | 검색 | 리퍼러 google·naver·daum·bing, 리퍼러 없이 정보글로 바로 진입 |
| blog | 정보글 | 블로그 리퍼러, 또는 사이트 안에서 숏폼 정보글을 읽고 신청 |
| factory | 공장 랜딩 | 공장 /l/ 랜딩 신청 전달, 코드만 있고 채널 불명 |
| ads · kakao · facebook · referral · direct | 광고(cpc·gclid) · 카카오 · 페이스북 · 그 밖의 외부 링크 · 직접 방문 | |

신청 건의 채널·코드는 **코드가 있는 마지막 유입**을 우선합니다(없으면 첫 유입의 코드, 그다음 이번 방문에서 읽은 정보글의 코드).

## 운영

- 공장 콘텐츠 상세 [홈페이지 연동] 카드: 코드 · DB 수(채널별) · 추적 링크 · 정보글 주소 · [홈페이지에 등록] · [정보글 다시 쓰기](관리자에서 고친 내용을 덮어씀)
- 공장 [채널 성과] 표의 **DB** 열 = 영상별 신청 수 (마우스를 올리면 자기 링크 / 검색 배분)
- 홈페이지 관리자 [유입 분석]: 기간 7·30·90·180일, `#코드` 를 누르면 그 숏폼의 신청만 상담 목록에서
- CLI·MCP: `tpf site-leads` · `tpf site-sync <id> [--force]` / `site_leads` · `site_sync`
- 관리자에서 정보글을 고치면(검색 설명·키워드·목차·본문) 공장이 다시 덮어쓰지 않습니다(force 일 때만).
- 공장 `/policy/슬러그` 는 홈페이지 정보글이 있으면 그 주소로 301 이동하고 sitemap 에서 빠집니다(검색 점수 분산 방지).

## API (홈페이지 관리자, `Authorization: Bearer FACTORY_API_KEY`)

| 메서드 · 경로 | 본문 / 응답 |
|---|---|
| `POST /api/integration/posts` | `{code, force?, title, description, keywords[], markdown, faq[], images[], youtubeId, photoUrl, photoCredit{name,url,source}, category, date}` → `{id, slug, url, updated, skipped?}` |
| `POST /api/integration/shorts` | `{code, slug, title, topic, youtubeId, instagramId, instagramUrl, thumbnailUrl, publishedAt, postId, meta?}` |
| `GET /api/integration/leads?since=ISO&codes=a,b` | `{codes: {코드: {total, by_channel, by_status, first_at, last_at}}, untracked, total}` |
| `POST /api/integration/leads` | 공장 랜딩 신청 전달 `{name, phone, company, memo, code, channel, utm, request_id}` |
| `POST /api/integration/metrics` | `{items:[{code, title, published_at, youtube{url,views,likes,comments,shares,subs,score}, instagram{…}, total, score, factory_url}]}` |

## 개인정보

- 홈페이지 → 공장으로 넘어오는 것은 **코드별 건수뿐**입니다(이름·연락처 없음).
- 공장 랜딩 신청은 설정 [공장 랜딩 신청 전달]이 켜져 있을 때 홈페이지 관리자로 전달됩니다. 두 곳의 개인정보 처리방침에 수탁·보관 위치를 맞춰 적으세요.
