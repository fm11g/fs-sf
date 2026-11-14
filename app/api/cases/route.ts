import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { can, canStep } from '@/lib/perms';
import { caseIssues } from '@/lib/cases';

export const dynamic = 'force-dynamic';

const FIELDS = ['industry', 'years', 'who', 'amount', 'amount_won', 'count', 'rate', 'badge1', 'badge2', 'title', 'body', 'img', 'fund_type', 'tags', 'verified', 'active', 'note'];

/** 실제 사례 목록 (랜딩 템플릿 권한 또는 랜딩 단계 권한) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  if (!can(g.me, 'landing_tpl') && !canStep(g.me, 'landing')) return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  const db = sbAdmin();
  const { data, error } = await db.from('landing_cases').select('*').order('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // ./img/… 같은 상대경로 사진을 관리자 화면에서 보이게: 활성 템플릿의 에셋 기준 URL
  const { data: tpl } = await db.from('landing_templates').select('asset_base').eq('is_active', true).maybeSingle();
  return NextResponse.json({ asset_base: tpl?.asset_base || null, cases: (data || []).map((c: any) => ({ ...c, issues: caseIssues(c) })) });
}

/** 추가·수정: { id?, ...필드 } */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'landing_tpl', 'work');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  const row: any = Object.fromEntries(Object.entries(b).filter(([k]) => FIELDS.includes(k)));
  if (row.tags && !Array.isArray(row.tags)) row.tags = String(row.tags).split(',').map((x) => x.trim()).filter(Boolean);
  if (row.amount && row.amount_won == null) row.amount_won = Number(String(row.amount).replace(/[^\d]/g, '')) || null;
  if (row.years === '') row.years = null;
  row.updated_at = new Date().toISOString();
  const db = sbAdmin();
  if (!b.id) for (const k of ['industry', 'who', 'amount', 'title', 'body']) if (!String(row[k] || '').trim()) return NextResponse.json({ error: `${k} 를 입력하세요` }, { status: 400 });
  const q = b.id ? db.from('landing_cases').update(row).eq('id', b.id).select().single() : db.from('landing_cases').insert(row).select().single();
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ case: { ...data, issues: caseIssues(data) } });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req, 'landing_tpl', 'work');
  if (g.deny) return g.deny;
  const id = req.nextUrl.searchParams.get('id');
  const { error } = await sbAdmin().from('landing_cases').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
