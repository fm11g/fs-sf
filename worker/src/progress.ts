import { db } from './env.js';
import { StopError } from './watchdog.js';
import { newProgress, overallPct, RENDER_STAGES, type RenderProgress, type RenderStageKey } from '../video/stages.js';

const MAX_LOG = 80;
const now = () => new Date().toISOString();

/**
 * 렌더 진행 기록기 — contents.render_progress 에 1.2초 간격(단계 바뀔 때는 즉시)으로 저장.
 * 관리자 작업대가 이 값을 읽어 진행 바·%·단계·로그·장면별 상태를 보여 줌.
 */
export class Progress {
  p: RenderProgress;
  private last = 0;
  private timer: NodeJS.Timeout | null = null;
  private writing: Promise<any> = Promise.resolve();
  private t0 = Date.now();
  private first = true;
  /** 끝(완료·중지·실패)을 기록한 뒤에는 더 쓰지 않음 — 뒤에서 아직 돌던 작업이 결과를 덮지 않게 */
  private closed = false;
  /** 마지막으로 진행이 한 걸음 나간 시각 — 감시견이 '멈춤'을 판단 */
  lastMove = Date.now();

  private constructor(public contentId: string, p: RenderProgress) { this.p = p; }

  /** 사이트가 만든 queued 기록(같은 job)을 이어받고, 없으면 새로 */
  static async start(contentId: string) {
    const { data } = await db.from('contents').select('render_progress').eq('id', contentId).single();
    const job = process.env.RENDER_JOB || '';
    const cur = data?.render_progress as RenderProgress | null;
    // 대기 중에 이미 중지·자동 정지된 요청이면(GitHub 취소가 늦은 경우) 시작하지 않음
    if (cur && job && cur.job === job && (cur.status === 'canceled' || cur.status === 'failed')) {
      throw new StopError(cur.status === 'canceled' ? 'user' : 'timeout', `이미 ${cur.status === 'canceled' ? '중지' : '정지'}된 렌더 요청 — 시작하지 않음`);
    }
    const p = cur && cur.status !== 'done' && cur.status !== 'failed' && (!job || cur.job === job) ? cur : newProgress(job || `w-${Date.now()}`);
    const pr = new Progress(contentId, p);
    p.status = 'running';
    p.started_at = now();
    if (process.env.GITHUB_RUN_ID) p.run_url = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    // 설치 단계는 워크플로가 이미 기록 — Node 가 시작됐으면 queue·setup 은 끝난 것
    for (const k of ['queue', 'setup'] as const) {
      const st = p.stages[k] || (p.stages[k] = { state: 'wait' });
      if (st.state !== 'done') Object.assign(st, { state: 'done', pct: 100, finished_at: now(), started_at: st.started_at || p.requested_at });
    }
    pr.log('렌더 워커 시작', 'setup');
    await pr.flush();
    return pr;
  }

  log(msg: string, stage?: string, level: 'info' | 'warn' | 'error' = 'info') {
    console.log(`  · [${stage || this.p.stage}] ${msg}`);
    this.p.log.push({ t: now(), stage: stage || this.p.stage, msg, level });
    if (this.p.log.length > MAX_LOG) this.p.log = this.p.log.slice(-MAX_LOG);
    this.tick();
  }

  begin(k: RenderStageKey, detail?: string) {
    this.lastMove = Date.now();
    this.p.stage = k;
    this.p.stages[k] = { ...(this.p.stages[k] || {}), state: 'running', pct: 0, detail, started_at: now() };
    this.log(`${RENDER_STAGES.find((s) => s.key === k)?.label} 시작${detail ? ' — ' + detail : ''}`, k);
    return this.flush();
  }

  /** 단계 안 진행률 (0~100) + 설명 */
  step(k: RenderStageKey, pct: number, detail?: string) {
    const st = this.p.stages[k] || (this.p.stages[k] = { state: 'running' });
    const np = Math.max(st.pct || 0, Math.min(100, pct));
    if (np > (st.pct || 0)) this.lastMove = Date.now();
    st.pct = np;
    if (detail != null) st.detail = detail;
    this.tick();
  }

  done(k: RenderStageKey, detail?: string) {
    this.lastMove = Date.now();
    const st = this.p.stages[k] || (this.p.stages[k] = { state: 'running' });
    Object.assign(st, { state: 'done', pct: 100, finished_at: now() });
    if (detail) st.detail = detail;
    const sec = st.started_at ? ((Date.now() - Date.parse(st.started_at)) / 1000).toFixed(1) : '';
    this.log(`${RENDER_STAGES.find((s) => s.key === k)?.label} 완료${detail ? ' — ' + detail : ''}${sec ? ` (${sec}초)` : ''}`, k);
    return this.flush();
  }

