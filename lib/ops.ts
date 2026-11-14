import { sbAdmin } from './supabase/server';
import { STEP_DEFS, STEP_KEYS } from './steps';

/** 현황판: 최근 콘텐츠 + 단계 상태 */
export async function board(limit = 60) {
  const db = sbAdmin();
  const { data: contents } = await db.from('contents')
    .select('id, slug, topic, status, current_step, error, video_url, thumbnail_url, youtube_id, instagram_id, created_at, updated_at, published_at')
    .order('created_at', { ascending: false }).limit(limit);
  const ids = (contents || []).map((c: any) => c.id);
  const { data: steps } = ids.length
    ? await db.from('steps').select('content_id, step, state, attempts, decided_by, finished_at, updated_at').in('content_id', ids)
    : { data: [] as any[] };
  return (contents || []).map((c: any) => ({
    ...c,
    steps: Object.fromEntries((steps || []).filter((s: any) => s.content_id === c.id).map((s: any) => [s.step, s])),
  }));
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** 작업 효율 지표 (기본 최근 30일) */
export async function metrics(days = 30) {
  const db = sbAdmin();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data: contents } = await db.from('contents').select('id, slug, topic, created_at, published_at, current_step').gte('created_at', since).order('created_at', { ascending: false });
  const list = contents || [];
  const ids = list.map((c: any) => c.id);
  const slugs = list.map((c: any) => c.slug);
  const [{ data: steps }, { data: leads }, { data: events }] = await Promise.all([
    ids.length ? db.from('steps').select('*').in('content_id', ids) : Promise.resolve({ data: [] as any[] }),
    slugs.length ? db.from('leads').select('content_slug').in('content_slug', slugs) : Promise.resolve({ data: [] as any[] }),
    slugs.length ? db.from('events').select('content_slug, type').in('content_slug', slugs).limit(50000) : Promise.resolve({ data: [] as any[] }),
  ]);
  const rows = steps || [];

  const perStep = STEP_DEFS.map((d) => {
    const r = rows.filter((x: any) => x.step === d.key && (x.attempts > 0 || Number(x.cost_usd) > 0));
    const decided = r.filter((x: any) => x.state === 'approved');
    const tin = r.reduce((n: number, x: any) => n + Number(x.input_tokens), 0);
    const tout = r.reduce((n: number, x: any) => n + Number(x.output_tokens), 0);
    return {
      step: d.key, no: d.no, label: d.label, runs: r.length,
      avg_work_s: Math.round(avg(r.map((x: any) => Number(x.work_ms))) / 1000),
      avg_wait_min: Math.round(avg(decided.map((x: any) => Number(x.wait_ms))) / 6000) / 10,
      avg_attempts: Math.round(avg(r.map((x: any) => x.attempts)) * 100) / 100,
      first_pass_rate: r.length ? Math.round((r.filter((x: any) => x.attempts === 1 && x.state === 'approved').length / r.length) * 100) : null,
      by: { human: decided.filter((x: any) => x.decided_by === 'human').length, ai: decided.filter((x: any) => x.decided_by === 'ai').length, auto: decided.filter((x: any) => x.decided_by === 'auto').length },
      waiting: rows.filter((x: any) => x.step === d.key && x.state === 'review').length,
      failed: rows.filter((x: any) => x.step === d.key && x.state === 'failed').length,
      tokens_in: tin, tokens_out: tout,
      // 사용 기록부(usage_log) 기준 실제 누적 비용 — 후보·채점·검수·TTS·렌더·업로드 포함
      cost_usd: Math.round(r.reduce((n: number, x: any) => n + Number(x.cost_usd || 0), 0) * 1000) / 1000,
    };
  });

  const published = list.filter((c: any) => c.published_at);
  const views = (events || []).filter((e: any) => e.type === 'view');
  const perContent = list.slice(0, 30).map((c: any) => {
    const r = rows.filter((x: any) => x.content_id === c.id);
    const v = views.filter((e: any) => e.content_slug === c.slug).length;
    const l = (leads || []).filter((x: any) => x.content_slug === c.slug).length;
    return {
      id: c.id, slug: c.slug, topic: c.topic, current_step: c.current_step, published: !!c.published_at,
      lead_time_h: c.published_at ? Math.round(((+new Date(c.published_at) - +new Date(c.created_at)) / 36e5) * 10) / 10 : null,
      work_min: Math.round(r.reduce((n: number, x: any) => n + Number(x.work_ms), 0) / 6000) / 10,
      wait_min: Math.round(r.reduce((n: number, x: any) => n + Number(x.wait_ms), 0) / 6000) / 10,
      reworks: r.reduce((n: number, x: any) => n + Math.max(0, x.attempts - 1), 0),
      views: v, leads: l, cvr: v ? Math.round((l / v) * 1000) / 10 : null,
    };
  });

  const bottleneck = [...perStep].filter((x) => x.runs).sort((a, b) => (b.avg_work_s + b.avg_wait_min * 60) - (a.avg_work_s + a.avg_wait_min * 60))[0] || null;
  const rework = [...perStep].filter((x) => x.runs).sort((a, b) => b.avg_attempts - a.avg_attempts)[0] || null;

  return {
    days,
    totals: {
      created: list.length, published: published.length,
      in_review: rows.filter((x: any) => x.state === 'review').length,
      avg_lead_time_h: Math.round(avg(published.map((c: any) => (+new Date(c.published_at) - +new Date(c.created_at)) / 36e5)) * 10) / 10,
      views: views.length, leads: (leads || []).length,
      cvr: views.length ? Math.round(((leads || []).length / views.length) * 1000) / 10 : null,
      cost_usd: Math.round(perStep.reduce((n, x) => n + x.cost_usd, 0) * 100) / 100,
      ai_decided_rate: (() => {
        const d = rows.filter((x: any) => x.state === 'approved' && STEP_KEYS.includes(x.step));
        return d.length ? Math.round((d.filter((x: any) => x.decided_by !== 'human').length / d.length) * 100) : null;
      })(),
    },
    bottleneck: bottleneck && { step: bottleneck.step, label: bottleneck.label },
    most_rework: rework && rework.avg_attempts > 1 ? { step: rework.step, label: rework.label, avg_attempts: rework.avg_attempts } : null,
    byProvider: (() => {
      const m: Record<string, number> = {};
      for (const x of rows) if (x.provider) { const k = String(x.provider).startsWith('agent:') ? x.provider : x.provider; m[k] = (m[k] || 0) + 1; }
      return m;
    })(),
    perStep, perContent,
  };
}
