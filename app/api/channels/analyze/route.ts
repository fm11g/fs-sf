import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { analyzeChannels } from '@/lib/channels';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** 워커가 수집 직후 호출: 댓글 분석·형태 분류·최종 점수·성과 학습·데이터 내보내기 */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { warnings } = await req.json().catch(() => ({}));
  try { return NextResponse.json(await analyzeChannels({ warnings })); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
