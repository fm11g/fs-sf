import { sbAdmin } from './supabase/server';
import { hydrateEnv } from './secrets';
import { limitsOf, type Limits } from './limits';
import type { RenderProgress } from '@/worker/video/stages';

/** 중지 신호 — user: 사람이 [중지], timeout: 시간 초과 자동 정지 */
export class StopError extends Error {
  constructor(public kind: 'user' | 'timeout', msg: string) { super(msg); this.name = 'StopError'; }
}

const now = () => new Date().toISOString();
const sec = (ms: number) => (ms >= 60000 ? `${Math.floor(ms / 60000)}분 ${Math.round((ms % 60000) / 1000)}초` : `${Math.round(ms / 1000)}초`);

/**
 * AI 단계 감시 — 3초마다 단계 상태를 읽어 [중지]됐으면, 제한 시간이 지나면 reject.
 * Promise.race 로 생성 작업과 경주시켜, 멈추면 결과를 기다리지 않고 바로 돌아감(늦게 온 결과는 저장하지 않음).
 */
export function watchStep(contentId: string, step: string, startedAt: string, limitSec: number) {
  let timer: NodeJS.Timeout | null = null;
  let stopped: StopError | null = null;
  const t0 = Date.now();
  const check = async () => {
    if (stopped) throw stopped;
    if (Date.now() - t0 > limitSec * 1000) stopped = new StopError('timeout', `시간 초과로 자동 정지 (${limitSec}초 제한)`);
    else {
      const { data } = await sbAdmin().from('steps').select('state, started_at').eq('content_id', contentId).eq('step', step).single();
      // 내가 시작한 실행이 아니게 됐으면(중지·다른 실행) 멈춤
      if (data && (data.state !== 'running' || (data.started_at && Date.parse(data.started_at) !== Date.parse(startedAt)))) stopped = new StopError('user', '사용자가 중지함');
    }
    if (stopped) throw stopped;
  };
  const promise = new Promise<never>((_, reject) => {
    const loop = async () => {
      try { await check(); timer = setTimeout(loop, 3000); } catch (e) { reject(e); }
    };
    timer = setTimeout(loop, 3000);
  });
  promise.catch(() => {}); // 경주에서 진 경우 처리 안 된 거부 경고 방지
  return { promise, check, done: () => { if (timer) clearTimeout(timer); timer = null; } };
}

/** AI 단계 [중지] — 진행 중 표시를 바로 풀고 실패(중지)로 기록. 실행 중이던 요청은 다음 확인(≤3초) 때 결과를 버리고 끝남 */
export async function stopStep(contentId: string, step: string, by: string, reason = '사용자가 중지함') {
  const db = sbAdmin();
  const { data: row } = await db.from('steps').select('state, started_at, work_ms').eq('content_id', contentId).eq('step', step).single();
  if (!row || row.state !== 'running') return { ok: false, message: '진행 중인 작업이 없습니다' };
  const t = now();
  const ms = row.started_at ? Date.now() - Date.parse(row.started_at) : 0;
  await db.from('steps').update({ state: 'failed', finished_at: t, work_ms: Number(row.work_ms || 0) + ms }).eq('content_id', contentId).eq('step', step);
  await db.from('contents').update({ error: `[${step}] ${reason} (${sec(ms)} 진행 후)` }).eq('id', contentId);
  await db.from('jobs').insert({ content_id: contentId, step, status: 'canceled', message: `${reason} — ${by}` }).then(() => {}, () => {});
  return { ok: true };
}

// ── 렌더 ──
async function gh(path: string, init?: RequestInit) {
  await hydrateEnv();
  const repo = process.env.GITHUB_REPO, token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GitHub 토큰 없음');
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  return r;
}

/** 이 렌더의 GitHub Actions 실행을 찾아 취소. run_url 이 없으면(아직 대기 중) 실행 제목의 job 값으로 찾음 */
export async function cancelRun(p: Partial<RenderProgress> | null) {
  let runId = p?.run_url?.match(/runs\/(\d+)/)?.[1];
  if (!runId && p?.job) {
    for (const st of ['queued', 'in_progress', 'waiting', 'pending']) {
      const r = await gh(`/actions/runs?status=${st}&per_page=30`);
      if (!r.ok) continue;
      const j: any = await r.json();
      const hit = (j.workflow_runs || []).find((x: any) => String(x.display_title || x.name || '').includes(p.job!));
      if (hit) { runId = String(hit.id); break; }
    }
  }
  if (!runId) return { ok: false, message: '취소할 GitHub 실행을 찾지 못함 (이미 끝났거나 아직 생성 전)' };
  let r = await gh(`/actions/runs/${runId}/cancel`, { method: 'POST' });
  if (r.status === 409) r = await gh(`/actions/runs/${runId}/force-cancel`, { method: 'POST' }); // 취소가 안 먹는 상태면 강제 취소
  if (r.ok || r.status === 202) return { ok: true, message: `GitHub 실행 #${runId} 취소 요청됨` };
  return { ok: false, message: `GitHub 실행 취소 실패 ${r.status} — 토큰에 Actions 쓰기 권한이 필요합니다. 워커가 스스로 멈춥니다.` };
}

