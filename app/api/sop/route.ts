import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { commitSopToGithub, defaultSop, getSop, listSops, saveSop } from '@/lib/sop';
import { sbAdmin } from '@/lib/supabase/server';
import { STEP_KEYS, type StepKey } from '@/lib/steps';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  return NextResponse.json({ sops: await listSops() });
}

/** { action: save|commit|default|versions, step, content?, freedom?, gate?, note? } */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
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
