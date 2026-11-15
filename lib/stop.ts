import { sbAdmin } from './supabase/server';
import { hydrateEnv, normRepo } from './secrets';
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
  const repo = normRepo(process.env.GITHUB_REPO || ''), token = process.env.GITHUB_TOKEN;
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
  // 렌더 단계가 '작업 중'인데 살아 있는 진행 기록이 없음 (요청이 워커에 전달되지 않은 예전 실패 등) → 실패로 풀어 줌
  const qcut = new Date(Date.now() - 180000).toISOString();
  const { data: rsteps } = await db.from('steps').select('content_id, started_at').eq('step', 'render').eq('state', 'running').lt('started_at', qcut).limit(50);
  for (const r of rsteps || []) {
    const { data: c } = await db.from('contents').select('render_progress').eq('id', r.content_id).single();
    const st = (c?.render_progress as any)?.status;
    if (st === 'running' || st === 'queued') continue;
    await db.from('steps').update({ state: 'failed', finished_at: now() }).eq('content_id', r.content_id).eq('step', 'render').eq('state', 'running');
    await db.from('contents').update({ error: '[render] 렌더 요청이 워커에 전달되지 않아 멈춰 있던 상태를 풀었습니다 — [연결·키]에서 GitHub 연결 확인 후 다시 렌더하세요' }).eq('id', r.content_id);
    renders++;
  }
  return { steps, renders };
}

// ── GitHub 실행 상태 조회 (렌더가 '요청 접수'·'서버 준비'에서 멈춰 보일 때 원인 표시) ──
const ghCache = new Map<string, { at: number; v: GhInfo }>();
export type GhInfo = {
  state: 'not_found' | 'queued' | 'waiting' | 'in_progress' | 'completed' | 'error';
  message: string; run_url?: string; conclusion?: string | null;
  steps?: { name: string; status: string; conclusion: string | null }[];
  failed_step?: string; log_tail?: string[];
  blocking?: { url: string; title: string; status: string }[];
};

/**
 * 이 렌더(job)의 GitHub Actions 실행을 찾아 상태·단계 목록을 돌려줌 (8초 캐시).
 * 못 찾으면: Actions 꺼짐 / 워크플로가 기본 브랜치에 없음 / 아직 생성 전 / 같은 콘텐츠의 이전 실행이 막고 있음 을 구분해 안내.
 */
export async function ghRunInfo(p: Partial<RenderProgress>, contentId: string): Promise<GhInfo> {
  const key = String(p.job || '');
  const c = ghCache.get(key);
  if (c && Date.now() - c.at < 8000) return c.v;
  const put = (v: GhInfo) => { ghCache.set(key, { at: Date.now(), v }); return v; };
  try {
    const r = await gh(`/actions/runs?per_page=40&event=repository_dispatch`);
    if (!r.ok) return put({ state: 'error', message: `GitHub 실행 목록 조회 실패 ${r.status} — 토큰에 Actions: Read 권한이 필요합니다` });
    const runs: any[] = (await r.json()).workflow_runs || [];
    const mine = runs.find((x) => String(x.display_title || '').includes(key));
    // 같은 콘텐츠의 끝나지 않은 다른 실행 (동시 실행 방지 때문에 새 실행이 기다림)
    const blocking = runs.filter((x) => x !== mine && x.status !== 'completed' && String(x.display_title || '').includes(contentId))
      .map((x) => ({ url: x.html_url, title: x.display_title, status: x.status }));
    if (!mine) {
      const age = p.requested_at ? (Date.now() - Date.parse(p.requested_at)) / 1000 : 0;
      if (age < 25) return put({ state: 'not_found', message: 'GitHub 이 실행을 만드는 중…' });
      const wr = await gh(`/actions/workflows`);
      const wf = wr.ok ? ((await wr.json()).workflows || []).find((w: any) => w.name === 'factory') : null;
      const hint = !wf ? "저장소 기본 브랜치에 .github/workflows/factory.yml 이 없습니다 — 이 프로젝트 코드를 기본 브랜치에 올리세요"
        : wf.state !== 'active' ? `워크플로 'factory' 가 꺼져 있습니다(${wf.state}) — GitHub 저장소 > Actions > factory > Enable workflow`
        : '저장소 Settings > Actions > General 에서 Actions 허용(Allow all actions) 여부, 결제·사용 한도를 확인하세요';
      return put({ state: 'not_found', message: `${Math.round(age)}초가 지나도 GitHub 에 실행이 생기지 않음 — ${hint}`, blocking });
    }
    const info: GhInfo = { state: mine.status === 'completed' ? 'completed' : mine.status === 'in_progress' ? 'in_progress' : ['waiting', 'pending', 'requested'].includes(mine.status) ? 'waiting' : 'queued', message: '', run_url: mine.html_url, conclusion: mine.conclusion, blocking };
    if (info.state === 'waiting' || (info.state === 'queued' && blocking.length)) info.message = blocking.length ? `같은 콘텐츠의 이전 실행 ${blocking.length}개가 끝나길 기다리는 중 — 필요 없으면 GitHub 에서 취소하세요` : 'GitHub 대기 중 (승인·동시 실행 제한)';
    else if (info.state === 'queued') info.message = 'GitHub 이 렌더 서버(러너)를 배정하는 중 — 보통 10초~1분';
    else if (info.state === 'completed') info.message = `GitHub 실행이 끝남 (${mine.conclusion})${mine.conclusion !== 'success' ? ' — 실행 화면에서 실패 단계 로그를 확인하세요' : ''}`;
    else info.message = 'GitHub 렌더 서버에서 실행 중';
    if (info.state === 'in_progress' || info.state === 'completed') {
      const jr = await gh(`/actions/runs/${mine.id}/jobs`);
      const job = jr.ok ? ((await jr.json()).jobs || [])[0] : null;
      if (job) info.steps = (job.steps || []).map((s: any) => ({ name: s.name, status: s.status, conclusion: s.conclusion }));
      // 실패면 실패한 단계 + 로그 끝부분 (오류 줄 위주)
      if (job && mine.conclusion === 'failure') {
        info.failed_step = (job.steps || []).find((s: any) => s.conclusion === 'failure')?.name;
        const lr = await gh(`/actions/jobs/${job.id}/logs`).catch(() => null);
        if (lr?.ok) {
          const lines = (await lr.text()).split('\n').map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, '').replace(/\x1b\[[0-9;]*m/g, '')).filter((l) => l.trim() && !/^##\[(endgroup|group\]Post)/.test(l));
          const end = lines.findIndex((l) => /Process completed with exit code|##\[error\]/.test(l));
          const upto = end >= 0 ? lines.slice(0, end + 1) : lines;
          info.log_tail = upto.slice(-30).map((l) => l.slice(0, 300));
        }
        info.message = `GitHub 실행 실패 — 단계: ${info.failed_step || '?'}`;
      }
    }
    return put(info);
  } catch (e: any) {
    return put({ state: 'error', message: `GitHub 조회 실패: ${e.message}` });
  }
}
