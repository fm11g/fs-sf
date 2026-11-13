import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { notify, type NotifyEvent } from '@/lib/notify';
import { exportNow, exportRun } from '@/lib/export';

export const dynamic = 'force-dynamic';

/** 워커(렌더·업로드)와 관리자가 알림을 보낼 때 { event, contentId?, step?, message? } */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { event, contentId, step, message } = await req.json();
  const r = await notify(event as NotifyEvent, { contentId, step, message });
  // 워커(렌더·업로드) 결과도 데이터로 저장
  if (contentId && (step === 'render' || step === 'publish')) await exportNow(() => exportRun(contentId, step, event === 'step_failed' ? message : undefined));
  return NextResponse.json(r);
}
