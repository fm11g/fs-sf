import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { buildPerformance } from '@/lib/performance';

export const dynamic = 'force-dynamic';

/** 성과 한눈에: 콘텐츠별 DB · 조회 · 좋아요 · 댓글 · 공유 · 구독 · 점수 · 링크 (?days=30|90|180|365) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'channels');
  if (g.deny) return g.deny;
  const days = Math.min(730, Math.max(7, Number(req.nextUrl.searchParams.get('days')) || 90));
  try {
    return NextResponse.json(await buildPerformance({ days }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
