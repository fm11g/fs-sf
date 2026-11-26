import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { applyChange, checkProgram, checkPrograms, dismissChange } from '@/lib/program-watch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 공고 변경 감지 목록 (결정 대기 먼저) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  const db = sbAdmin();
  const { data, error } = await db.from('program_changes').select('*, contents(id, slug, topic, post, research, site_landing, site_post, program_check)')
    .order('detected_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: `${error.message} (018 마이그레이션 실행 여부 확인)` }, { status: 500 });
  const { data: recent } = await db.from('contents').select('id, slug, topic, post, research, program_check, published_at')
    .not('program_check', 'is', null).order('published_at', { ascending: false }).limit(30);
  return NextResponse.json({ changes: data || [], checks: recent || [] });
}

/**
 * { action: 'apply', id, note? }     반영 — 조사 공고 값 · 이벤트 마감 수정 → 홈페이지 랜딩 · 진행 중인 정책자금 갱신
 * { action: 'dismiss', id, note? }   무시
 * { action: 'check', contentId }     이 콘텐츠 공고 지금 다시 확인
 * { action: 'check_all' }            진행 중 공고 몇 개 지금 확인
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'board', 'work');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  const by = g.me?.name || g.me?.username || g.me?.email || 'admin';
  try {
    if (b.action === 'apply') return NextResponse.json(await applyChange(Number(b.id), by, b.note));
    if (b.action === 'dismiss') return NextResponse.json(await dismissChange(Number(b.id), by, b.note));
    if (b.action === 'check' && b.contentId) return NextResponse.json(await checkProgram(String(b.contentId), by));
    if (b.action === 'check_all') return NextResponse.json(await checkPrograms({ limit: 3, by }));
    return NextResponse.json({ error: 'action 확인' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
