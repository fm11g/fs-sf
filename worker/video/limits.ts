/** 강제 중지 · 자동 정지 기준 (설정에 값이 없으면 이 기본값). 웹·워커 공용 순수 모듈 */
export const LIMIT_DEFAULTS = {
  /** AI 단계 1회 최대 시간(초). Vercel 함수 최대 300초 안에서 끝나도록 */
  step_timeout_sec: 280,
  /** 렌더 전체 최대 시간(분) — 넘으면 자동 정지 */
  render_timeout_min: 30,
  /** 렌더 진행이 이 시간(초) 동안 한 걸음도 안 나가면 멈춘 것으로 보고 자동 정지 */
  render_stall_sec: 240,
  /** GitHub Actions 가 이 시간(분) 안에 시작하지 않으면 자동 정지 */
  render_queue_min: 15,
};
export type Limits = typeof LIMIT_DEFAULTS;

export function limitsOf(s: any): Limits {
  const n = (k: keyof Limits, lo: number, hi: number) => {
    const v = Number(s?.[k]);
    return isFinite(v) && v > 0 ? Math.max(lo, Math.min(hi, v)) : LIMIT_DEFAULTS[k];
  };
  return {
    step_timeout_sec: n('step_timeout_sec', 30, 295),
    render_timeout_min: n('render_timeout_min', 5, 40),
    render_stall_sec: n('render_stall_sec', 60, 1200),
    render_queue_min: n('render_queue_min', 3, 60),
  };
}
