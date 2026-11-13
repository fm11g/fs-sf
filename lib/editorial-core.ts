import { DIMENSIONS, DIM_KEYS, type DimKey } from './editorial-taxonomy';

/**
 * 편성 핵심 로직 (순수 함수)
 *  - 후보 점수 = (1 − 새로움 강도) × 성과(축소 평균) + 새로움 강도 × 새로움(마지막 사용 이후 경과)
 *    · 축소 평균: 근거가 적은 값은 채널 평균 쪽으로 당겨서 우연히 한 번 잘 된 값에 쏠리지 않게
 *  - 반복 규칙: 같은 주제 분류 연속 금지 · 각도 쿨다운 · 훅 3연속 금지 · 구성 연속 금지
 *  - 실험 슬롯: 근거가 적은 값을 일부러 시도 (일주일 × 실험 비율)
 */
export type DimStat = { value: string; n: number; avg: number | null; days_since: number | null; used_7d: number };
export type Slot = {
  date: string; order: number; topic_category: string; angle: string; hook_type: string; format: string; target: string;
  expected: number; novelty: number; experiment: boolean; reason: string; locked?: boolean; content_id?: string | null;
  title_idea?: string; hook_example?: string; flow_note?: string;
};
export type SeqItem = { at: string; attrs: Record<string, any> };
export type Opts = { novelty_strength?: number; explore_rate?: number; cooldown_days?: number };

const PRIOR_N = 2;

export function candidateTable(dims: Record<string, DimStat[]>, overall: number, o: Opts) {
  const ns = Math.min(1, Math.max(0, Number(o.novelty_strength ?? 0.35)));
  const cd = Math.max(1, Number(o.cooldown_days ?? 3));
  return Object.fromEntries(DIM_KEYS.map((k) => [k, (dims[k] || (DIMENSIONS[k].values as readonly string[]).map((v) => ({ value: v, n: 0, avg: null, days_since: null, used_7d: 0 }))).map((d) => {
    const shrunk = ((d.avg ?? overall) * d.n + overall * PRIOR_N) / (d.n + PRIOR_N);
    // 한 번도 안 쓴 값은 '중간 새로움'(0.5) + 미검증 감점 → 탐색은 실험 슬롯에서. 검증된 고득점 값이 쉬었다 돌아오는 것을 우선
    const novelty = d.days_since == null ? 0.5 : Math.min(1, d.days_since / (cd * 2));
    const perf = (shrunk - 1) / 4;
    return { ...d, shrunk: Math.round(shrunk * 100) / 100, novelty: Math.round(novelty * 100) / 100, util: Math.round(((1 - ns) * perf + ns * novelty - (d.n === 0 ? 0.08 : 0)) * 1000) / 1000, explore: d.n < 2 };
  }).sort((a, b) => b.util - a.util)]));
}
export type CandTable = ReturnType<typeof candidateTable>;

