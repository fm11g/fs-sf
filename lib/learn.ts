import { ask } from './llm';
import { getSop, saveSop } from './sop';
import { getOutput, getSettings } from './settings';
import { sbAdmin } from './supabase/server';
import { AI_STEPS, stepDef, type StepKey } from './steps';
import { applyChanges, isSafeAuto, sanitizeChanges, type SopChange } from './sop-merge';
import { notify } from './notify';

/**
 * 좋은 결과물 → SOP 보완
 *  1) 운영자가 👍(좋은 예)·👎(아쉬운 예)로 고른 산출물, 사람이 고친 뒤 승인한 차이(수정 예)를 exemplars 에 스냅샷
 *  2) 미반영 좋은/수정 예가 learn_min 개 쌓이면 AI 가 "기존 SOP 대비 add / modify / remove" 제안을 만든다
 *  3) 운영자가 변경별로 골라·고쳐 반영하거나(propose), 안전한 변경만 자동 반영(auto). 반영은 SOP 이력에 남고 되돌릴 수 있다
 */

const clip = (v: any, n: number) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function markExemplar(step: StepKey, contentId: string, kind: 'good' | 'bad', note = '', source = 'human') {
  if (stepDef(step)?.kind !== 'ai') throw new Error('AI 단계 산출물만 좋은 예로 저장할 수 있습니다 (영상은 대사·디자인 단계에서 표시)');
  const db = sbAdmin();
  const { data: c } = await db.from('contents').select('*').eq('id', contentId).single();
  if (!c) throw new Error('콘텐츠를 찾을 수 없습니다');
  const output = await getOutput(step, c);
  if (output == null) throw new Error('산출물이 없습니다');
  const { data, error } = await db.from('exemplars')
    .insert({ content_id: contentId, step, kind, note: note || null, output, topic: c.topic, source })
    .select().single();
  if (error) throw new Error(error.message);
  return { exemplar: data, ...(await learnCounts(step)) };
}

/** 사람이 산출물을 고친 뒤 승인했을 때 (AI 원본 ≠ 최종본) 자동으로 '수정 예' 저장 */
export async function recordEditExemplar(step: StepKey, contentId: string, aiOutput: any, note?: string) {
  const s = await getSettings();
  if (!s.learn_from_edits || aiOutput == null) return false;
  const db = sbAdmin();
  const { data: c } = await db.from('contents').select('*').eq('id', contentId).single();
  if (!c) return false;
  const finalOut = await getOutput(step, c);
  if (finalOut == null || same(finalOut, aiOutput)) return false;
  await db.from('exemplars').insert({ content_id: contentId, step, kind: 'edit', note: note || '사람이 고친 뒤 승인', output: finalOut, before: aiOutput, topic: c.topic, source: 'edit' });
  return true;
}

export async function learnCounts(step: StepKey) {
  const s = await getSettings();
  const db = sbAdmin();
  const [{ data: ex }, { count: pending }] = await Promise.all([
    db.from('exemplars').select('kind, used_in').eq('step', step),
    db.from('sop_proposals').select('id', { count: 'exact', head: true }).eq('step', step).eq('status', 'pending'),
  ]);
  const rows = ex || [];
  const unused = rows.filter((r: any) => !r.used_in);
  const signal = unused.filter((r: any) => r.kind !== 'bad').length;
  const min = Math.max(1, Number(s.learn_min || 3));
  return {
    counts: { good: rows.filter((r: any) => r.kind === 'good').length, edit: rows.filter((r: any) => r.kind === 'edit').length, bad: rows.filter((r: any) => r.kind === 'bad').length, unused_signal: signal },
    pending_proposals: pending || 0,
    learn_min: min,
    mode: s.learn_mode || 'propose',
    should_propose: s.learn_mode !== 'off' && signal >= min && !pending,
  };
}

