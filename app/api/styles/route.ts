import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { can } from '@/lib/perms';
import { listStyles } from '@/lib/styles';
import { cleanStyle } from '@/lib/video-style';

export const dynamic = 'force-dynamic';

/** 스타일 목록 (편집기·작업대에서도 고를 수 있게 현황판 권한이면 조회 가능) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  return NextResponse.json({ ...(await listStyles()), can_edit: can(g.me, 'styles', 'work') });
}

/**
 * { action: 'save', key?, name, desc?, style, images?, source? }  저장(새로 · key 가 숫자면 수정)
 * { action: 'default', key }                                      기본 스타일 지정
 * { action: 'delete', key }
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const g = await guard(req, b.action === 'save' && b.from_editor ? 'board' : 'styles', b.action === 'save' && b.from_editor ? 'view' : 'work');
  if (g.deny) return g.deny;
  if (b.from_editor && !can(g.me, 'styles', 'work') && !can(g.me, 'editor', 'work')) return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  const db = sbAdmin();
  if (b.action === 'save') {
    if (!String(b.name || '').trim()) return NextResponse.json({ error: '이름을 입력하세요' }, { status: 400 });
    const row = { name: String(b.name).slice(0, 40), description: b.desc ? String(b.desc).slice(0, 200) : null, style: cleanStyle(b.style), images: Array.isArray(b.images) ? b.images.slice(0, 8) : [], source: b.source || {}, updated_at: new Date().toISOString() };
    const q = /^\d+$/.test(String(b.key || '')) ? db.from('video_styles').update(row).eq('id', Number(b.key)).select().single() : db.from('video_styles').insert({ ...row, created_by: g.me.email }).select().single();
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, key: String(data.id) });
  }
  if (b.action === 'default') {
    const { data: st } = await db.from('settings').select('value').eq('id', 1).single();
    const { error } = await db.from('settings').update({ value: { ...(st?.value || {}), video_style_default: String(b.key) } }).eq('id', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'delete') {
    if (!/^\d+$/.test(String(b.key))) return NextResponse.json({ error: '기본 프리셋은 지울 수 없습니다' }, { status: 400 });
    const { error } = await db.from('video_styles').delete().eq('id', Number(b.key));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'action?' }, { status: 400 });
}
