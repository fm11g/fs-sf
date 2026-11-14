/**
 * 실제 사례(후기) — 랜딩 후기 카드 슬롯 case{n}_{field} 를 등록된 실제 사례로만 채움.
 * AI 는 사례를 "고르기"만 하고 문구는 쓰지 않음 (가짜 후기 방지).
 */
import type { Slot } from './landing';

export const CASE_FIELDS = ['img', 'who', 'amount', 'count', 'rate', 'badge1', 'badge2', 'title', 'body'] as const;
export type CaseField = (typeof CASE_FIELDS)[number];
export type LandingCase = {
  id: number; industry: string; years?: number | null; who: string; amount: string; amount_won?: number | null; count?: string | null; rate?: string | null;
  badge1?: string | null; badge2?: string | null; title: string; body: string; img?: string | null; fund_type?: string | null; tags?: string[];
  verified?: boolean; active?: boolean; note?: string | null; used_count?: number;
};

const RE = /^case(\d+)_(img|who|amount|count|rate|badge1|badge2|title|body)$/;
export const isCaseKey = (k: string) => RE.test(k);

/** 템플릿의 후기 카드 자리: { 1: ['img','who',…], 2: … } */
export function casePositions(slots: Slot[]): Record<number, CaseField[]> {
  const out: Record<number, CaseField[]> = {};
  for (const s of slots) {
    const m = s.key.match(RE);
    if (m) (out[Number(m[1])] ||= []).push(m[2] as CaseField);
  }
  return out;
}

/** 한 사례 → n번 카드 슬롯 값. 두 번째 태그 자리가 없는 카드면 태그를 한 줄로 합침 */
export function caseValues(c: LandingCase, n: number, fields: CaseField[]): Record<string, string> {
  const v: Record<string, string> = {};
  const has2 = fields.includes('badge2');
  for (const f of fields) {
    if (f === 'badge1') v[`case${n}_badge1`] = has2 ? c.badge1 || '' : [c.badge1, c.badge2].filter(Boolean).join(' · ');
    else if (f === 'badge2') v[`case${n}_badge2`] = c.badge2 || '';
    else if (f === 'img') { if (c.img) v[`case${n}_img`] = c.img; } // 사진이 없으면 템플릿 사진 유지
    else v[`case${n}_${f}`] = String((c as any)[f] ?? '');
  }
  return v;
}

/** 근거 없는 선택 대비: 오늘 주제와 겹치는 단어가 많은 사례 순 (검증된 사례 우선) */
export function rankCases(cases: LandingCase[], text: string): LandingCase[] {
  const words = new Set((text.match(/[가-힣A-Za-z]{2,}/g) || []).map((w) => w.toLowerCase()));
  const score = (c: LandingCase) => {
    const hay = [c.industry, c.fund_type, c.badge1, c.badge2, c.title, ...(c.tags || [])].join(' ').toLowerCase();
    let n = 0;
    for (const w of words) if (hay.includes(w)) n++;
    return n * 10 + (c.verified ? 5 : 0) - (c.used_count || 0) * 0.01;
  };
  return [...cases].sort((a, b) => score(b) - score(a));
}

/** 템플릿 기본 문구(지금 페이지의 후기) → 사례 목록으로 가져오기 */
export function casesFromTemplate(slots: Slot[]): Omit<LandingCase, 'id'>[] {
  const pos = casePositions(slots);
  const val = (k: string) => slots.find((s) => s.key === k)?.current || '';
  return Object.keys(pos).map(Number).sort((a, b) => a - b).map((n) => {
    const who = val(`case${n}_who`);
    const [industry, yearsTxt] = who.split('/').map((x) => x.trim());
    const amount = val(`case${n}_amount`);
    return {
      industry: industry || '기타', years: Number((yearsTxt || '').match(/\d+/)?.[0]) || null, who, amount,
      amount_won: Number(amount.replace(/[^\d]/g, '')) || null, count: val(`case${n}_count`) || null, rate: val(`case${n}_rate`) || null,
      badge1: val(`case${n}_badge1`) || null, badge2: val(`case${n}_badge2`) || null, title: val(`case${n}_title`), body: val(`case${n}_body`),
      img: val(`case${n}_img`) || null, fund_type: /시설|설비|장비|인테리어/.test(val(`case${n}_badge1`)) ? '시설자금' : '운전자금',
      tags: [], verified: false, active: true, note: '랜딩 템플릿에서 가져옴 — 실제 고객 동의·근거 확인 후 [확인 완료] 체크',
    };
  });
}

/** 글 속 한국어 금액 → 원 ("1천 5백만원" → 15,000,000 · "3억" → 300,000,000 · "8천만원") */
export function korWon(text: string): number | null {
  const m = text.match(/(?:(\d+)\s*억)?\s*(?:(\d+)\s*천)?\s*(?:(\d+)\s*백)?\s*만\s*원|(\d+)\s*억\s*원?/);
  if (!m || !m[0].trim()) return null;
  if (m[4]) return Number(m[4]) * 1e8;
  const v = (Number(m[1] || 0) * 1e8) + (Number(m[2] || 0) * 1e7) + (Number(m[3] || 0) * 1e6);
  return v || null;
}

/** 사례 내용 점검 (제목·본문 금액 ≠ 승인금액, 확인 전 사례) */
export function caseIssues(c: Partial<LandingCase>): string[] {
  const out: string[] = [];
  const won = Number(String(c.amount || '').replace(/[^\d]/g, '')) || 0;
  const said = korWon(`${c.title || ''} ${c.body || ''}`);
  if (said && won && said !== won) out.push(`제목·본문 금액 ${said.toLocaleString()}원 ≠ 승인금액 ${won.toLocaleString()}원`);
  if (!c.verified) out.push('실제 고객 동의·근거 확인 전');
  if (!c.img) out.push('사진 없음 (카드의 기존 사진이 그대로 남음)');
  return out;
}