function prompt(step: StepKey, sopMd: string, ex: any[], rejects: any[], banned: string[]) {
  const label = stepDef(step).label;
  const show = (e: any) => {
    const head = `### 예시 #${e.id} [${e.kind === 'good' ? '좋은 예' : e.kind === 'edit' ? '사람이 고친 예' : '아쉬운 예'}] 주제: ${e.topic || '-'}${e.note ? `\n운영자 메모: ${e.note}` : ''}`;
    if (e.kind === 'edit') return `${head}\nAI 원본: ${clip(e.before, 1500)}\n사람 최종본: ${clip(e.output, 1500)}`;
    return `${head}\n산출물: ${clip(e.output, 2200)}`;
  };
  return {
    system: `당신은 '오늘의 정책자금' 숏폼 공장의 SOP 편집자입니다. '${label}' 단계의 SOP(AI 작업 지침 md)를 운영자가 고른 좋은 결과물에 맞게 보완합니다.

원칙
- 기존 SOP 를 유지합니다. 통째로 다시 쓰지 않고, 필요한 줄만 추가(add)·수정(modify)·삭제(remove)합니다.
- 좋은 예(그리고 사람이 고친 예의 '최종본')에 공통으로 나타나는데 SOP 에 없거나 다르게 적힌 패턴만 반영합니다. 아쉬운 예·반려 사유는 피해야 할 것의 근거입니다.
- 변경마다 근거 예시 번호를 2개 이상 답니다. 근거가 1개뿐이면 운영자 메모가 명시적일 때만 제안합니다.
- 비슷한 줄이 이미 있으면 add 대신 modify 로 그 줄을 다듬습니다. 이미 SOP 에 있는 내용은 제안하지 않습니다.
- modify / remove 의 target 은 현재 SOP 의 줄을 글자 그대로 복사합니다.
- 한 줄 = 한 지시, 구체적으로 (예: "숫자 훅은 '최대 ○억'처럼 단위까지 첫 문장에"). 추상적인 말("더 매력적으로") 금지.
- 사실 정확성·출처·금지 표현·승인 보장 금지 규칙은 절대 느슨하게 만들지 않습니다. JSON 형식·글자수 상한 같은 기계 규칙은 쓰지 않습니다(코드에 고정).
- 변경은 최대 6개. 바꿀 근거가 부족하면 changes 를 비워도 됩니다.`,
    prompt: `## 현재 SOP
${sopMd}

## 운영자가 고른 예시
${ex.map(show).join('\n\n')}

## 최근 반려 사유 (피해야 할 것)
${rejects.length ? rejects.map((r) => `- ${r}`).join('\n') : '없음'}

금지 표현(절대 넣지 말 것): ${banned.join(', ')}

JSON 스키마:
{
  "summary": "운영자에게 보여줄 2~3문장 요약 (무엇을 배웠고 무엇을 바꾸는지)",
  "patterns": [{ "pattern": "좋은 예들에서 찾은 공통점", "evidence": [예시번호], "in_sop": "already | missing | different" }],
  "changes": [{ "op": "add | modify | remove", "section": "목적 | 집중 포인트 | 체크리스트 | 금지 | 사람이 결정할 것", "target": "modify/remove 일 때 현재 SOP 줄 그대로", "text": "add/modify 일 때 새 줄 (목록 기호 '- ' 없이)", "reason": "왜", "evidence": [예시번호] }]
}`,
  };
}

/** SOP 학습 제안 생성 (learn_mode=auto 면 안전한 변경을 즉시 반영) */
export async function proposeSop(step: StepKey, opts: { force?: boolean } = {}) {
  if (!AI_STEPS.includes(step)) throw new Error('AI 단계만 학습할 수 있습니다');
  const s = await getSettings();
  const db = sbAdmin();
  const { data: pend } = await db.from('sop_proposals').select('id').eq('step', step).eq('status', 'pending').limit(1);
  if (pend?.length && !opts.force) throw new Error(`이미 검토 대기 중인 제안이 있습니다 (#${pend[0].id})`);

  const { data: exAll } = await db.from('exemplars').select('*').eq('step', step).order('created_at', { ascending: false }).limit(40);
  const unused = (exAll || []).filter((e: any) => !e.used_in);
  const signal = unused.filter((e: any) => e.kind !== 'bad').slice(0, 6);
  if (!signal.length) throw new Error('아직 반영하지 않은 좋은 예/수정 예가 없습니다');
  const bad = unused.filter((e: any) => e.kind === 'bad').slice(0, 2);
  const examples = [...signal, ...bad];

  const { data: rej } = await db.from('steps').select('decision_note').eq('step', step).eq('state', 'rejected').not('decision_note', 'is', null).order('updated_at', { ascending: false }).limit(5);
  const sop = await getSop(step);
  const res = await ask<any>({ ...prompt(step, sop.content, examples, (rej || []).map((r: any) => r.decision_note), s.banned_phrases || []), maxTokens: 4000, chain: s.llm_chain });

  const changes = sanitizeChanges(res.data.changes, s.banned_phrases || []);
  if (opts.force && pend?.length) await db.from('sop_proposals').update({ status: 'superseded', decided_at: new Date().toISOString() }).eq('step', step).eq('status', 'pending');
  const { data: row, error } = await db.from('sop_proposals').insert({
    step, base_content: sop.content, changes, patterns: res.data.patterns || [], summary: res.data.summary || '',
    exemplar_ids: examples.map((e: any) => e.id), provider: `${res.provider}/${res.model}`,
  }).select().single();
  if (error) throw new Error(error.message);
  // 학습에 쓴 예시는 '반영됨' 처리 (제안을 거절해도 같은 예시로 반복 제안하지 않도록)
  await db.from('exemplars').update({ used_in: row.id }).in('id', examples.map((e: any) => e.id));

  if (s.learn_mode === 'auto' && changes.length) {
    const safe = changes.map((c, i) => (isSafeAuto(c) ? i : -1)).filter((i) => i >= 0);
    if (safe.length) {
      const applied = await applyProposal(row.id, { selected: safe, by: 'auto', note: '자동 반영 (안전한 변경만)' });
      return { proposal: { ...row, status: 'applied' }, auto_applied: applied.applied };
    }
  }
  await notify('sop_proposal', { step, extra: { proposal: row } });
  return { proposal: row, auto_applied: [] };
}

