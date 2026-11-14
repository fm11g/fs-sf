import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { DEFAULT_PRICES, costOf, type PriceTable } from '@/lib/prices';
import { clearPriceCache } from '@/lib/usage';

export const dynamic = 'force-dynamic';

const num = (v: any) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Math.max(0, Number(v)));

/** 단가표: 기본값 + 내가 고친 값 */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'metrics');
  if (g.deny) return g.deny;
  const { data } = await sbAdmin().from('settings').select('value').eq('id', 1).single();
  return NextResponse.json({ defaults: DEFAULT_PRICES, saved: data?.value?.prices || {} });
}

/** 저장 (대표) · recalc=true 면 기간 안 기록의 비용을 새 단가로 다시 계산 */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'settings');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  const db = sbAdmin();
  const { data: st } = await db.from('settings').select('value').eq('id', 1).single();
  let prices: PriceTable = st?.value?.prices || {};
  if (b.prices) {
    prices = {};
    for (const [k, p] of Object.entries<any>(b.prices)) {
      if (!/^[a-z]+:[\w.*-]{1,60}$/.test(k)) continue;
      const c = Object.fromEntries(Object.entries({ in: num(p.in), out: num(p.out), cache_read: num(p.cache_read), cache_write: num(p.cache_write), per_search: num(p.per_search), per_unit: num(p.per_unit), long_in: num(p.long_in), long_out: num(p.long_out), long_over: num(p.long_over), unit: p.unit || undefined, note: p.note || undefined }).filter(([, v]) => v !== undefined));
      if (Object.keys(c).length) prices[k] = c as any;
    }
    const { error } = await db.from('settings').update({ value: { ...(st?.value || {}), prices } }).eq('id', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    clearPriceCache();
  }
  let recalced = 0;
  if (b.recalc) {
    const from = b.from || new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const { data: rows } = await db.from('usage_log').select('id, platform, model, kind, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, searches, units, task').gte('at', from).limit(20000);
    const key: Record<string, string> = { tts: 'tts', stt: '', render: 'actions', upload: 'api', analytics: 'api', email: 'send' };
    for (const r of rows || []) {
      const c = costOf(prices, { ...r, price_key: key[r.kind] || r.model || undefined } as any);
      await db.from('usage_log').update({ cost_usd: c.usd, priced: c.priced }).eq('id', r.id);
      recalced++;
    }
    // 단계 누적 비용도 맞춤
    const { data: sums } = await db.from('usage_log').select('content_id, step, cost_usd').not('content_id', 'is', null).not('step', 'is', null);
    const m = new Map<string, number>();
    for (const r of sums || []) m.set(`${r.content_id}|${r.step}`, (m.get(`${r.content_id}|${r.step}`) || 0) + Number(r.cost_usd || 0));
    for (const [k, v] of m) { const [cid, step] = k.split('|'); await db.from('steps').update({ cost_usd: Math.round(v * 1e6) / 1e6 }).eq('content_id', cid).eq('step', step); }
  }
  return NextResponse.json({ ok: true, saved: prices, recalced });
}
