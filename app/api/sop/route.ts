import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { can, canStep } from '@/lib/perms';
import { commitSopToGithub, defaultSop, getSop, listSops, saveSop, sopHash } from '@/lib/sop';
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
    if (action === 'usage') {
      // 버전별: 언제 저장됐고, 어떤 결과물에 몇 번 쓰였고, 결과(승인·검수·실패)와 평균 점수는 어땠는지
      const db = sbAdmin();
      const [{ data: vers }, { data: uses }, { data: ex }, cur] = await Promise.all([
        db.from('sop_versions').select('id, content, freedom, gate, note, hash, created_at').eq('step', step).order('created_at', { ascending: false }).limit(60),
        db.from('sop_usage').select('id, sop_hash, version_id, content_id, outcome, decided_by, provider, model, feedback, attempt, created_at, contents(slug, topic)').eq('step', step).order('created_at', { ascending: false }).limit(400),
        db.from('exemplars').select('sop_hash, score').eq('step', step).not('score', 'is', null).limit(2000),
        getSop(step as StepKey),
      ]);
      const curHash = sopHash(cur.content);
      const versions = (vers || []).map((v: any) => {
        const hash = v.hash || sopHash(v.content);
        const u = (uses || []).filter((x: any) => x.sop_hash === hash);
        const sc = (ex || []).filter((x: any) => x.sop_hash === hash).map((x: any) => Number(x.score));
        return {
          ...v, hash, current: hash === curHash, uses: u.length,
          approved: u.filter((x: any) => x.outcome === 'approved').length, review: u.filter((x: any) => x.outcome === 'review').length,
          failed: u.filter((x: any) => x.outcome === 'failed' || x.outcome === 'stopped').length,
          avg_score: sc.length ? Math.round((sc.reduce((a, b) => a + b, 0) / sc.length) * 10) / 10 : null, scored: sc.length,
          last_used: u[0]?.created_at || null,
        };
      });
      // 버전이 남아 있지 않은 해시(기록 이전에 쓰인 SOP)도 사용 이력이 있으면 보여 줌
      const known = new Set(versions.map((v: any) => v.hash));
      const orphan = Array.from(new Set((uses || []).map((x: any) => x.sop_hash))).filter((h) => !known.has(h));
      return NextResponse.json({ current_hash: curHash, versions, orphan, usage: uses || [] });
    }
    if (action === 'versions') {
      const { data } = await sbAdmin().from('sop_versions').select('*').eq('step', step).order('created_at', { ascending: false }).limit(20);
      return NextResponse.json({ versions: data || [] });
    }
    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
