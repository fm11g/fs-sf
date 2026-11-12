import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { ensureSteps, newSlug } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

/** 새 콘텐츠 생성 { topic? } */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { topic } = await req.json().catch(() => ({}));
  const { data, error } = await sbAdmin().from('contents')
    .insert({ slug: newSlug(), topic: topic || null, status: 'working', current_step: 'research' })
    .select('id, slug').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await ensureSteps(data.id);
  return NextResponse.json(data);
}
