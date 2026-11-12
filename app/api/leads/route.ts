import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase/server';
import { getSettings } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
const hits = new Map<string, number[]>(); // 인스턴스 단위 간이 제한 (IP당 10분 5건)

/** 랜딩 신청 접수 (공개). { name, phone, company?, memo?, consent, slug?, utm?, website(허니팟) } */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (b.website) return NextResponse.json({ ok: true }, { headers: CORS }); // 봇
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'x';
  const recent = (hits.get(ip) || []).filter((t) => Date.now() - t < 600000);
  if (recent.length >= 5) return NextResponse.json({ error: '잠시 후 다시 시도해 주세요' }, { status: 429, headers: CORS });
  hits.set(ip, [...recent, Date.now()]);

  const name = String(b.name || '').trim().slice(0, 40);
  const phone = String(b.phone || '').replace(/[^\d]/g, '').slice(0, 11);
  if (!name || !/^01\d{8,9}$|^0\d{8,10}$/.test(phone)) return NextResponse.json({ error: '이름과 연락처를 확인해 주세요' }, { status: 400, headers: CORS });
  if (!b.consent) return NextResponse.json({ error: '개인정보 수집·이용 동의가 필요합니다' }, { status: 400, headers: CORS });

  const row = {
    name, phone, company: String(b.company || '').slice(0, 60) || null, memo: String(b.memo || '').slice(0, 300) || null,
    consent: true, content_slug: String(b.slug || '').slice(0, 40) || null,
    utm: typeof b.utm === 'object' && b.utm ? b.utm : {},
  };
  const { error } = await sbAdmin().from('leads').insert(row);
  if (error) return NextResponse.json({ error: '접수에 실패했습니다' }, { status: 500, headers: CORS });

  // 기존 DB 시스템으로 전달 (설정 > lead_webhook)
  try {
    const s = await getSettings();
    if (s.lead_webhook) await fetch(s.lead_webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'today-policy-fund', ...row }) });
  } catch { /* 웹훅 실패는 접수에 영향 없음 */ }
  return NextResponse.json({ ok: true }, { headers: CORS });
}
export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
