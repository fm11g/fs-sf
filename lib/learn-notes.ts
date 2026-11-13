import type { LearningData } from './learn-data';

const OP: Record<string, string> = { add: '추가', modify: '수정', remove: '삭제', merge: '통합', reorder: '순서', keep: '유지' };
const d = (s?: string | null) => { if (!s) return '-'; const k = new Date(new Date(s).getTime() + 9 * 3600e3); return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`; };

/** 학습 노트 md (결정적 생성) — GitHub data/learnings/ 에 저장되고, SOP 제안·재정리 프롬프트에 그대로 들어간다 */
export function learningNotesMd(L: LearningData, maxLines = 40) {
  const out: string[] = [];
  out.push(`# ${L.no}. ${L.label} — 학습 노트`, '', `> 자동 생성 · 평가 ${L.counts.rated}건 · 수정 예 ${L.counts.edits}건 · 반영된 학습 ${L.applied.length}회`, '');
  out.push('## 점수 현황');
  out.push(`- 평균 ${L.avg ?? '-'}점 · ${L.dist.map((x) => `★${x.score} ${x.n}`).join(' · ')}`);
  if (L.byProvider.length) out.push(`- 제공자별: ${L.byProvider.map((p) => `${p.provider} ${p.avg}(n=${p.n})`).join(' · ')}`);
  out.push('');
  if (L.sopTrend.length) {
    out.push('## SOP 버전별 평균 점수', '| SOP 버전 | 사용 시작 | 평가 수 | 평균 |', '|---|---|---|---|');
    for (const v of L.sopTrend.slice(-8)) out.push(`| ${v.hash} | ${d(v.since)} | ${v.n} | ${v.avg} |`);
    out.push('');
  }
  const up = L.lift.filter((x) => x.lift > 0).slice(0, 8);
  const down = L.lift.filter((x) => x.lift < 0).slice(-8).reverse();
  if (up.length || down.length) {
    out.push('## 점수를 올린 조건 / 내린 조건 (평균 대비)');
    for (const x of up) out.push(`- ▲ ${x.tag}: 평균 ${x.avg} (${x.lift > 0 ? '+' : ''}${x.lift}, n=${x.n})`);
    for (const x of down) out.push(`- ▼ ${x.tag}: 평균 ${x.avg} (${x.lift}, n=${x.n})`);
    out.push('');
  }
  if (L.applied.length) {
    out.push('## 반영된 학습 (시간순)');
    for (const a of L.applied.slice(-maxLines)) {
      out.push(`- ${d(a.at)} #${a.id} ${a.kind === 'rewrite' ? '[전체 재정리]' : ''}${a.by === 'auto' ? '[자동]' : ''} ${a.summary || ''}`.replace(/\s+/g, ' ').trim());
      for (const c of (a.changes || []).slice(0, 6)) {
        out.push(`  - ${OP[c.op || c.type] || c.op || c.type || ''} ${c.section ? `${c.section}: ` : ''}${c.target ? `"${c.target}" → ` : ''}${c.text || c.detail || ''}`.trimEnd());
      }
    }
    out.push('');
  }
  if (L.rejected.length) {
    out.push('## 거절된 제안 (다시 제안하지 말 것)');
    for (const r of L.rejected.slice(-10)) out.push(`- #${r.id} ${r.summary || ''}${r.note ? ` — 거절 이유: ${r.note}` : ''}`);
    out.push('');
  }
  if (L.top.length) {
    out.push('## 높은 점수를 받은 이유 (운영자 메모)');
    for (const t of L.top) out.push(`- ★${t.score} #${t.id}${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}: ${t.note}`);
    out.push('');
  }
  if (L.low.length || L.rejectNotes.length || L.edits.length) {
    out.push('## 낮은 점수·반려·수정 이유 (피할 것)');
    for (const t of L.low) out.push(`- ★${t.score} #${t.id}: ${t.note}`);
    for (const n of L.rejectNotes.slice(0, 8)) out.push(`- 반려: ${n}`);
    for (const e of L.edits) out.push(`- 사람 수정 #${e.id}: ${e.note}`);
    out.push('');
  }
  return out.join('\n');
}
