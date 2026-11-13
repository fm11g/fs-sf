import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { rateOutput } from '@/lib/learn';
import { sbAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 평가 저장 { contentId, step, score: 1~5, tags?: string[], note? } (이전 형식 kind: good|bad 도 허용 → 4/2점) */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { contentId, step, score, kind, tags, note, source } = await req.json();
  const sc = score ?? (kind === 'bad' ? 2 : 4);
  try { return NextResponse.json(await rateOutput(step, contentId, { score: sc, tags, note: note || '', source: source || 'human' })); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}

/** ?step=&contentId= 목록 */
export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const step = req.nextUrl.searchParams.get('step');
  const contentId = req.nextUrl.searchParams.get('contentId');
  let q = sbAdmin().from('exemplars').select('id, content_id, step, kind, score, tags, features, note, topic, source, used_in, github_path, provider, created_at').order('created_at', { ascending: false }).limit(100);
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
