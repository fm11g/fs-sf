import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { can, canStep } from '@/lib/perms';
import { sumUsage } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/** 기록 없는 날도 0 으로 채워 일별 그래프 간격을 맞춤 */
function fillDays(days: any[], from: string | null, to: string | null) {
  const sorted = days.sort((a, b) => a.key.localeCompare(b.key));
  if (!from) return sorted;
  const m = new Map(sorted.map((d) => [d.key, d]));
  const end = to || new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  const out: any[] = [];
  for (let t = new Date(`${from}T00:00:00Z`); t.toISOString().slice(0, 10) <= end && out.length < 400; t = new Date(t.getTime() + 864e5)) {
    const k = t.toISOString().slice(0, 10);
    out.push(m.get(k) || { key: k, ...sumUsage([]) });
  }
  return out;
}

const COLS = 'id, at, content_id, step, task, kind, platform, model, effort, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, searches, units, unit, cost_usd, priced, ok, error, ms, attempt, ref_table, ref_id, by';

/**
 * 사용 기록 조회
 *  - ?content_id=…[&step=…]        한 콘텐츠(산출물)의 기록 — 볼 수 있는 단계만
 *  - ?ref_table=…&ref_id=…          SOP 제안·참고 영상·편성표 등
 *  - ?from=YYYY-MM-DD&to=…          기간 전체 (작업 효율 권한) · &format=csv 로 내려받기
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const contentId = q.get('content_id');
  const g = await guard(req, contentId ? 'board' : q.get('ref_table') ? 'board' : 'metrics');
  if (g.deny) return g.deny;
  const showCost = can(g.me, 'metrics');
  const db = sbAdmin();
  let sel = db.from('usage_log').select(COLS).order('at', { ascending: false });
  if (contentId) {
    sel = sel.eq('content_id', contentId);
    if (q.get('step')) sel = sel.eq('step', q.get('step')!);
  } else if (q.get('ref_table')) {
    sel = sel.eq('ref_table', q.get('ref_table')!);
    if (q.get('ref_id')) sel = sel.eq('ref_id', q.get('ref_id')!);
  } else {
    const from = q.get('from') || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    sel = sel.gte('at', `${from}T00:00:00+09:00`);
    if (q.get('to')) sel = sel.lte('at', `${q.get('to')}T23:59:59+09:00`);
    for (const k of ['platform', 'model', 'kind', 'task', 'step']) if (q.get(k)) sel = sel.eq(k, q.get(k)!);
  }
  const { data, error } = await sel.limit(Number(q.get('limit') || 5000));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 직원: 볼 수 없는 단계 기록은 빼고, 비용은 작업 효율 권한이 있을 때만
  let rows = (data || []).filter((r: any) => g.me.role !== 'staff' || !r.step || canStep(g.me, r.step));
  if (!showCost) rows = rows.map((r: any) => ({ ...r, cost_usd: null }));

  if (q.get('format') === 'csv') {
    const head = COLS.split(', ');
    const esc = (v: any) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = '﻿' + [head.join(','), ...rows.map((r: any) => head.map((h) => esc(r[h])).join(','))].join('\n');
    return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="api-usage-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }

  // 묶음 합계
  const group = (key: (r: any) => string) => {
    const m = new Map<string, any[]>();
    for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) || []), r]); }
    return [...m.entries()].map(([k, rs]) => ({ key: k, ...sumUsage(rs) })).sort((a, b) => b.cost - a.cost || b.calls - a.calls);
  };
  const byContent = contentId ? [] : group((r) => r.content_id || '-').slice(0, 50);
  let titles: Record<string, string> = {};
  if (byContent.length) {
    const ids = byContent.map((x) => x.key).filter((x) => x !== '-');
    const { data: cs } = ids.length ? await db.from('contents').select('id, topic, slug').in('id', ids) : { data: [] as any[] };
    titles = Object.fromEntries((cs || []).map((c: any) => [c.id, c.topic || c.slug]));
  }
  return NextResponse.json({
    show_cost: showCost,
    total: sumUsage(rows),
    by_platform_model: group((r) => `${r.platform}|${r.model || '-'}`),
    by_platform: group((r) => r.platform),
    by_kind: group((r) => r.kind),
    by_task: group((r) => r.task || r.step || '-'),
    by_step: group((r) => r.step || '-'),
    by_day: fillDays(group((r) => new Date(new Date(r.at).getTime() + 9 * 36e5).toISOString().slice(0, 10)), contentId || q.get('ref_table') ? null : q.get('from'), q.get('to')),
    by_content: byContent.map((x) => ({ ...x, title: titles[x.key] || (x.key === '-' ? '콘텐츠 밖 작업 (학습·분석·편성)' : x.key.slice(0, 8)) })),
    rows: rows.slice(0, Number(q.get('rows') || 300)),
  });
}
