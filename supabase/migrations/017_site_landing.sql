-- 017: 오늘의 정책자금 홈페이지 '오늘의 랜딩'(today.html) — 랜딩 단계가 홈페이지 틀에 넣을 글을 함께 저장
--  · landing_variants.site : { badge, headline, sub, points[] }  (공장 /l/ 템플릿 슬롯과 별개로 홈페이지 틀용)
--  · contents.site_landing : 홈페이지에 보낸 결과 { url, deadline, expiresAt, at }
alter table public.landing_variants add column if not exists site jsonb;
alter table public.contents add column if not exists site_landing jsonb;
