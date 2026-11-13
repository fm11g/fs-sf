import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { analyzeChannels, channelInsights } from '@/lib/channels';
import { dispatch } from '@/lib/github';
import { getSettings } from '@/lib/settings';
import { sbAdmin } from '@/lib/supabase/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const s = await getSettings();
  return NextResponse.json({ links: { youtube_channel: s.youtube_channel || '', instagram_account: s.instagram_account || '' }, ...(await channelInsights()) });
}

/** { action: 'save_links' | 'sync' | 'analyze' | 'set_attrs', … } */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const b = await req.json();
  const db = sbAdmin();
  try {
    if (b.action === 'save_links') {
      const s = await getSettings();
      await db.from('settings').update({ value: { ...s, youtube_channel: String(b.youtube_channel || '').trim(), instagram_account: String(b.instagram_account || '').trim() }, updated_at: new Date().toISOString() }).eq('id', 1);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'sync') { await dispatch('channels', {}); return NextResponse.json({ ok: true, message: '워커가 수집을 시작했습니다 (2~5분)' }); }
    if (b.action === 'analyze') return NextResponse.json(await analyzeChannels({ reanalyze: !!b.reanalyze }));
    if (b.action === 'set_attrs') {
      await db.from('channel_posts').update({ attrs: b.attrs || {}, attrs_source: 'manual' }).eq('id', Number(b.id));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
