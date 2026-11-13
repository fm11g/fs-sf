import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { dispatch } from '@/lib/github';
import { requireApproved } from '@/lib/pipeline';
import { sbAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 게시: 렌더·카피·랜딩·정보글이 모두 승인된 경우에만 워커에 요청 */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'step:publish', 'work');
  if (g.deny) return g.deny;
  const { contentId, targets = ['youtube', 'instagram'] } = await req.json();
  try {
    await requireApproved(contentId, 'publish');
    const db = sbAdmin();
    await db.from('contents').update({ status: 'publishing', error: null }).eq('id', contentId);
    await db.from('steps').update({ state: 'running', started_at: new Date().toISOString() }).eq('content_id', contentId).eq('step', 'publish');
    await dispatch('publish', { content_id: contentId, targets });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
