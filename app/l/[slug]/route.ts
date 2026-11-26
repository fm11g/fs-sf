import { NextRequest, NextResponse } from 'next/server';
import { fillSlots } from '@/lib/landing';
import { getVariant } from '@/lib/landing-data';
import { getSettings } from '@/lib/settings';
import { sbAdmin } from '@/lib/supabase/server';
import { trackCode } from '@/lib/track';

export const dynamic = 'force-dynamic';

/**
 * 숏폼별 랜딩페이지: /l/{slug}  ·  항상 최신: /l/today
 * 홈페이지 연동(설정 tpf_site_url)이 있으면 공개된 숏폼은 홈페이지 '오늘의 랜딩'(today.html?c=코드)으로 보냅니다.
 * 공장 템플릿 그대로 보려면 ?preview=1 (검수용)
 */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const sp = req.nextUrl.searchParams;
  if (!sp.get('preview')) {
    const s = await getSettings();
    const site = String(s.tpf_site_url || '').trim().replace(/\/+$/, '');
    if (site) {
      const q = new URLSearchParams();
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ch']) { const v = sp.get(k); if (v) q.set(k, v.slice(0, 120)); }
      if (params.slug === 'today') return NextResponse.redirect(`${site}/today.html${q.toString() ? `?${q}` : ''}`, 302);
      const { data: c } = await sbAdmin().from('contents').select('slug, track_code, published_at').eq('slug', params.slug).maybeSingle();
      const code = c?.track_code || (c ? trackCode(c.slug) : null);
      if (c?.published_at && code) {
        q.set('c', code);
        if (!q.get('ch')) q.set('ch', /instagram/i.test(sp.get('utm_source') || '') ? 'ig' : /youtube/i.test(sp.get('utm_source') || '') ? 'yt' : 'sp');
        return NextResponse.redirect(`${site}/today.html?${q}`, 302);
      }
    }
  }
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
