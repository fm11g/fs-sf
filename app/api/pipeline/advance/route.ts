import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { advance } from '@/lib/pipeline';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** 다음 단계 1개 진행. 반환 action: continue(계속 호출) | wait_review | worker | running | done */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'board', 'work');
  if (g.deny) return g.deny;
  const { contentId } = await req.json();
  try {
    return NextResponse.json(await advance(contentId));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