  set(patch: Partial<RenderProgress>) { Object.assign(this.p, patch); this.tick(); }

  async finish(result: RenderProgress['result']) {
    for (const s of RENDER_STAGES) if (this.p.stages[s.key]?.state !== 'done') this.p.stages[s.key] = { ...this.p.stages[s.key], state: 'done', pct: 100 };
    Object.assign(this.p, { status: 'done', finished_at: now(), result, eta_sec: 0 });
    this.log(`완료 — 전체 ${((Date.now() - Date.parse(this.p.requested_at)) / 60000).toFixed(1)}분 (워커 ${((Date.now() - this.t0) / 60000).toFixed(1)}분)`, 'check');
    await this.flush();
  }

  /** 사람이 [중지] — 사이트가 이미 '중지됨'으로 기록했으므로 로그만 남김 */
  async cancel(msg: string) {
    for (const st of Object.values(this.p.stages)) if (st.state === 'running') st.state = 'failed';
    Object.assign(this.p, { status: 'canceled', finished_at: now(), error: this.p.error || msg, eta_sec: null });
    this.log(msg, this.p.stage, 'warn');
    await this.flush(true);
  }

  async fail(msg: string) {
    // 지금 단계 + 동시에 돌던 단계(프레임·인코딩)를 모두 멈춤으로
    for (const st of Object.values(this.p.stages)) if (st.state === 'running') st.state = 'failed';
    const st = this.p.stages[this.p.stage];
    if (st && st.state !== 'done') st.state = 'failed';
    Object.assign(this.p, { status: 'failed', finished_at: now(), error: msg, eta_sec: null });
    this.log(msg, this.p.stage, 'error');
    await this.flush();
  }

  /** 1.2초에 한 번만 저장 (프레임 콜백이 초당 수십 번 와도 DB 는 조용히) */
  private tick() {
    if (this.timer || this.closed) return;
    const wait = Math.max(0, 1200 - (Date.now() - this.last));
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, wait);
  }

  /** force: 사이트가 '중지/정지'로 바꾼 뒤에도 쓰기 (워커 자신의 마지막 기록) */
  flush(force = false) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.closed) return this.writing;
    if (this.p.status === 'done' || this.p.status === 'failed' || this.p.status === 'canceled') this.closed = true;
    this.last = Date.now();
    const p = this.p;
    p.pct = overallPct(p.stages);
    p.updated_at = now();
    // 남은 시간: 워커 시작 이후 속도로 추정 (프레임 단계에 들어가 의미 있는 값이 나올 때부터)
    const base = overallPct({ queue: p.stages.queue, setup: p.stages.setup });
    const worked = p.pct - base;
    const el = (Date.now() - this.t0) / 1000;
    p.eta_sec = p.status === 'running' && worked > 8 && el > 10 ? Math.round((el / worked) * (100 - p.pct)) : p.status === 'running' ? null : p.eta_sec;
    const snap = JSON.parse(JSON.stringify(p));
    // 첫 기록 이후에는 같은 요청(job)이고, 사이트가 중지·자동 정지로 바꾸지 않았을 때만 덮어씀
    const first = this.first;
    this.first = false;
    this.writing = this.writing.then(() => {
      let q: any = db.from('contents').update({ render_progress: snap }).eq('id', this.contentId);
      if (!first && !force) q = q.eq('render_progress->>job', snap.job).not('render_progress->>status', 'in', '(canceled,failed)');
      return q;
    }).then(
      (r: any) => { if (r?.error) console.warn('진행 기록 실패:', r.error.message); },
      (e: any) => console.warn('진행 기록 실패:', e.message),
    );
    return this.writing;
  }
}

let current: Progress | null = null;
export const setCurrent = (p: Progress | null) => (current = p);
/** main.ts 의 실패 처리에서 호출 — 진행 화면에 실패 단계와 사유 표시 */
export async function failCurrent(msg: string, kind?: 'user' | 'timeout') {
  if (!current || current.p.status === 'done' || current.p.status === 'canceled') return;
  if (kind === 'user') await current.cancel(msg); else await current.fail(kind === 'timeout' ? `⏱ ${msg}` : msg);
}
export const getCurrent = () => current;
