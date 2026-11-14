import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { parseSlots } from '@/lib/landing';
import { casesFromTemplate } from '@/lib/cases';

export const dynamic = 'force-dynamic';

/** 활성 랜딩 템플릿의 후기 카드(지금 페이지에 있는 후기) → 실제 사례 목록으로 가져오기 (같은 제목은 건너뜀) */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'landing_tpl', 'work');
  if (g.deny) return g.deny;
  const db = sbAdmin();
  const { data: tpl } = await db.from('landing_templates').select('html').eq('is_active', true).maybeSingle();
  if (!tpl) return NextResponse.json({ error: '활성 랜딩 템플릿이 없습니다' }, { status: 400 });
  const found = casesFromTemplate(parseSlots(tpl.html));
  if (!found.length) return NextResponse.json({ error: '템플릿에 후기 카드 슬롯(case1_title …)이 없습니다' }, { status: 400 });
  const { data: have } = await db.from('landing_cases').select('title, who');
  const key = (x: any) => `${x.who}|${x.title}`;
  const exist = new Set((have || []).map(key));
  const add = found.filter((x) => !exist.has(key(x)));
  if (add.length) {
    const { error } = await db.from('landing_cases').insert(add);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ found: found.length, added: add.length });
}
