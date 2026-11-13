import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { ensureSteps, onEdited } from '@/lib/pipeline';
import { STEP_DEFS, type StepKey } from '@/lib/steps';

export const dynamic = 'force-dynamic';

const OUTPUT_FIELDS = ['research', 'plan', 'script', 'offer', 'design', 'copy', 'post'];
const OTHER = ['topic', 'bgm_id'];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const db = sbAdmin();
  const steps = await ensureSteps(params.id);
  const [{ data: content }, { data: variant }, { data: jobs }, { data: exemplars }] = await Promise.all([
    db.from('contents').select('*').eq('id', params.id).single(),
    db.from('landing_variants').select('*, landing_templates(slots)').eq('content_id', params.id).maybeSingle(),
    db.from('jobs').select('*').eq('content_id', params.id).order('created_at', { ascending: false }).limit(40),
    db.from('exemplars').select('id, step, kind, score, tags, note, used_in, created_at').eq('content_id', params.id).order('created_at', { ascending: false }),
  ]);
  return NextResponse.json({ content, variant, steps, jobs, exemplars: exemplars || [] });
}

/** 산출물 직접 수정 → 해당 단계는 '검수 대기', 하위 단계는 '재작업 필요' */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const body = await req.json();
  const db = sbAdmin();
  const edited: StepKey[] = [];
  if (body.landing_values) {
    await db.from('landing_variants').update({ values: body.landing_values }).eq('content_id', params.id);
    edited.push('landing');
  }
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => OUTPUT_FIELDS.includes(k) || OTHER.includes(k)));
  if (Object.keys(patch).length) {
    const { error } = await db.from('contents').update(patch).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const k of Object.keys(patch)) {
      const d = STEP_DEFS.find((x) => x.field === k);
      if (d && OUTPUT_FIELDS.includes(k)) edited.push(d.key);
    }
  }
  for (const s of edited) await onEdited(s, params.id);
  return NextResponse.json({ ok: true, edited });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  await sbAdmin().from('contents').delete().eq('id', params.id);
  return NextResponse.json({ ok: true });
}
