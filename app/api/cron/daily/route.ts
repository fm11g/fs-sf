import { NextRequest, NextResponse } from 'next/server';
import { learnSweep } from '@/lib/learn';
import { notify } from '@/lib/notify';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Vercel Cron (vercel.json, 매일 18:00 KST): SOP 학습 제안 일괄 생성 → 하루 요약 메일 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const learned = await learnSweep().catch((e) => [{ error: e.message }]);
  const digest = await notify('digest');
  return NextResponse.json({ learned, digest });
}
