import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { dispatch } from '@/lib/github';
import { requireApproved } from '@/lib/pipeline';
import { sbAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 음성·자막·BGM·모션그래픽 렌더를 GitHub Actions 워커에 요청 (대사·디자인 승인 필요) */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { contentId } = await req.json();
  try {
    await requireApproved(contentId, 'render');
    const db = sbAdmin();
    await db.from('contents').update({ status: 'rendering', error: null }).eq('id', contentId);
    await db.from('steps').update({ state: 'running', started_at: new Date().toISOString() }).eq('content_id', contentId).eq('step', 'render');
    await dispatch('render', { content_id: contentId });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
