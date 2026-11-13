import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { can, canStep, visibleSteps } from '@/lib/perms';
import { sbAdmin } from '@/lib/supabase/server';
import { ensureSteps, onEdited } from '@/lib/pipeline';
import { STEP_DEFS, type StepKey } from '@/lib/steps';

export const dynamic = 'force-dynamic';

const OUTPUT_FIELDS = ['research', 'plan', 'script', 'offer', 'design', 'copy', 'post'];
const OTHER = ['topic', 'bgm_id'];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  const db = sbAdmin();
  const steps = await ensureSteps(params.id);
  const [{ data: content }, { data: variant }, { data: jobs }, { data: exemplars }] = await Promise.all([
    db.from('contents').select('*').eq('id', params.id).single(),
    db.from('landing_variants').select('*, landing_templates(slots)').eq('content_id', params.id).maybeSingle(),
    db.from('jobs').select('*').eq('content_id', params.id).order('created_at', { ascending: false }).limit(40),
    db.from('exemplars').select('id, step, kind, score, tags, note, used_in, created_at').eq('content_id', params.id).order('created_at', { ascending: false }),
  ]);
  if (g.me.role === 'staff' && content) {
    // 직원: 권한 블록에 있는 단계의 산출물만 (나머지 필드는 아예 빼고 보냄)
    const keys = new Set(visibleSteps(g.me).map((d) => d.key) as string[]);
    const c: any = { id: content.id, slug: content.slug, topic: content.topic, status: content.status, created_at: content.created_at, reference_id: content.reference_id, error: null };
    for (const d of STEP_DEFS) if (keys.has(d.key) && d.field) c[d.field] = (content as any)[d.field];
    if (keys.has('render') || keys.has('publish') || can(g.me, 'editor')) Object.assign(c, { audio: content.audio, video_url: content.video_url, thumbnail_url: content.thumbnail_url, images: content.images, bgm_id: content.bgm_id });
    if (keys.has('publish')) Object.assign(c, { youtube_id: content.youtube_id, instagram_id: content.instagram_id, published_at: content.published_at });
    if (can(g.me, 'editor')) { c.design = content.design; c.script = content.script; }
    c.current_step = keys.has(content.current_step) ? content.current_step : null;
    return NextResponse.json({
      content: c, variant: keys.has('landing') ? variant : null,
      steps: Object.fromEntries(Object.entries(steps).filter(([k]) => keys.has(k))),
      jobs: (jobs || []).filter((j: any) => keys.has(j.step) || (j.step === 'voice' && keys.has('render'))),
      exemplars: (exemplars || []).filter((x: any) => keys.has(x.step)),
      me: { role: 'staff', perms: g.me.perms },
    });
  }
  return NextResponse.json({ content, variant, steps, jobs, exemplars: exemplars || [], me: { role: g.me.role } });
}

/** 산출물 직접 수정 → 해당 단계는 '검수 대기', 하위 단계는 '재작업 필요' */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  const body = await req.json();
  // 필드별 권한: 산출물 = 그 단계 작업 권한 · 영상 편집(edit) = 편집기 또는 디자인 작업 · BGM = 렌더 작업 · 주제 = 현황판 작업
  const need: Record<string, () => boolean> = {
    topic: () => can(g.me, 'board', 'work'),
    bgm_id: () => canStep(g.me, 'render', 'work'),
    landing_values: () => canStep(g.me, 'landing', 'work'),
    video_edit: () => can(g.me, 'editor', 'work') || canStep(g.me, 'design', 'work'),
  };
  for (const k of Object.keys(body)) {
    const d = STEP_DEFS.find((x) => x.field === k);
    const ok = need[k] ? need[k]() : d ? canStep(g.me, d.key, 'work') : true;
    if (!ok) return NextResponse.json({ error: `'${d?.label || k}' 수정 권한이 없습니다` }, { status: 403 });
  }
  const db = sbAdmin();
  const edited: StepKey[] = [];
  // 영상 편집기: 디자인(색·폰트·위치·크기·자막 문구)을 바꾸고 렌더만 다시 하게 표시 (디자인 승인은 유지)
  if (body.video_edit?.design) {
    const { data: cur } = await db.from('contents').select('design').eq('id', params.id).single();
    const design = { ...(cur?.design || {}), ...body.video_edit.design, edited_at: new Date().toISOString(), edited_by: g.me.email };
    const { error } = await db.from('contents').update({ design }).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: r } = await db.from('steps').select('state').eq('content_id', params.id).eq('step', 'render').maybeSingle();
    if (r && r.state !== 'pending' && r.state !== 'running') await db.from('steps').update({ state: 'stale', decision_note: '영상 편집기에서 수정됨 — 다시 렌더하세요' }).eq('content_id', params.id).eq('step', 'render');
    await db.from('jobs').insert({ content_id: params.id, step: 'editor', status: 'done', message: `영상 편집 저장 (${g.me.name || g.me.email})` });
    return NextResponse.json({ ok: true, edited: ['editor'] });
  }
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
  const g = await guard(req, 'delete');
  if (g.deny) return g.deny;
  await sbAdmin().from('contents').delete().eq('id', params.id);
  return NextResponse.json({ ok: true });
}
