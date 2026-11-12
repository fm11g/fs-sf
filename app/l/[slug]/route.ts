import { NextRequest, NextResponse } from 'next/server';
import { fillSlots } from '@/lib/landing';
import { getVariant } from '@/lib/landing-data';

export const dynamic = 'force-dynamic';

/** 숏폼별 랜딩페이지: /l/{slug}  ·  항상 최신: /l/today (인스타 프로필 링크용) */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const v = await getVariant(params.slug);
  if (!v?.landing_templates) return new NextResponse('Not found', { status: 404 });
  const tpl = v.landing_templates;
  const html = fillSlots(tpl.html, v.values || {}, {
    assetBase: tpl.asset_base,
    canonical: `${req.nextUrl.origin}/l/${v.slug}`,
    slug: v.slug,
    origin: req.nextUrl.origin,
  });
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