/** 제안 반영: 변경별 선택·문구 수정·최종 md 직접 편집 모두 가능 */
export async function applyProposal(id: number, opts: { selected?: number[]; edits?: Record<number, string>; content?: string; note?: string; by?: 'human' | 'auto' } = {}) {
  const db = sbAdmin();
  const { data: p } = await db.from('sop_proposals').select('*').eq('id', id).single();
  if (!p) throw new Error('제안을 찾을 수 없습니다');
  if (p.status !== 'pending') throw new Error(`이미 처리된 제안입니다 (${p.status})`);
  const step = p.step as StepKey;
  const cur = await getSop(step);
  const changes: SopChange[] = p.changes || [];
  const merged = applyChanges(cur.content, changes, opts.selected, opts.edits || {});
  const content = opts.content?.trim() ? opts.content : merged.content;
  const applied = merged.results.filter((r) => r.ok).map((r) => r.i);
  if (content === cur.content) throw new Error('반영할 변경이 없습니다 (선택한 변경이 모두 충돌했거나 이미 반영됨)');

  await saveSop(step, { content }, `SOP 학습 제안 #${id} 반영 (${applied.length}건${opts.by === 'auto' ? ', 자동' : ''})${opts.note ? ' — ' + opts.note : ''}`);
  await db.from('sop_proposals').update({
    status: 'applied', applied_content: content, applied_changes: applied, decided_by: opts.by || 'human',
    decided_note: opts.note || null, decided_at: new Date().toISOString(),
  }).eq('id', id);
  await notify('sop_applied', { step, extra: { proposal: { ...p, applied_content: content }, applied, conflicts: merged.results.filter((r) => !r.ok), by: opts.by || 'human' } });
  return { step, applied, conflicts: merged.results.filter((r) => !r.ok), content };
}

export async function rejectProposal(id: number, note = '') {
  const db = sbAdmin();
  const { error } = await db.from('sop_proposals').update({ status: 'rejected', decided_by: 'human', decided_note: note || null, decided_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** 반영 되돌리기: 그 뒤로 SOP 가 바뀌지 않았을 때만 (바뀌었으면 SOP 변경 이력에서 직접 복원) */
export async function revertProposal(id: number) {
  const db = sbAdmin();
  const { data: p } = await db.from('sop_proposals').select('*').eq('id', id).single();
  if (!p || p.status !== 'applied') throw new Error('반영된 제안만 되돌릴 수 있습니다');
  const cur = await getSop(p.step);
  if (cur.content !== p.applied_content) throw new Error('반영 이후 SOP 가 다시 수정되었습니다. [SOP · AI 제어] → 변경 이력에서 원하는 버전을 불러오세요.');
  await saveSop(p.step, { content: p.base_content }, `SOP 학습 제안 #${id} 되돌림`);
  await db.from('sop_proposals').update({ status: 'rejected', decided_note: `${p.decided_note || ''} (되돌림)`.trim(), decided_at: new Date().toISOString() }).eq('id', id);
  return { ok: true };
}

/** 하루 1회(크론): 조건을 채운 단계마다 제안 생성 (최대 3개) */
export async function learnSweep() {
  const s = await getSettings();
  if (s.learn_mode === 'off') return [];
  const done: any[] = [];
  for (const step of AI_STEPS) {
    if (done.length >= 3) break;
    const lc = await learnCounts(step);
    if (!lc.should_propose) continue;
    try { const r = await proposeSop(step); done.push({ step, id: r.proposal.id, auto_applied: r.auto_applied }); }
    catch (e: any) { done.push({ step, error: e.message }); }
  }
  return done;
}
