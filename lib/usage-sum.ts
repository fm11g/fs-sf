/** 합계 (화면용) */
export function sumUsage(rows: any[]) {
  const t = { calls: 0, failed: 0, input: 0, output: 0, cache: 0, searches: 0, cost: 0, unpriced: 0, ms: 0, units: 0, unit: null as string | null };
  for (const r of rows) {
    t.calls++; if (r.ok === false) t.failed++;
    t.input += Number(r.input_tokens || 0); t.output += Number(r.output_tokens || 0);
    t.cache += Number(r.cache_read_tokens || 0) + Number(r.cache_write_tokens || 0);
    t.searches += Number(r.searches || 0); t.cost += Number(r.cost_usd || 0); t.ms += Number(r.ms || 0);
    if (r.priced === false) t.unpriced++;
    if (Number(r.units)) { if (t.unit === null || t.unit === r.unit) { t.unit = r.unit; t.units += Number(r.units); } else t.unit = '혼합'; }
  }
  t.cost = Math.round(t.cost * 1e6) / 1e6;
  return t;
}
