import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { aiDecide } from '@/lib/pipeline';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** AI에게 판단 맡기기 { contentId, step, apply? } — 통과면 승인, 미달이면 사유 저장(apply=true 면 피드백 반영 재생성) */
export async function POST(req: NextRequest) {
  const { contentId, step, apply } = await req.json();
  const g = await guard(req, `step:${step}`, 'work');
  if (g.deny) return g.deny;

  try {
    return NextResponse.json(await aiDecide(step, contentId, !!apply));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
