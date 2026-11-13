import { sbAdmin } from './supabase/server';
import { stepDef, type StepKey } from './steps';
import { tagStats, tierOf } from './tags';
import { sopHash } from './sop';

/** 단계의 "지금까지의 학습" 원자료 — SOP 정리·제안·학습 노트·데이터셋이 모두 이것을 쓴다 */
export async function learningData(step: StepKey) {
  const db = sbAdmin();
  const [{ data: ex }, { data: props }, { data: vers }, { data: rej }] = await Promise.all([
    db.from('exemplars').select('id, content_id, kind, score, tags, features, note, topic, sop_hash, provider, used_in, created_at').eq('step', step).order('created_at', { ascending: true }).limit(2000),
    db.from('sop_proposals').select('id, kind, status, summary, changes, applied_changes, changelog, decided_by, decided_note, created_at, decided_at').eq('step', step).order('created_at', { ascending: true }).limit(200),
    db.from('sop_versions').select('content, note, created_at').eq('step', step).order('created_at', { ascending: true }).limit(200),
    db.from('steps').select('decision_note, updated_at').eq('step', step).eq('state', 'rejected').not('decision_note', 'is', null).order('updated_at', { ascending: false }).limit(20),
  ]);
  const items = ex || [];
  const rated = items.filter((e: any) => e.score != null);
  const versions = (vers || []).map((v: any) => ({ hash: sopHash(v.content), since: v.created_at, note: v.note }));
  const firstSeen = new Map<string, string>();
  for (const v of versions) if (!firstSeen.has(v.hash)) firstSeen.set(v.hash, v.since);

  const bySop = new Map<string, number[]>();
  for (const e of rated) { const h = e.sop_hash || e.features?.sop || '-'; (bySop.get(h) || bySop.set(h, []).get(h)!).push(e.score); }
  const sopTrend = [...bySop.entries()].map(([hash, v]) => ({ hash, since: firstSeen.get(hash) || null, n: v.length, avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 }))
    .sort((a, b) => String(a.since || '9').localeCompare(String(b.since || '9')));

  const byProvider = new Map<string, number[]>();
  for (const e of rated) { const p = e.provider || e.features?.provider || '-'; (byProvider.get(p) || byProvider.set(p, []).get(p)!).push(e.score); }

  const dist = [5, 4, 3, 2, 1].map((s) => ({ score: s, n: rated.filter((e: any) => e.score === s).length }));
  const stats = tagStats(rated);
  return {
    step, label: stepDef(step).label, no: stepDef(step).no,
    counts: { total: items.length, rated: rated.length, edits: items.filter((e: any) => e.kind === 'edit').length, unused: items.filter((e: any) => !e.used_in).length },
    avg: stats.overall, dist,
    byProvider: [...byProvider.entries()].map(([p, v]) => ({ provider: p, n: v.length, avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 })),
    sopTrend,
    lift: stats.rows,
    top: rated.filter((e: any) => e.score >= 4 && e.note).sort((a: any, b: any) => b.score - a.score || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 12)
      .map((e: any) => ({ id: e.id, score: e.score, tier: tierOf(e.score), note: e.note, tags: e.tags, topic: e.topic })),
    low: rated.filter((e: any) => e.score <= 2 && e.note).slice(-10).map((e: any) => ({ id: e.id, score: e.score, note: e.note, tags: e.tags })),
    edits: items.filter((e: any) => e.kind === 'edit' && e.note).slice(-8).map((e: any) => ({ id: e.id, note: e.note })),
    applied: (props || []).filter((p: any) => p.status === 'applied').map((p: any) => ({
      id: p.id, kind: p.kind, at: p.decided_at, by: p.decided_by, summary: p.summary,
      changes: p.kind === 'rewrite' ? (p.changelog || []) : (p.changes || []).filter((_: any, i: number) => (p.applied_changes || []).includes(i)),
    })),
    rejected: (props || []).filter((p: any) => p.status === 'rejected').map((p: any) => ({ id: p.id, kind: p.kind, summary: p.summary, note: p.decided_note })),
    rejectNotes: (rej || []).map((r: any) => r.decision_note),
    versions: versions.slice(-10),
  };
}

export type LearningData = Awaited<ReturnType<typeof learningData>>;
