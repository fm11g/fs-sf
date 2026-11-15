import { db } from './env.js';
import { limitsOf, type Limits } from '../video/limits.js';
import type { Progress } from './progress.js';

/** 중지 신호 (사이트 lib/stop.ts 의 StopError 와 같은 뜻) */
export class StopError extends Error {
  constructor(public kind: 'user' | 'timeout', msg: string) { super(msg); this.name = 'StopError'; }
}

/**
 * 렌더 감시견 — 4초마다
 *  ① 사이트에서 [중지]를 눌렀는지 (contents.cancel_requested_at)
 *  ② 전체 시간이 render_timeout_min 을 넘었는지
 *  ③ 진행이 render_stall_sec 동안 한 걸음도 안 나갔는지 (프레임·장면·업로드 어디서든 멈춤)
 * 걸리면 Remotion 렌더를 취소하고, render() 를 감싼 경주(Promise.race)를 끝내 바로 빠져나감.
 */
export class Watchdog {
  promise: Promise<never>;
  private reject!: (e: any) => void;
  private timer: NodeJS.Timeout | null = null;
  private onStop: (() => void)[] = [];
  private t0 = Date.now();
  stopped: StopError | null = null;
  limits: Limits;

  constructor(private contentId: string, s: any, private getProgress: () => Progress | null) {
    this.limits = limitsOf(s);
    this.promise = new Promise<never>((_, rej) => (this.reject = rej));
    this.promise.catch(() => {});
    this.timer = setInterval(() => this.tick().catch((e) => console.warn('감시 확인 실패:', e.message)), 4000);
  }

  /** 멈출 때 같이 실행할 것 (Remotion cancel 등) */
  whenStop(fn: () => void) { this.onStop.push(fn); }

  /** 끊을 수 있는 지점에서 호출 — 멈췄으면 바로 throw */
  guard() { if (this.stopped) throw this.stopped; }

  trip(e: StopError) {
    if (this.stopped) return;
    this.stopped = e;
    console.warn(`■ ${e.kind === 'user' ? '중지' : '자동 정지'}: ${e.message}`);
    for (const f of this.onStop) { try { f(); } catch { /* 이미 끝남 */ } }
    this.reject(e);
  }

  private async tick() {
    if (this.stopped) return;
    const pr = this.getProgress();
    const { data } = await db.from('contents').select('cancel_requested_at').eq('id', this.contentId).single();
    const startedAt = pr?.p.started_at ? Date.parse(pr.p.started_at) : this.t0;
    if (data?.cancel_requested_at && Date.parse(data.cancel_requested_at) >= startedAt - 1000) {
      return this.trip(new StopError('user', '사이트에서 중지 요청 — 워커가 멈춤'));
    }
    const L = this.limits;
    const total = pr?.p.requested_at ? Date.now() - Date.parse(pr.p.requested_at) : Date.now() - this.t0;
    if (total > L.render_timeout_min * 60000) {
      return this.trip(new StopError('timeout', `전체 ${L.render_timeout_min}분 제한을 넘어 자동 정지`));
    }
    const idle = pr ? Date.now() - pr.lastMove : 0;
    if (idle > L.render_stall_sec * 1000) {
      const st = pr?.p.stage;
      return this.trip(new StopError('timeout', `${Math.round(idle / 1000)}초 동안 진행이 없어 자동 정지 (멈춘 단계: ${st}, 기준 ${L.render_stall_sec}초)`));
    }
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
