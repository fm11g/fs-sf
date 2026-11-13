import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { runStep } from '@/lib/pipeline';
import { AI_STEPS, type StepKey } from '@/lib/steps';

export const maxDuration = 300; // 생성+AI검수+재작업까지 한 번에. Hobby(60초)에서는 끊길 수 있음 → Pro 권장
export const dynamic = 'force-dynamic';

/** 단계 실행 { contentId, feedback?, force?, provider? } — feedback 이 있으면 이전 산출물을 그 지시대로 고쳐 재생성 */
export async function POST(req: NextRequest, { params }: { params: { step: string } }) {
  const g = await guard(req, `step:${params.step}`, 'work');
  if (g.deny) return g.deny;
  const { contentId, feedback, force, provider } = await req.json();
  const step = params.step as StepKey;
  if (!AI_STEPS.includes(step)) return NextResponse.json({ error: '알 수 없는 단계' }, { status: 400 });
  try {
    return NextResponse.json(await runStep(step, contentId, { feedback, force, provider }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
