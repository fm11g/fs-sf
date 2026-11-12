import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { parseSlots } from '@/lib/landing';
import { sbAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 템플릿 저장/수정 { id?, name, html, asset_base?, is_active? } → data-slot 자동 파싱 */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { id, name, html, asset_base, is_active } = await req.json();
  const slots = parseSlots(html);
  if (!slots.length) return NextResponse.json({ error: 'data-slot 속성이 하나도 없습니다' }, { status: 400 });
  const db = sbAdmin();
  if (is_active) await db.from('landing_templates').update({ is_active: false }).neq('id', id ?? '00000000-0000-0000-0000-000000000000');
  const row = { name, html, slots, asset_base: asset_base || null, is_active: !!is_active };
  const { data, error } = id
    ? await db.from('landing_templates').update(row).eq('id', id).select().single()
    : await db.from('landing_templates').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
