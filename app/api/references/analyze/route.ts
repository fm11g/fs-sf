import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { analyzeWithAI } from '@/lib/references';
import { sbAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 워커가 영상·자막·컷·프레임 추출을 마친 뒤 호출 → AI 비전 분석 (대표가 수동으로 다시 돌릴 수도 있음) */
export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (g.deny) return g.deny;
  const { ref_id } = await req.json().catch(() => ({}));
  try {
    const a = await analyzeWithAI(Number(ref_id));
    return NextResponse.json({ ok: true, summary: a.summary, rules: a.replicate_rules?.length || 0 });
  } catch (e: any) {
    await sbAdmin().from('ref_videos').update({ status: 'failed', error: `AI 분석 실패: ${e.message}` }).eq('id', ref_id);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
