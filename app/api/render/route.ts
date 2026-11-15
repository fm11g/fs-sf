import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { dispatch } from '@/lib/github';
import { requireApproved } from '@/lib/pipeline';
import { sbAdmin } from '@/lib/supabase/server';
import { newProgress } from '@/worker/video/stages';
import { reapStale } from '@/lib/stop';
import { limitsOf } from '@/lib/limits';
import { getSettings } from '@/lib/settings';
import { hydrateEnv } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

/** 음성·자막·BGM·모션그래픽 렌더를 GitHub Actions 워커에 요청 (대사·디자인 승인 필요) */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'step:render', 'work');
  if (g.deny) return g.deny;
  const { contentId } = await req.json();
  const db = sbAdmin();
  const job = `r${Date.now().toString(36)}`;
  let marked = false;
  try {
    await requireApproved(contentId, 'render');
    // 렌더 전 점검 — 워커를 띄우기 전에 빠진 것을 알려 줌 (몇 분 기다렸다가 실패하지 않게)
    await hydrateEnv(true);
    const miss: string[] = [];
    if (!process.env.FISH_AUDIO_API_KEY) miss.push('Fish Audio API 키가 비어 있음 → [연결·키] > AI 목소리 (목소리 없이는 렌더 불가)');
    if (!process.env.GITHUB_REPO || !process.env.GITHUB_TOKEN) miss.push('GitHub 저장소·토큰이 비어 있음 → [연결·키] > 워커(GitHub)');
    if (!process.env.SITE_URL) miss.push('사이트 주소(SITE_URL)가 비어 있음 → [연결·키] > 자동 생성');
    const col = await db.from('contents').select('render_progress, cancel_requested_at').eq('id', contentId).single();
    if (col.error && /column/i.test(col.error.message)) miss.push('DB 업데이트 필요 — setup/supabase-all-in-one.sql 을 Supabase SQL Editor 에서 다시 실행하세요 (렌더 진행·중지 컬럼 없음)');
    if (miss.length) return NextResponse.json({ error: `렌더를 시작할 수 없습니다:\n· ${miss.join('\n· ')}`, problems: miss }, { status: 400 });
    const { data: cur } = await db.from('contents').select('render_progress').eq('id', contentId).single();
    const rp: any = cur?.render_progress;
    // 진행 중인 렌더가 최근(3분 안에 갱신)이면 중복 요청 막기
    if (rp && (rp.status === 'running' || rp.status === 'queued') && Date.now() - Date.parse(rp.updated_at) < 180000) {
      return NextResponse.json({ error: `이미 렌더 중입니다 (${Math.round(rp.pct || 0)}%)` }, { status: 409 });
    }
    const p = newProgress(job);
    p.log[0].msg = `렌더 요청 — ${g.me?.name || g.me?.email || '관리자'}`;
    await db.from('contents').update({ status: 'rendering', error: null, render_progress: p, cancel_requested_at: null }).eq('id', contentId);
    await db.from('steps').update({ state: 'running', started_at: new Date().toISOString() }).eq('content_id', contentId).eq('step', 'render');
    marked = true;
    await dispatch('render', { content_id: contentId, job });
    return NextResponse.json({ ok: true, job });
  } catch (e: any) {
    // 요청 단계에서 실패 → 진행 화면에도 실패로 표시
    const { data: cur } = await db.from('contents').select('render_progress').eq('id', contentId).single();
    const rp: any = cur?.render_progress;
    if (marked && rp?.job !== job) {
      // 진행 기록이 없어도 '작업 중'으로 남지 않게
      await db.from('steps').update({ state: 'failed', finished_at: new Date().toISOString() }).eq('content_id', contentId).eq('step', 'render');
      await db.from('contents').update({ status: 'failed', error: `[render] ${e.message}` }).eq('id', contentId);
    }
    if (rp?.job === job) {
      const t = new Date().toISOString();
      rp.status = 'failed'; rp.error = e.message; rp.finished_at = t; rp.updated_at = t;
      rp.stages.queue = { ...rp.stages.queue, state: 'failed', detail: e.message };
      rp.log.push({ t, stage: 'queue', msg: e.message, level: 'error' });
      await db.from('contents').update({ render_progress: rp, status: 'failed', error: `[render] ${e.message}` }).eq('id', contentId);
      await db.from('steps').update({ state: 'failed', finished_at: t }).eq('content_id', contentId).eq('step', 'render');
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/** 렌더 진행 상황 (작업대가 2초마다 읽음) — ?id=콘텐츠ID */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'step:render', 'view');
  if (g.deny) return g.deny;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id?' }, { status: 400 });
  await reapStale().catch(() => {}); // 응답 없는 렌더·AI 단계 자동 정지
  const { data, error } = await sbAdmin().from('contents').select('status, video_url, render_progress').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const limits = limitsOf(await getSettings().catch(() => ({})));
  return NextResponse.json({ progress: data.render_progress, status: data.status, video_url: data.video_url, now: new Date().toISOString(), limits });
}
