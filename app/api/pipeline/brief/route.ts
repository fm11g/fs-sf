import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { stepBrief } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

/** 에이전트 직접 작업용 지시문 { contentId, step, feedback? } → { system, task, ... } */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { contentId, step, feedback } = await req.json();
  try { return NextResponse.json(await stepBrief(step, contentId, feedback)); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
