/** 워커 쪽 API 사용 기록 (AI 목소리·음성 인식·렌더 시간·업로드·채널 통계) — 단가는 사이트와 같은 lib/prices.ts */
import { db } from './env.js';
import { costOf, type PriceTable, type UsageIn } from '../../lib/prices.js';

let table: PriceTable | null | undefined;
async function prices() {
  if (table !== undefined) return table;
  const { data } = await db.from('settings').select('value').eq('id', 1).single();
  table = (data?.value as any)?.prices || null;
  return table;
}

export type WRow = UsageIn & { kind: string; unit?: string; ok?: boolean; error?: string | null; ms?: number | null };
export type WCtx = { contentId?: string | null; step?: string | null; task?: string | null; refTable?: string | null; refId?: string | null };

export async function logUsage(rows: WRow[], ctx: WCtx = {}) {
  if (!rows.length) return 0;
  try {
    const t = await prices();
    const out = rows.map((r) => {
      const c = costOf(t, r);
      return {
        content_id: ctx.contentId || null, step: ctx.step || null, task: ctx.task || null, kind: r.kind, platform: r.platform, model: r.model || null,
        input_tokens: r.input_tokens || 0, output_tokens: r.output_tokens || 0, searches: r.searches || 0,
        units: Math.round((r.units || 0) * 1000) / 1000, unit: r.unit || null, cost_usd: c.usd, priced: c.priced,
        ok: r.ok !== false, error: r.error || null, ms: r.ms ?? null, ref_table: ctx.refTable || null, ref_id: ctx.refId || null,
        by: process.env.GITHUB_ACTIONS ? 'worker:github' : 'worker:local',
      };
    });
    await db.from('usage_log').insert(out);
    return out.reduce((n, x) => n + x.cost_usd, 0);
  } catch (e: any) { console.warn('usage_log 기록 실패', e.message); return 0; }
}

/** API 호출 횟수 세기 (유튜브 쿼터·인스타 호출) */
export const counter = () => {
  const m: Record<string, number> = {};
  return { add: (k: string, n = 1) => { m[k] = (m[k] || 0) + n; }, get: () => ({ ...m }) };
};
/** YouTube Data API 쿼터 단가 (공식 문서 기준 대략값) */
export const YT_QUOTA: Record<string, number> = { 'videos.insert': 1600, 'commentThreads.insert': 50, 'channels.list': 1, 'playlistItems.list': 1, 'videos.list': 1, 'commentThreads.list': 1, 'analytics.query': 1 };
