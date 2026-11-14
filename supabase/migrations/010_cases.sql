-- 010: 실제 사례(후기) 목록 — 랜딩의 후기 카드(case{n}_*)는 AI 가 쓰지 않고 여기서 골라 원문 그대로 채움
create table if not exists public.landing_cases (
  id bigserial primary key,
  industry text not null,            -- 업종 (예: 정보통신업(IT), 도배업)
  years int,                         -- 사업 연차
  who text not null,                 -- 카드 상단 표기: "정보통신업(IT) / 사업 2년차 / 김** 님"
  amount text not null,              -- 승인금액 표기: "₩20,000,000"
  amount_won bigint,                 -- 승인금액 숫자 (정렬·검증용)
  count text,                        -- 총 정책자금 횟수: "1회"
  rate text,                         -- 금리: "3%"
  badge1 text, badge2 text,          -- 자금 용도 태그
  title text not null,
  body text not null,
  img text,                          -- 사진 경로 (템플릿 기준 상대경로 가능: ./img/h9.jpg)
  fund_type text,                    -- 운전자금·시설자금·창업자금 …
  tags text[] not null default '{}', -- 선택 기준 키워드 (제조업, 매출하락, 저신용 …)
  verified boolean not null default false, -- 실제 고객 동의·서류 확인 완료
  active boolean not null default true,
  note text,                         -- 내부 메모 (근거 서류 위치 등)
  used_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists landing_cases_active on public.landing_cases (active, verified);
alter table public.landing_cases enable row level security;
drop policy if exists admin_all on public.landing_cases;
create policy admin_all on public.landing_cases for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 랜딩 변형에 어떤 사례를 몇 번 카드에 넣었는지
alter table public.landing_variants add column if not exists case_ids bigint[] not null default '{}';
