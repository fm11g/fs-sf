import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { decide } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

/** 사람 결정 { contentId, step, decision: approve|reject, note? } */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { contentId, step, decision, note } = await req.json();
  try {
    return NextResponse.json(await decide(step, contentId, decision, note, 'human'));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
