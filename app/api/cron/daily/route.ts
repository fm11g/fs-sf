import { NextRequest, NextResponse } from 'next/server';
import { learnSweep } from '@/lib/learn';
import { notify } from '@/lib/notify';
import { flushExports, rebuildDatasets } from '@/lib/export';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Vercel Cron (vercel.json, 매일 18:00 KST): SOP 학습 제안 → 내보내기 재시도 → 학습 데이터셋·학습 노트 재생성 → 하루 요약 메일 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const learned = await learnSweep().catch((e) => [{ error: e.message }]);
  const retried = await flushExports({ limit: 200 }).catch((e) => ({ error: e.message }));       // 실패했던 내보내기 재시도
  const rebuilt = await rebuildDatasets().then((r) => ({ commit: r.commit?.url, files: r.files, performance_rows: r.performance_rows })).catch((e) => ({ error: e.message }));
  const digest = await notify('digest');
  return NextResponse.json({ learned, retried, rebuilt, digest });
}
