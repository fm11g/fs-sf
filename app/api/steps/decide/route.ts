import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { decide } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

/** 사람 결정 { contentId, step, decision: approve|reject, note? } */
export async function POST(req: NextRequest) {
  const { contentId, step, decision, note } = await req.json();
  const g = await guard(req, `step:${step}`, 'work');
  if (g.deny) return g.deny;

  try {
    return NextResponse.json(await decide(step, contentId, decision, note, 'human'));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
