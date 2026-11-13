import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { dispatch } from '@/lib/github';

export const dynamic = 'force-dynamic';

/** 원클릭 자동 생산: 조사→…→렌더(→자동 업로드 설정 시 업로드)까지 워커가 일괄 실행 */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'board', 'work');
  if (g.deny) return g.deny;
  const { topic, contentId } = await req.json().catch(() => ({}));
  try {
    await dispatch('factory', { topic: topic || '', content_id: contentId || '' });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
