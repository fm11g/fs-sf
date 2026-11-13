import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { buildPlan } from '@/lib/editorial';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** 워커(매일 조사 전)·관리자: 편성표 갱신 (오늘 슬롯이 있고 남은 슬롯이 3개 이상이면 유지) */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { force } = await req.json().catch(() => ({}));
  try { const r = await buildPlan({ force: !!force }); return NextResponse.json({ rebuilt: r.rebuilt, plan_id: r.plan.id, today: (r.plan.slots || [])[0] }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