const daysBetween = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 864e5);
const addDays = (d: string, n: number) => new Date(+new Date(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** 규칙 위반 사유 (없으면 null). history = 시간순(오래된 → 최신) */
export function ruleBreak(dim: DimKey, value: string, date: string, history: { date: string; attrs: Record<string, any> }[], o: Opts) {
  const cd = Math.max(1, Number(o.cooldown_days ?? 3));
  const prev = history[history.length - 1];
  if (dim === 'topic_category' && prev?.attrs.topic_category === value) return '같은 주제 분류 연속';
  if (dim === 'angle') { const last = [...history].reverse().find((h) => h.attrs.angle === value); if (last && daysBetween(last.date, date) < cd) return `각도 쿨다운 ${cd}일`; }
  if (dim === 'hook_type') { const l2 = history.slice(-2); if (l2.length === 2 && l2.every((h) => h.attrs.hook_type === value)) return '같은 훅 3연속'; }
  if (dim === 'format' && prev?.attrs.format === value) return '같은 구성 연속';
  return null;
}

export function greedyLineup(table: CandTable, recent: SeqItem[], startDate: string, days: number, o: Opts, fixed: Record<string, Partial<Slot>> = {}) {
  const ex = Number(o.explore_rate ?? 0.2);
  const nExp = ex > 0 ? Math.max(1, Math.round(days * ex)) : 0;
  const expDays = new Set(Array.from({ length: nExp }, (_, i) => Math.min(days - 1, Math.floor(((i + 1) * days) / (nExp + 1)))));
  const history = recent.map((r) => ({ date: String(r.at).slice(0, 10), attrs: r.attrs || {} })).sort((a, b) => a.date.localeCompare(b.date));
  const ns = Math.min(1, Math.max(0, Number(o.novelty_strength ?? 0.35)));
  const cd = Math.max(1, Number(o.cooldown_days ?? 3));
  const local = Object.fromEntries(DIM_KEYS.map((k) => [k, table[k].map((x) => ({ ...x, uses: 0 }))]));
  // 매일 다시 계산: 성과 + 새로움(경과일) − 이번 주 편성 안에서 이미 쓴 횟수 (새로움 강도와 무관하게 항상 다양성 유지)
  const rescore = () => { for (const k of DIM_KEYS) for (const c of local[k]) {
    c.novelty = c.days_since == null ? 0.5 : Math.round(Math.min(1, c.days_since / (cd * 2)) * 100) / 100;
    c.util = Math.round((((1 - ns) * (c.shrunk - 1)) / 4 + ns * c.novelty - (c.n === 0 ? 0.08 : 0) - 0.12 * c.uses) * 1000) / 1000;
  } };
  const slots: Slot[] = [];
  for (let i = 0; i < days; i++) {
    rescore();
    const date = addDays(startDate, i);
    const fx = fixed[date];
    const isExp = !fx && expDays.has(i);
    const pick: Record<string, string> = {};
    const notes: string[] = [];
    for (const k of DIM_KEYS) {
      if (fx && (fx as any)[k]) { pick[k] = (fx as any)[k]; continue; }
      let pool = local[k].filter((c) => !ruleBreak(k, c.value, date, history, o));
      // 같은 주(편성 안)에서 주제 분류 + 각도 조합 반복 금지
      if (k === 'angle') { const used = new Set(slots.filter((x) => x.topic_category === pick.topic_category).map((x) => x.angle)); const p2 = pool.filter((c) => !used.has(c.value)); if (p2.length) pool = p2; }
      if (!pool.length) pool = local[k];
      // 실험 슬롯: 각도·구성·훅 중 근거가 적은 값을 우선
      const expPool = isExp && ['angle', 'format', 'hook_type'].includes(k) ? pool.filter((c) => c.explore) : [];
      const choice = (expPool.length ? expPool : pool).slice().sort((a, b) => b.util - a.util)[0];
      pick[k] = choice.value;
      if (k === 'angle' || k === 'topic_category') notes.push(`${DIMENSIONS[k].label} '${choice.value}' ${choice.n ? `평균 ★${choice.avg}(n=${choice.n})` : '아직 데이터 없음'}${choice.days_since == null ? ' · 처음' : ` · ${choice.days_since}일 만`}`);
    }
    const chosen = DIM_KEYS.map((k) => local[k].find((c) => c.value === pick[k])!).filter(Boolean);
    const expected = Math.round((chosen.reduce((a, c) => a + c.shrunk, 0) / Math.max(1, chosen.length)) * 10) / 10;
    const novelty = Math.round((chosen.reduce((a, c) => a + c.novelty, 0) / Math.max(1, chosen.length)) * 100) / 100;
    slots.push({
      date, order: i + 1, topic_category: pick.topic_category, angle: pick.angle, hook_type: pick.hook_type, format: pick.format, target: pick.target,
      expected, novelty, experiment: isExp, reason: (isExp ? '실험 슬롯 — 검증 안 된 조합 시도 · ' : '') + notes.join(' · '),
      ...(fx ? { locked: !!fx.locked, content_id: fx.content_id ?? null, title_idea: fx.title_idea, hook_example: fx.hook_example, flow_note: fx.flow_note, reason: fx.reason || '고정 슬롯', expected: fx.expected ?? expected, experiment: !!fx.experiment } : {}),
    });
    history.push({ date, attrs: pick });
    for (const k of DIM_KEYS) for (const c of local[k]) {
      if (c.value === pick[k]) { c.days_since = 0; c.uses += 1; }
      else if (c.days_since != null) c.days_since += 1;
    }
  }
  return slots;
}

/** 편성 검사: 최근 흐름 + 편성 순서로 규칙 위반을 찾는다 */
export function validateLineup(slots: Partial<Slot>[], recent: SeqItem[], o: Opts) {
  const warns: { index: number; msg: string }[] = [];
  const history = recent.map((r) => ({ date: String(r.at).slice(0, 10), attrs: r.attrs || {} })).sort((a, b) => a.date.localeCompare(b.date));
  slots.forEach((s, i) => {
    for (const k of DIM_KEYS) {
      const v = (s as any)[k];
      if (!v) { warns.push({ index: i, msg: `${DIMENSIONS[k].label} 비어 있음` }); continue; }
      if (!(DIMENSIONS[k].values as readonly string[]).includes(v)) warns.push({ index: i, msg: `${DIMENSIONS[k].label} '${v}' 은 분류 목록에 없음` });
      const br = ruleBreak(k, v, s.date!, history, o);
      if (br) warns.push({ index: i, msg: `${br} (${DIMENSIONS[k].label}: ${v})` });
    }
    history.push({ date: s.date!, attrs: s as any });
  });
  const combos = new Map<string, number>();
  slots.forEach((s, i) => { const key = `${s.topic_category}|${s.angle}`; if (combos.has(key)) warns.push({ index: i, msg: `${combos.get(key)! + 1}번과 같은 주제 분류·각도 조합 (${s.topic_category} · ${s.angle})` }); else combos.set(key, i); });
  if (Number(o.explore_rate ?? 0.2) > 0 && slots.length >= 5 && !slots.some((s) => s.experiment)) warns.push({ index: -1, msg: '실험 슬롯이 없음' });
  return warns;
}
