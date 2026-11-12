import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const CORS = { 'Access-Control-Allow-Origin': '*' };

/** 랜딩 조회/버튼 클릭 기록 (sendBeacon). ?c=슬러그&t=view|cta */
export async function POST(req: NextRequest) {
  const c = (req.nextUrl.searchParams.get('c') || '').slice(0, 40);
  const t = req.nextUrl.searchParams.get('t') === 'cta' ? 'cta' : 'view';
  if (c) await sbAdmin().from('events').insert({ content_slug: c, type: t });
  return new NextResponse(null, { status: 204, headers: CORS });
}
