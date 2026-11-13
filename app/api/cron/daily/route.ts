import { NextRequest, NextResponse } from 'next/server';
import { learnSweep } from '@/lib/learn';
import { notify } from '@/lib/notify';
import { flushExports, rebuildDatasets } from '@/lib/export';
import { hydrateEnv } from '@/lib/secrets';
import { sbAdmin } from '@/lib/supabase/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Vercel Cron (vercel.json, 매일 18:00 KST): SOP 학습 제안 → 내보내기 재시도 → 학습 데이터셋·학습 노트 재생성 → 하루 요약 메일 */
export async function GET(req: NextRequest) {
  await hydrateEnv();
  const secret = process.env.CRON_SECRET;
  const viaSecret = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  const viaWorker = !!process.env.WORKER_SECRET && req.headers.get('x-worker-secret') === process.env.WORKER_SECRET;
  // CRON_SECRET 을 안 넣었으면 Vercel 크론 호출만 받고, 하루 한 번만 실행 (반복 호출로 메일이 쏟아지지 않게)
  const viaVercel = !secret && /vercel-cron/i.test(req.headers.get('user-agent') || '');
  if (!viaSecret && !viaWorker && !viaVercel) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!viaSecret && !viaWorker) {
    const db = sbAdmin();
    const { data } = await db.from('app_secrets').select('value').eq('key', '_CRON_LAST').maybeSingle();
    if (data && Date.now() - Number(data.value) < 20 * 3600e3) return NextResponse.json({ skipped: '오늘 이미 실행됨' });
    await db.from('app_secrets').upsert({ key: '_CRON_LAST', value: String(Date.now()), updated_by: 'cron' });
  }
  const learned = await learnSweep().catch((e) => [{ error: e.message }]);
  const retried = await flushExports({ limit: 200 }).catch((e) => ({ error: e.message }));       // 실패했던 내보내기 재시도
  const rebuilt = await rebuildDatasets().then((r) => ({ commit: r.commit?.url, files: r.files, performance_rows: r.performance_rows })).catch((e) => ({ error: e.message }));
  const digest = await notify('digest');
  return NextResponse.json({ learned, retried, rebuilt, digest });
}
