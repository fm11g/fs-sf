import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { notify, type NotifyEvent } from '@/lib/notify';
import { exportNow, exportRun } from '@/lib/export';
import { siteSync } from '@/lib/tpf-site';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** 워커(렌더·업로드)와 관리자가 알림을 보낼 때 { event, contentId?, step?, message? } */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { event, contentId, step, message } = await req.json();
  // 업로드 완료 → 홈페이지 정보글 발행 + 숏폼 등록 (실패해도 알림은 계속)
  const site = event === 'published' && contentId ? await siteSync(contentId).catch((e) => ({ warnings: [e.message] })) : undefined;
  const r = await notify(event as NotifyEvent, { contentId, step, message: [message, site?.warnings?.length ? `홈페이지 연동: ${site.warnings.join(' / ')}` : ''].filter(Boolean).join(' · ') || undefined });
  // 워커(렌더·업로드) 결과도 데이터로 저장
  if (contentId && (step === 'render' || step === 'publish')) await exportNow(() => exportRun(contentId, step, event === 'step_failed' ? message : undefined));
  return NextResponse.json({ ...r, site });
}
