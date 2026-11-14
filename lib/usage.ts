/**
 * API 사용 기록부 (usage_log) — 모든 AI 호출·검색·TTS·렌더·업로드를 한 줄씩 남김.
 * 단가는 settings.value.prices (관리자 [API 사용량 → 단가표]) > lib/prices.ts 기본값.
 */
import { sbAdmin } from './supabase/server';
import { costOf, type PriceTable, type UsageIn } from './prices';

export type UsageCtx = { contentId?: string | null; step?: string | null; task?: string | null; refTable?: string | null; refId?: string | null; by?: string | null };
export type UsageRow = UsageIn & {
  kind?: string; effort?: string | null; unit?: string | null;
  ok?: boolean; error?: string | null; ms?: number | null; attempt?: number | null;
  step?: string | null; task?: string | null; // 행마다 덮어쓸 때
};

let pc: { at: number; v: PriceTable | null } = { at: 0, v: null };
export async function priceTable(force = false): Promise<PriceTable | null> {
  if (!force && Date.now() - pc.at < 60_000) return pc.v;
  try {
    const { data } = await sbAdmin().from('settings').select('value').eq('id', 1).single();
    pc = { at: Date.now(), v: (data?.value as any)?.prices || null };
  } catch { pc = { at: Date.now(), v: null }; }
  return pc.v;
}
export const clearPriceCache = () => { pc = { at: 0, v: null }; };

/** 기록 + 비용 계산. 실패해도 본 작업을 막지 않음 */
export async function logUsage(rows: UsageRow[], ctx: UsageCtx = {}): Promise<{ cost: number; priced: boolean; rows: any[]; ids: number[] }> {
  const table = await priceTable();
  const out = rows.map((r) => {
    const c = costOf(table, r);
    return {
      content_id: ctx.contentId || null, step: r.step ?? ctx.step ?? null, task: r.task ?? ctx.task ?? null,
      kind: r.kind || 'llm', platform: r.platform, model: r.model ? String(r.model).split(' · ')[0] : null, effort: r.effort || null,
      input_tokens: r.input_tokens || 0, output_tokens: r.output_tokens || 0,
      cache_read_tokens: r.cache_read_tokens || 0, cache_write_tokens: r.cache_write_tokens || 0,
      searches: r.searches || 0, units: r.units || 0, unit: r.unit || null,
      cost_usd: c.usd, priced: c.priced, ok: r.ok !== false, error: r.error ? String(r.error).slice(0, 300) : null,
      ms: r.ms ?? null, attempt: r.attempt ?? null, ref_table: ctx.refTable || null, ref_id: ctx.refId || null, by: ctx.by || null,
    };
  });
  let ids: number[] = [];
  if (out.length) {
    try { const { data } = await sbAdmin().from('usage_log').insert(out).select('id'); ids = (data || []).map((x: any) => x.id); } catch (e) { console.warn('usage_log 기록 실패', e); }
  }
  return { cost: out.reduce((n, x) => n + x.cost_usd, 0), priced: out.every((x) => x.priced), rows: out, ids };
}

/** 산출물이 저장된 뒤 그 행 번호로 사용 기록을 연결 (SOP 제안 #12, 편성표 #3 …) */
export async function linkUsage(ids: number[] | undefined, refTable: string, refId: string | number) {
  if (!ids?.length) return;
  try { await sbAdmin().from('usage_log').update({ ref_table: refTable, ref_id: String(refId) }).in('id', ids); } catch { /* 무시 */ }
}

export { sumUsage } from './usage-sum';
