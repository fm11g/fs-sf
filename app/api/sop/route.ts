import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { can, canStep } from '@/lib/perms';
import { commitSopToGithub, defaultSop, getSop, listSops, saveSop } from '@/lib/sop';
import { sbAdmin } from '@/lib/supabase/server';
import { STEP_KEYS, type StepKey } from '@/lib/steps';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  const sops = await listSops();
  // 직원: SOP 화면 권한이 없으면 내용 없이 결정 방식만, 보이는 단계만
  if (g.me.role === 'staff') {
    const full = can(g.me, 'sop');
    return NextResponse.json({ sops: sops.filter((x: any) => full || canStep(g.me, x.step)).map((x: any) => (full ? x : { step: x.step, gate: x.gate, freedom: x.freedom })) });
  }
  return NextResponse.json({ sops });
}

/** { action: save|commit|default|versions, step, content?, freedom?, gate?, note? } */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'sop', 'work');
  if (g.deny) return g.deny;
  const { action = 'save', step, content, freedom, gate, provider, best_of, note } = await req.json();
  if (!STEP_KEYS.includes(step)) return NextResponse.json({ error: '알 수 없는 단계' }, { status: 400 });
  try {
    if (action === 'save') return NextResponse.json(await saveSop(step as StepKey, { content, freedom, gate, provider, best_of }, note));
    if (action === 'default') return NextResponse.json(defaultSop(step as StepKey));
    if (action === 'commit') return NextResponse.json({ url: await commitSopToGithub(step as StepKey, (await getSop(step as StepKey)).content) });
    if (action === 'versions') {
      const { data } = await sbAdmin().from('sop_versions').select('*').eq('step', step).order('created_at', { ascending: false }).limit(20);
      return NextResponse.json({ versions: data || [] });
    }
    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
