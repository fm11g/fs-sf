import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { stopRender, stopStep } from '@/lib/stop';

export const dynamic = 'force-dynamic';

/** 강제 중지 { contentId, step } — step=render 면 렌더(워커·GitHub 실행)까지, 그 외 AI 단계는 진행 중 표시 해제 + 늦게 온 결과 버림 */
export async function POST(req: NextRequest) {
  const { contentId, step } = await req.json();
  if (!contentId || !step) return NextResponse.json({ error: 'contentId, step 필요' }, { status: 400 });
  const g = await guard(req, `step:${step}`, 'work');
  if (g.deny) return g.deny;
  const by = g.me?.name || g.me?.username || g.me?.email || '관리자';
  try {
    const r = step === 'render'
      ? await stopRender(contentId, 'user', `${by} 님이 렌더를 중지함`)
      : await stopStep(contentId, step, by);
    if (!r.ok) return NextResponse.json({ error: (r as any).message }, { status: 409 });
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
