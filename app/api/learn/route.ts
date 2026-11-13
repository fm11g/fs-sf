import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { applyProposal, learnCounts, proposeSop, rejectProposal, revertProposal } from '@/lib/learn';
import { sbAdmin } from '@/lib/supabase/server';
import { AI_STEPS, type StepKey } from '@/lib/steps';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** ?step= → 제안 목록 + 학습 재료 개수 / 단계 없이 → 단계별 개수 */
export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const step = req.nextUrl.searchParams.get('step') as StepKey | null;
  if (!step) {
    const counts = Object.fromEntries(await Promise.all(AI_STEPS.map(async (k) => [k, await learnCounts(k)])));
    return NextResponse.json({ counts });
  }
  const { data } = await sbAdmin().from('sop_proposals').select('*').eq('step', step).order('created_at', { ascending: false }).limit(20);
  return NextResponse.json({ proposals: data || [], ...(await learnCounts(step)) });
}

/**
 * { action: 'propose', step, force? }
 * { action: 'apply', id, selected?: number[], edits?: {번호: 문구}, content?: 최종 md, note? }
 * { action: 'reject', id, note? } · { action: 'revert', id }
 */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const b = await req.json();
  try {
    if (b.action === 'propose') return NextResponse.json(await proposeSop(b.step, { force: !!b.force }));
    if (b.action === 'apply') return NextResponse.json(await applyProposal(Number(b.id), { selected: b.selected, edits: b.edits, content: b.content, note: b.note, by: 'human' }));
    if (b.action === 'reject') return NextResponse.json(await rejectProposal(Number(b.id), b.note));
    if (b.action === 'revert') return NextResponse.json(await revertProposal(Number(b.id)));
    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
