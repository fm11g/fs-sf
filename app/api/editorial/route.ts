import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { activePlan, buildPlan, claimSlot, moveSlot, updateSlot } from '@/lib/editorial';
import { channelInsights } from '@/lib/channels';
import { candidateTable } from '@/lib/editorial-core';
import { getSettings } from '@/lib/settings';
import { sbAdmin } from '@/lib/supabase/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard(req, 'editorial');
  if (g.deny) return g.deny;
  const [plan, ins, s] = await Promise.all([activePlan(), channelInsights(), getSettings()]);
  const table = candidateTable(ins.dims as any, ins.overall, s);
  const ids = (plan?.slots || []).map((x: any) => x.content_id).filter(Boolean);
  const { data: cs } = ids.length ? await sbAdmin().from('contents').select('id, topic, current_step, published_at').in('id', ids) : { data: [] as any[] };
  return NextResponse.json({
    plan, contents: cs || [], table, sequence: ins.sequence, requests: ins.requests, overall: ins.overall, scored: ins.scored,
    knobs: { novelty_strength: s.novelty_strength ?? 0.35, explore_rate: s.explore_rate ?? 0.2, cooldown_days: s.cooldown_days ?? 3, editorial_enabled: s.editorial_enabled !== false },
  });
}

/** { action: 'build' | 'update_slot' | 'move' | 'claim' | 'knobs', … } */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'editorial', 'work');
  if (g.deny) return g.deny;
  const b = await req.json();
  try {
    if (b.action === 'build') return NextResponse.json(await buildPlan({ force: b.force !== false }));
    if (b.action === 'update_slot') return NextResponse.json(await updateSlot(Number(b.index), b.patch || {}));
    if (b.action === 'move') return NextResponse.json(await moveSlot(Number(b.index), b.dir === -1 ? -1 : 1));
    if (b.action === 'claim') return NextResponse.json(await claimSlot(b.contentId));
    if (b.action === 'knobs') {
      const s = await getSettings();
      const k = b.knobs || {};
      const v = {
        ...s,
        novelty_strength: Math.min(1, Math.max(0, Number(k.novelty_strength ?? s.novelty_strength ?? 0.35))),
        explore_rate: Math.min(0.5, Math.max(0, Number(k.explore_rate ?? s.explore_rate ?? 0.2))),
        cooldown_days: Math.min(14, Math.max(1, Math.round(Number(k.cooldown_days ?? s.cooldown_days ?? 3)))),
        editorial_enabled: k.editorial_enabled ?? s.editorial_enabled ?? true,
      };
      await sbAdmin().from('settings').update({ value: v, updated_at: new Date().toISOString() }).eq('id', 1);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
