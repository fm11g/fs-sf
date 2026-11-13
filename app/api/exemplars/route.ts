import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { markExemplar } from '@/lib/learn';
import { sbAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 좋은 예/아쉬운 예 저장 { contentId, step, kind: good|bad, note? } → should_propose 면 학습 제안을 만들 때 */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { contentId, step, kind = 'good', note, source } = await req.json();
  try { return NextResponse.json(await markExemplar(step, contentId, kind === 'bad' ? 'bad' : 'good', note || '', source || 'human')); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}

/** ?step=&contentId= 목록 */
export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const step = req.nextUrl.searchParams.get('step');
  const contentId = req.nextUrl.searchParams.get('contentId');
  let q = sbAdmin().from('exemplars').select('id, content_id, step, kind, note, topic, source, used_in, created_at').order('created_at', { ascending: false }).limit(100);
  if (step) q = q.eq('step', step);
  if (contentId) q = q.eq('content_id', contentId);
  const { data } = await q;
  return NextResponse.json({ items: data || [] });
}

export async function DELETE(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const id = Number(req.nextUrl.searchParams.get('id'));
  await sbAdmin().from('exemplars').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
