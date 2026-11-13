import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { board } from '@/lib/ops';
import { visibleSteps } from '@/lib/perms';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  let items = await board();
  if (g.me.role === 'staff') {
    // 직원: 권한 블록에 있는 단계 상태만 (전체 공정 구조·다른 단계 정보는 내려보내지 않음)
    const keys = new Set(visibleSteps(g.me).map((d) => d.key));
    items = items.map((c: any) => ({
      id: c.id, slug: c.slug, topic: c.topic, created_at: c.created_at, updated_at: c.updated_at, published_at: c.published_at,
      current_step: c.current_step && (keys.has(c.current_step) || c.current_step === 'done') ? c.current_step : null,
      steps: Object.fromEntries(Object.entries(c.steps).filter(([k]) => keys.has(k as any))),
    }));
  }
  return NextResponse.json({ items, steps: visibleSteps(g.me).map((d) => d.key) });
}