/**
 * 렌더 중지 — 진행 기록을 중지/실패로 바꾸고, 워커에 중지 신호(cancel_requested_at), GitHub 실행 취소.
 * kind=user: 사람이 중지 / timeout: 자동 정지
 */
export async function stopRender(contentId: string, kind: 'user' | 'timeout', reason: string) {
  const db = sbAdmin();
  const { data } = await db.from('contents').select('render_progress').eq('id', contentId).single();
  const p = data?.render_progress as RenderProgress | null;
  if (!p || (p.status !== 'running' && p.status !== 'queued')) return { ok: false, message: '진행 중인 렌더가 없습니다' };
  const t = now();
  for (const st of Object.values(p.stages || {})) if (st.state === 'running') st.state = 'failed';
  p.status = kind === 'user' ? 'canceled' : 'failed';
  p.error = reason; p.finished_at = t; p.updated_at = t; p.eta_sec = null;
  p.log = [...(p.log || []), { t, stage: p.stage, msg: reason, level: kind === 'user' ? 'warn' : 'error' }];
  await db.from('contents').update({ render_progress: p, cancel_requested_at: t, status: 'failed', error: `[render] ${reason}` }).eq('id', contentId);
  await db.from('steps').update({ state: 'failed', finished_at: t }).eq('content_id', contentId).eq('step', 'render').eq('state', 'running');
  let gr: { ok: boolean; message: string };
  try { gr = await cancelRun(p); } catch (e: any) { gr = { ok: false, message: `GitHub 실행 취소 실패: ${e.message}` }; }
  // 결과를 로그에 한 줄 더 (같은 기록 위에)
  const { data: d2 } = await db.from('contents').select('render_progress').eq('id', contentId).single();
  const p2 = d2?.render_progress as RenderProgress | null;
  if (p2 && p2.job === p.job) {
    p2.log = [...(p2.log || []), { t: now(), stage: p.stage, msg: gr.message, level: gr.ok ? 'info' : 'warn' }];
    await db.from('contents').update({ render_progress: p2 }).eq('id', contentId);
  }
  return { ok: true, github: gr };
}

/**
 * 멈춘 작업 정리 (자동 정지) — 현황판·작업대·렌더 진행 조회·매일 크론에서 호출.
 *  · AI 단계: 제한 시간 + 여유 60초가 지나도 '작업 중'이면 → 실패(시간 초과). 서버 함수가 강제 종료돼 기록을 못 남긴 경우
 *  · 렌더: 대기가 render_queue_min 넘음 / 진행 기록이 render_stall_sec×2 넘게 끊김 / 전체가 render_timeout_min+5분 넘음 → 자동 정지
 * 30초에 한 번만 실제로 검사.
 */
let lastReap = 0;
export async function reapStale(force = false) {
  if (!force && Date.now() - lastReap < 30000) return { steps: 0, renders: 0 };
  lastReap = Date.now();
  const db = sbAdmin();
  const { data: sv } = await db.from('settings').select('value').eq('id', 1).single();
  const L: Limits = limitsOf(sv?.value);
  let steps = 0, renders = 0;

  const cut = new Date(Date.now() - (L.step_timeout_sec + 60) * 1000).toISOString();
  const { data: stuck } = await db.from('steps').select('content_id, step, started_at').eq('state', 'running').not('step', 'in', '(render,publish)').lt('started_at', cut).limit(50);
  for (const r of stuck || []) {
    const ms = Date.now() - Date.parse(r.started_at);
    await stopStep(r.content_id, r.step, '자동 정지', `응답 없이 ${sec(ms)} 지나 자동 정지 (제한 ${L.step_timeout_sec}초)`);
    steps++;
  }

  const { data: rs } = await db.from('contents').select('id, render_progress').in('render_progress->>status', ['running', 'queued']).limit(50);
  for (const c of rs || []) {
    const p = c.render_progress as RenderProgress;
    const age = (iso?: string) => (iso ? Date.now() - Date.parse(iso) : 0);
    let why = '';
    if (p.status === 'queued' && age(p.requested_at) > L.render_queue_min * 60000) why = `GitHub Actions 가 ${L.render_queue_min}분 안에 시작하지 않아 자동 정지`;
    else if (age(p.updated_at) > Math.max(L.render_stall_sec * 2, 300) * 1000) why = `렌더 워커 응답이 ${sec(age(p.updated_at))} 동안 없어 자동 정지`;
    else if (age(p.requested_at) > (L.render_timeout_min + 5) * 60000) why = `전체 ${L.render_timeout_min}분 제한을 넘어 자동 정지`;
    if (why) { await stopRender(c.id, 'timeout', why); renders++; }
  }
  return { steps, renders };
}
