import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { stepSubmit } from '@/lib/pipeline';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** 에이전트가 만든 산출물 제출 { contentId, step, output, agent? } → 규칙 검사 + 결정 방식 적용 */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { contentId, step, output, agent } = await req.json();
  try { return NextResponse.json(await stepSubmit(step, contentId, output, agent)); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
