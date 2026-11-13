import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { ensureSteps, newSlug } from '@/lib/pipeline';
import { claimSlot } from '@/lib/editorial';

export const dynamic = 'force-dynamic';

/** 새 콘텐츠 생성 { topic? } */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'board', 'work');
  if (g.deny) return g.deny;
  const { topic } = await req.json().catch(() => ({}));
  const { data, error } = await sbAdmin().from('contents')
    .insert({ slug: newSlug(), topic: topic || null, status: 'working', current_step: 'research' })
    .select('id, slug').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await ensureSteps(data.id);
  // 조사 전에 오늘 편성 슬롯 배정 (채널 성과 × 새로움)
  const editorial = await claimSlot(data.id).catch((e) => ({ error: e.message }));
  return NextResponse.json({ ...data, editorial });
}
