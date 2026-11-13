import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { guard } from '@/lib/auth';
import { can } from '@/lib/perms';
import { sbAdmin } from '@/lib/supabase/server';
import { addReference, createFromReference, reanalyze, REF_STEPS } from '@/lib/references';
import { proposeFromReferences } from '@/lib/learn';
import { ensureSteps } from '@/lib/pipeline';
import type { StepKey } from '@/lib/steps';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const g = await guard(req, 'references');
  if (g.deny) return g.deny;
  const id = req.nextUrl.searchParams.get('id');
  const db = sbAdmin();
  if (id) {
    const { data } = await db.from('ref_videos').select('*').eq('id', id).maybeSingle();
    const { data: made } = await db.from('contents').select('id, slug, topic, current_step, created_at').eq('reference_id', id).order('created_at', { ascending: false }).limit(20);
    return NextResponse.json({ ref: data, made: made || [] });
  }
  const { data } = await db.from('ref_videos').select('id, kind, url, title, channel, note, tags, weight, learn_steps, active, status, error, meta, frames, uses, created_by, created_at, analyzed_at, analysis->summary, analysis->fit_score, analysis->hook, analysis->taxonomy').order('created_at', { ascending: false }).limit(200);
  return NextResponse.json({ refs: data || [], steps: REF_STEPS });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, 'references', 'work');
  if (g.deny) return g.deny;
  const me = g.me;
  const b = await req.json().catch(() => ({}));
  const db = sbAdmin();
  try {
    switch (b.action) {
      case 'upload_url': {
        // 브라우저 → Supabase 스토리지 직접 업로드 (Vercel 요청 크기 제한 회피)
        const ext = String(b.filename || 'video.mp4').split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
        if (!['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return bad('mp4·mov·webm 영상만 올릴 수 있습니다');
        const path = `refs/uploads/${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.${ext}`;
        const { data, error } = await db.storage.from('media').createSignedUploadUrl(path);
        if (error) throw new Error(error.message);
        return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
      }
      case 'add': {
        const urls: string[] = String(b.url || '').split(/\s+/).map((x) => x.trim()).filter(Boolean);
        if (b.storage_path || urls.length <= 1) return NextResponse.json(await addReference({ ...b, url: urls[0] }, me.email));
        // 링크 여러 개를 한 번에
        const out = [];
        for (const u of urls.slice(0, 20)) out.push(await addReference({ ...b, url: u }, me.email).catch((e) => ({ error: e.message, url: u })));
        return NextResponse.json({ many: out });
      }
      case 'update': {
        const p = b.patch || {};
        const patch: any = {};
        for (const k of ['title', 'note', 'active']) if (p[k] !== undefined) patch[k] = p[k];
        if (p.weight !== undefined) patch.weight = Math.min(5, Math.max(1, Number(p.weight)));
        if (p.tags !== undefined) patch.tags = (Array.isArray(p.tags) ? p.tags : String(p.tags).split(',')).map((t: string) => t.trim()).filter(Boolean);
        if (p.learn_steps !== undefined) patch.learn_steps = (p.learn_steps as string[]).filter((s) => REF_STEPS.includes(s as StepKey));
        if (p.analysis !== undefined) patch.analysis = p.analysis; // 분석 결과 직접 수정
        const { error } = await db.from('ref_videos').update(patch).eq('id', b.id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      case 'reanalyze':
        await reanalyze(Number(b.id));
        return NextResponse.json({ ok: true });
      case 'make': {
        if (!can(me, 'board', 'work')) return bad('현황판 작업 권한(새 숏폼 만들기)이 필요합니다', 403);
        const c = await createFromReference(Number(b.id), b.topic);
        await ensureSteps(c.id);
        return NextResponse.json(c);
      }
      case 'propose': {
        if (!can(me, 'sop', 'work')) return bad('SOP 작업 권한이 필요합니다', 403);
        const ids: number[] = (Array.isArray(b.ids) ? b.ids : [b.id]).map(Number).filter(Boolean);
        return NextResponse.json(await proposeFromReferences(b.step, ids));
      }
      default:
        return bad('알 수 없는 작업');
    }
  } catch (e: any) {
    return bad(e.message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req, 'references', 'work');
  if (g.deny) return g.deny;
  const id = Number(req.nextUrl.searchParams.get('id'));
  const db = sbAdmin();
  const { data: r } = await db.from('ref_videos').select('storage_path, frames').eq('id', id).maybeSingle();
  if (r) {
    const paths = [r.storage_path, ...((r.frames || []) as any[]).map((f) => f.path)].filter(Boolean);
    if (paths.length) await db.storage.from('media').remove(paths);
  }
  await db.from('ref_videos').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
