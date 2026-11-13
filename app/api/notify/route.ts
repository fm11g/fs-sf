import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { notify, type NotifyEvent } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/** 워커(렌더·업로드)와 관리자가 알림을 보낼 때 { event, contentId?, step?, message? } */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { event, contentId, step, message } = await req.json();
  return NextResponse.json(await notify(event as NotifyEvent, { contentId, step, message }));
}
