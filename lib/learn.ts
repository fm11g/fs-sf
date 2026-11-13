import { ask } from './llm';
import { getSop, saveSop, sopHash } from './sop';
import { getOutput, getSettings } from './settings';
import { sbAdmin } from './supabase/server';
import { AI_STEPS, stepDef, type StepKey } from './steps';
import { applyChanges, checkRewrite, isSafeAuto, sanitizeChanges, type SopChange } from './sop-merge';
import { features, kindOf, tagStats, tierOf } from './tags';
import { notify } from './notify';
import { exportNow, exportRating, exportSopChange } from './export';
import { learningData } from './learn-data';
import { learningNotesMd } from './learn-notes';

/**
 * 점수 기반 학습
 *  1) 평가: 결과물에 1~5점 + 내 태그 + 메모 → 자동 특징 태그·생성 당시 지시문과 함께 스냅샷 (GitHub·시트로 내보냄)
 *  2) 생성 최적화: 고득점 예시를 참고로 주입(fewShotBlock) · 후보 여러 개 중 예측 점수 최고 선택(judgeCandidates)
 *  3) SOP 최적화: 지금까지의 학습(학습 노트: 점수 추이·점수를 올린 조건·반영/거절 이력)을 읽고
 *     - 보완 제안(patch): 줄 단위 추가·수정·삭제
 *     - 전체 재정리(rewrite): 누적 학습으로 SOP 를 다시 정리 (구조·금지 항목 보존, 전후 비교 후 반영)
 */

const clip = (v: any, n: number) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isSignal = (e: any) => (e.score ?? 0) >= 4 || e.kind === 'edit';

async function snapshot(step: StepKey, contentId: string) {
  const db = sbAdmin();
  const [{ data: c }, { data: row }] = await Promise.all([
    db.from('contents').select('*').eq('id', contentId).single(),
    db.from('steps').select('*').eq('content_id', contentId).eq('step', step).maybeSingle(),
  ]);
  if (!c) throw new Error('콘텐츠를 찾을 수 없습니다');
  const output = await getOutput(step, c);
  return { c, row: row || {}, output };
}

// ── 1. 평가 ─────────────────────────────────────────────────────────
/** 1~5점 평가. 같은 산출물에 다시 매기면 갱신(등급 폴더도 이동) */
export async function rateOutput(step: StepKey, contentId: string, o: { score: number; tags?: string[]; note?: string; source?: string }) {
  if (stepDef(step)?.kind !== 'ai') throw new Error('AI 단계 산출물만 평가할 수 있습니다 (영상은 대사·디자인 단계에서 평가)');
  const score = Math.round(Number(o.score));
  if (!(score >= 1 && score <= 5)) throw new Error('점수는 1~5 입니다');
  const db = sbAdmin();
  const { c, row, output } = await snapshot(step, contentId);
  if (output == null) throw new Error('산출물이 없습니다');
  const tags = [...new Set((o.tags || []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
  const base = {
    score, kind: kindOf(score), tags, note: o.note || null, topic: c.topic, source: o.source || 'human',
    features: features(step, output, { c, row }), input: row.ai_input || null, sop_hash: row.sop_hash || null,
    provider: row.provider || null, model: row.model || null, updated_at: new Date().toISOString(),
  };
  // 같은 산출물에 대한 기존 평가(사람 수정 예 제외) → 갱신
  const { data: prev } = await db.from('exemplars').select('id, output, github_path, used_in').eq('content_id', contentId).eq('step', step).neq('kind', 'edit').neq('source', 'performance').order('id', { ascending: false }).limit(5);
  const hit = (prev || []).find((p: any) => same(p.output, output));
  let ex: any;
  if (hit) {
    const { data, error } = await db.from('exemplars').update({ ...base, used_in: null }).eq('id', hit.id).select().single();
    if (error) throw new Error(error.message);
    ex = data;
    await exportNow(() => exportRating(ex.id, hit.github_path));
  } else {
    const { data, error } = await db.from('exemplars').insert({ ...base, content_id: contentId, step, output }).select().single();
    if (error) throw new Error(error.message);
    ex = data;
    await exportNow(() => exportRating(ex.id));
  }
  return { exemplar: ex, updated: !!hit, ...(await learnCounts(step)) };
}

/** 채널 성과 점수 → 평가 (source=performance, 콘텐츠·단계당 1건을 갱신). 사람 평가와 별도로 쌓인다 */
export async function recordPerformanceRating(step: StepKey, contentId: string, score: number, tags: string[], note: string) {
  const db = sbAdmin();
  const { c, row, output } = await snapshot(step, contentId);
  if (output == null) return null;
  const sc = Math.min(5, Math.max(1, Math.round(score)));
  const base = {
    score: sc, kind: kindOf(sc), tags, note, topic: c.topic, source: 'performance', features: features(step, output, { c, row }),
    input: row.ai_input || null, sop_hash: row.sop_hash || null, provider: row.provider || null, model: row.model || null, updated_at: new Date().toISOString(),
  };
  const { data: prev } = await db.from('exemplars').select('id, score, tags, github_path').eq('content_id', contentId).eq('step', step).eq('source', 'performance').maybeSingle();
  if (prev) {
    if (prev.score === sc && same(prev.tags, tags)) return prev.id;
    await db.from('exemplars').update({ ...base, ...(prev.score !== sc ? { used_in: null } : {}) }).eq('id', prev.id);
    await exportNow(() => exportRating(prev.id, prev.github_path));
    return prev.id;
  }
  const { data } = await db.from('exemplars').insert({ ...base, content_id: contentId, step, output }).select('id').single();
  if (data) await exportNow(() => exportRating(data.id));
  return data?.id ?? null;
}

/** 이전 버전 호환: 👍 = 4점, 👎 = 2점 */
export async function markExemplar(step: StepKey, contentId: string, kind: 'good' | 'bad', note = '', source = 'human') {
  return rateOutput(step, contentId, { score: kind === 'good' ? 4 : 2, note, source });
}

/** 사람이 고친 뒤 승인 (AI 원본 ≠ 최종본) → '수정 예' (선호 쌍 데이터) */
export async function recordEditExemplar(step: StepKey, contentId: string, aiOutput: any, note?: string) {
  const s = await getSettings();
  if (!s.learn_from_edits || aiOutput == null) return false;
  const { c, row, output } = await snapshot(step, contentId);
  if (output == null || same(output, aiOutput)) return false;
  const { data } = await sbAdmin().from('exemplars').insert({
    content_id: contentId, step, kind: 'edit', note: note || '사람이 고친 뒤 승인', output, before: aiOutput, topic: c.topic, source: 'edit',
    features: features(step, output, { c, row }), input: row.ai_input || null, sop_hash: row.sop_hash || null, provider: row.provider || null, model: row.model || null,
  }).select('id').single();
  if (data) await exportNow(() => exportRating(data.id));
  return true;
}

export async function learnCounts(step: StepKey) {
  const s = await getSettings();
  const db = sbAdmin();
  const [{ data: ex }, { count: pending }] = await Promise.all([
    db.from('exemplars').select('kind, score, used_in').eq('step', step),
    db.from('sop_proposals').select('id', { count: 'exact', head: true }).eq('step', step).eq('status', 'pending'),
  ]);
  const rows = ex || [];
  const rated = rows.filter((r: any) => r.score != null);
  const signal = rows.filter((r: any) => !r.used_in && isSignal(r)).length;
  const min = Math.max(1, Number(s.learn_min || 3));
  return {
    counts: {
      rated: rated.length, avg: rated.length ? Math.round((rated.reduce((a: number, r: any) => a + r.score, 0) / rated.length) * 100) / 100 : null,
      gold: rated.filter((r: any) => r.score === 5).length, silver: rated.filter((r: any) => r.score === 4).length, neutral: rated.filter((r: any) => r.score === 3).length,
      negative: rated.filter((r: any) => r.score <= 2).length, edit: rows.filter((r: any) => r.kind === 'edit').length,
      good: rated.filter((r: any) => r.score >= 4).length, bad: rated.filter((r: any) => r.score <= 2).length, unused_signal: signal,
    },
    pending_proposals: pending || 0,
    learn_min: min,
    mode: s.learn_mode || 'propose',
    should_propose: s.learn_mode !== 'off' && signal >= min && !pending,
  };
}

// ── 2. 생성 최적화 ──────────────────────────────────────────────────
/** 생성 프롬프트에 붙일 고득점 예시와 낮은 점수 이유 */
export async function fewShotBlock(step: StepKey, contentId: string, s: any) {
  const k = Math.max(0, Math.min(4, Number(s.fewshot_k ?? 2)));
  if (!k) return { text: '', ids: [] as number[] };
  const db = sbAdmin();
  const min = Number(s.fewshot_min_score || 4);
  const [{ data: top }, { data: low }] = await Promise.all([
    db.from('exemplars').select('id, score, tags, note, output, content_id').eq('step', step).gte('score', min).order('score', { ascending: false }).order('created_at', { ascending: false }).limit(k + 4),
    db.from('exemplars').select('note, tags').eq('step', step).lte('score', 2).not('note', 'is', null).order('created_at', { ascending: false }).limit(5),
  ]);
  const picks = (top || []).filter((e: any) => e.content_id !== contentId).slice(0, k);
  const lows = (low || []).filter((e: any) => e.note);
  if (!picks.length && !lows.length) return { text: '', ids: [] };
  const parts: string[] = [];
  if (picks.length) {
    parts.push(step === 'research'
      ? `\n\n## 참고: 운영자가 높은 점수를 준 조사의 특징 (주제·사실은 가져오지 말고 조사 방식만 참고)\n${picks.map((e: any) => `- ★${e.score}${e.tags?.length ? ` [${e.tags.join(', ')}]` : ''}: ${e.note || '메모 없음'}`).join('\n')}`
      : `\n\n## 참고: 운영자가 높은 점수를 준 이전 결과물\n구성·표현·분량 방식만 참고합니다. 그 안의 사실·숫자·기관명·주제는 절대 가져오지 말고 이번 조사 자료만 사용합니다.\n${picks.map((e: any) => `### ★${e.score}${e.tags?.length ? ` · ${e.tags.join(', ')}` : ''}${e.note ? ` · 좋은 이유: ${e.note}` : ''}\n${clip(e.output, 1600)}`).join('\n\n')}`);
  }
  if (lows.length) parts.push(`\n\n## 운영자가 낮은 점수를 준 이유 (피할 것)\n${lows.map((e: any) => `- ${e.note}${e.tags?.length ? ` [${e.tags.join(', ')}]` : ''}`).join('\n')}`);
  return { text: parts.join(''), ids: picks.map((e: any) => e.id) };
}

/** 후보 여러 개 → 운영자 채점 기준(고득점·저득점 예시)으로 점수 예측 → 최고 선택 */
export async function judgeCandidates(step: StepKey, outputs: any[], s: any, sopContent: string) {
  const db = sbAdmin();
  const { data: cal } = await db.from('exemplars').select('score, tags, note').eq('step', step).not('score', 'is', null).not('note', 'is', null).order('created_at', { ascending: false }).limit(12);
  const res = await ask<any>({
    system: `당신은 '${s.brand}' 운영자의 취향을 학습한 채점자입니다. '${stepDef(step).label}' 산출물 후보들을 운영자가 매길 점수(1~5, 소수 첫째 자리)로 예측합니다.
사실 오류·근거 없는 숫자·금지 표현(${(s.banned_phrases || []).join(', ')})·승인 보장 뉘앙스가 있으면 2점 이하입니다.

## SOP
${clip(sopContent, 5000)}

## 운영자의 실제 채점 예 (점수 · 태그 · 이유)
${(cal || []).map((e: any) => `- ★${e.score}${e.tags?.length ? ` [${e.tags.join(', ')}]` : ''}: ${e.note}`).join('\n') || '아직 없음 — SOP 체크리스트로 판단'}`,
    prompt: `${outputs.map((o, i) => `## 후보 ${i}\n${clip(o, 3500)}`).join('\n\n')}

JSON: { "scores": [{ "i": 0, "score": 4.2, "reason": "한 줄" }], "best": 0 }`,
    maxTokens: 1500, chain: s.llm_chain,
  });
  const scores: { i: number; score: number; reason?: string }[] = (res.data.scores || []).filter((x: any) => Number.isInteger(x.i) && x.i >= 0 && x.i < outputs.length);
  const best = scores.length ? scores.reduce((a, b) => (b.score > a.score ? b : a)).i : 0;
  return { best, scores, usage: res.usage };
}

// ── 3. SOP 최적화 ──────────────────────────────────────────────────
export async function learningSummary(step: StepKey) {
  const L = await learningData(step);
  return { data: L, md: learningNotesMd(L) };
}

function patchPrompt(step: StepKey, sopMd: string, notes: string, ex: any[], banned: string[]) {
  const show = (e: any) => {
    const head = `### 예시 #${e.id} [${e.kind === 'edit' ? '사람이 고친 예' : `★${e.score}`}]${e.tags?.length ? ` 태그: ${e.tags.join(', ')}` : ''} · 주제: ${e.topic || '-'}${e.note ? `\n운영자 메모: ${e.note}` : ''}`;
    if (e.kind === 'edit') return `${head}\nAI 원본: ${clip(e.before, 1300)}\n사람 최종본: ${clip(e.output, 1300)}`;
    return `${head}\n산출물: ${clip(e.output, 1800)}`;
  };
  return {
    system: `당신은 '오늘의 정책자금' 숏폼 공장의 SOP 편집자입니다. '${stepDef(step).label}' 단계 SOP(AI 작업 지침 md)를 운영자의 점수 데이터로 보완합니다.

원칙
- 먼저 "지금까지의 학습 노트"를 읽습니다: 점수 추이, 점수를 올린/내린 조건, 이미 반영된 학습, 거절된 제안. 거절된 제안과 같은 방향은 다시 제안하지 않고, 이미 반영된 내용을 되풀이하지 않습니다.
- 기존 SOP 를 유지합니다. 필요한 줄만 추가(add)·수정(modify)·삭제(remove).
- 근거는 점수입니다: ★5·★4 와 사람 최종본에 공통이고 ★1~2 에는 없는 패턴, "점수를 올린 조건"에 나타난 조건을 우선합니다. 변경마다 근거 예시 번호 2개 이상.
- 비슷한 줄이 있으면 modify. modify/remove 의 target 은 현재 SOP 줄을 그대로 복사.
- 한 줄 = 한 구체적 지시. 사실 정확성·출처·금지 표현 규칙은 절대 느슨하게 하지 않습니다. JSON 형식·글자수 상한 같은 기계 규칙은 쓰지 않습니다.
- 최대 6개. 근거가 부족하면 changes 를 비웁니다.`,
    prompt: `## 지금까지의 학습 노트
${clip(notes, 7000)}

## 현재 SOP
${sopMd}

## 이번에 반영할 예시 (점수 높은 순)
${ex.map(show).join('\n\n')}

금지 표현(절대 넣지 말 것): ${banned.join(', ')}

JSON 스키마:
{
  "summary": "운영자에게 보여줄 2~3문장 (무엇을 배웠고 무엇을 바꾸는지, 학습 노트의 어떤 흐름과 이어지는지)",
  "patterns": [{ "pattern": "점수 높은 예들의 공통점", "evidence": [예시번호], "in_sop": "already | missing | different" }],
  "changes": [{ "op": "add | modify | remove", "section": "목적 | 집중 포인트 | 체크리스트 | 금지 | 사람이 결정할 것", "target": "modify/remove: 현재 SOP 줄 그대로", "text": "add/modify: 새 줄 ('- ' 없이)", "reason": "왜 (점수 근거)", "evidence": [예시번호] }]
}`,
  };
}

/** 보완 제안(줄 단위). learn_mode=auto 면 안전한 변경 즉시 반영 */
export async function proposeSop(step: StepKey, opts: { force?: boolean } = {}) {
  if (!AI_STEPS.includes(step)) throw new Error('AI 단계만 학습할 수 있습니다');
  const s = await getSettings();
  const db = sbAdmin();
  const { data: pend } = await db.from('sop_proposals').select('id').eq('step', step).eq('status', 'pending').limit(1);
  if (pend?.length && !opts.force) throw new Error(`이미 검토 대기 중인 제안이 있습니다 (#${pend[0].id})`);

  const { data: exAll } = await db.from('exemplars').select('*').eq('step', step).is('used_in', null).order('created_at', { ascending: false }).limit(60);
  const unused = exAll || [];
  const signal = unused.filter(isSignal).sort((a: any, b: any) => (b.score ?? 4.5) - (a.score ?? 4.5)).slice(0, 6);
  if (!signal.length) throw new Error('아직 반영하지 않은 고득점(★4 이상) 예시나 수정 예가 없습니다');
  const low = unused.filter((e: any) => e.score != null && e.score <= 2).slice(0, 3);
  const examples = [...signal, ...low];

  const [sop, sum] = await Promise.all([getSop(step), learningSummary(step)]);
  const res = await ask<any>({ ...patchPrompt(step, sop.content, sum.md, examples, s.banned_phrases || []), maxTokens: 4000, chain: s.llm_chain });
  const changes = sanitizeChanges(res.data.changes, s.banned_phrases || []);
  if (opts.force && pend?.length) await db.from('sop_proposals').update({ status: 'superseded', decided_at: new Date().toISOString() }).eq('step', step).eq('status', 'pending');
  const { data: row, error } = await db.from('sop_proposals').insert({
    step, kind: 'patch', base_content: sop.content, changes, patterns: res.data.patterns || [], summary: res.data.summary || '',
    exemplar_ids: examples.map((e: any) => e.id), provider: `${res.provider}/${res.model}`,
    stats: { avg: sum.data.avg, rated: sum.data.counts.rated, lift: sum.data.lift.slice(0, 6), sop_trend: sum.data.sopTrend.slice(-4) },
  }).select().single();
  if (error) throw new Error(error.message);
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

/** 전체 재정리: 지금까지의 학습 전체를 읽고 SOP 를 다시 정리 (자동 반영 없음 — 항상 전후 비교 후 사람이 반영) */
export async function consolidateSop(step: StepKey, opts: { force?: boolean; instruction?: string } = {}) {
  if (!AI_STEPS.includes(step)) throw new Error('AI 단계만 정리할 수 있습니다');
  const s = await getSettings();
  const db = sbAdmin();
  const { data: pend } = await db.from('sop_proposals').select('id').eq('step', step).eq('status', 'pending').limit(1);
  if (pend?.length && !opts.force) throw new Error(`이미 검토 대기 중인 제안이 있습니다 (#${pend[0].id})`);
  const [sop, sum] = await Promise.all([getSop(step), learningSummary(step)]);
  const { data: gold } = await db.from('exemplars').select('id, score, tags, note, output').eq('step', step).gte('score', 4).order('score', { ascending: false }).order('created_at', { ascending: false }).limit(4);

  const res = await ask<any>({
    system: `당신은 '오늘의 정책자금' 숏폼 공장의 수석 SOP 편집자입니다. '${stepDef(step).label}' 단계 SOP 를 지금까지의 학습 전체를 바탕으로 다시 정리합니다.

정리 원칙
- 구조 유지: # 제목, ## 목적 / ## 집중 포인트 / ## 체크리스트 / ## 금지 / ## 사람이 결정할 것 (체크리스트는 "- [ ] ").
- 학습 노트의 근거(점수를 올린 조건, 높은 점수 이유, 반영된 학습)를 집중 포인트에 녹이고, 근거가 강한 지침을 위로 올립니다. 근거가 있으면 줄 끝에 짧게 "(★평균 4.6, n=7)"처럼 붙입니다.
- 겹치거나 같은 말을 하는 줄은 하나로 합치고, 점수 데이터와 어긋나는(점수를 내린 조건을 권하는) 줄은 고치거나 뺍니다.
- 거절된 제안의 방향은 넣지 않습니다.
- ## 금지 항목은 지우지 않습니다(표현 다듬기·추가만). 사실 정확성·출처·승인 보장 금지 규칙은 그대로 둡니다.
- JSON 형식·글자수 상한 같은 기계 규칙은 쓰지 않습니다. 짧고 구체적으로 — 집중 포인트 10줄, 체크리스트 8줄 이내 권장.
- 금지 표현(절대 넣지 말 것): ${(s.banned_phrases || []).join(', ')}`,
    prompt: `## 지금까지의 학습 노트
${clip(sum.md, 9000)}

## 높은 점수 결과물 (참고)
${(gold || []).map((e: any) => `### #${e.id} ★${e.score}${e.tags?.length ? ` [${e.tags.join(', ')}]` : ''}${e.note ? ` — ${e.note}` : ''}\n${clip(e.output, 1200)}`).join('\n\n') || '없음'}

## 현재 SOP
${sop.content}
${opts.instruction ? `\n## 운영자 지시\n${opts.instruction}\n` : ''}
JSON 스키마:
{
  "summary": "무엇을 어떻게 정리했는지 2~3문장",
  "content": "정리된 SOP md 전문",
  "changelog": [{ "type": "merge | add | modify | remove | reorder | keep", "detail": "무엇을 왜 (근거 포함)" }]
}`,
    maxTokens: 6000, chain: s.llm_chain,
  });
  const chk = checkRewrite(sop.content, String(res.data.content || ''), s.banned_phrases || []);
  if (!chk.ok) throw new Error(`재정리안이 안전 검사를 통과하지 못했습니다: ${chk.warns.join(', ')}`);
  if (opts.force && pend?.length) await db.from('sop_proposals').update({ status: 'superseded', decided_at: new Date().toISOString() }).eq('step', step).eq('status', 'pending');
  const { data: row, error } = await db.from('sop_proposals').insert({
    step, kind: 'rewrite', base_content: sop.content, proposed_content: chk.content, summary: res.data.summary || '',
    changelog: [...(res.data.changelog || []).slice(0, 20), ...chk.warns.map((w) => ({ type: 'check', detail: w }))],
    provider: `${res.provider}/${res.model}`, exemplar_ids: (gold || []).map((e: any) => e.id),
    stats: { avg: sum.data.avg, rated: sum.data.counts.rated, lift: sum.data.lift.slice(0, 6), sop_trend: sum.data.sopTrend.slice(-4), applied: sum.data.applied.length },
  }).select().single();
  if (error) throw new Error(error.message);
  await notify('sop_proposal', { step, extra: { proposal: { ...row, changes: (row.changelog || []).map((c: any) => ({ op: c.type, section: '', text: c.detail })) } } });
  return { proposal: row, warnings: chk.warns };
}

/** 반영: patch 는 변경별 선택·문구 수정·최종 md 편집, rewrite 는 재정리안(편집 가능) 그대로 */
export async function applyProposal(id: number, opts: { selected?: number[]; edits?: Record<number, string>; content?: string; note?: string; by?: 'human' | 'auto'; force?: boolean } = {}) {
  const db = sbAdmin();
  const s = await getSettings();
  const { data: p } = await db.from('sop_proposals').select('*').eq('id', id).single();
  if (!p) throw new Error('제안을 찾을 수 없습니다');
  if (p.status !== 'pending') throw new Error(`이미 처리된 제안입니다 (${p.status})`);
  const step = p.step as StepKey;
  const cur = await getSop(step);
  let content: string;
  let applied: number[] = [];
  let conflicts: any[] = [];
  if (p.kind === 'rewrite') {
    if (cur.content !== p.base_content && !opts.force) throw new Error('재정리안을 만든 뒤 SOP 가 바뀌었습니다. 현재 SOP 기준으로 다시 정리하거나, 그래도 반영하려면 강제 반영을 선택하세요.');
    const chk = checkRewrite(p.base_content, opts.content?.trim() ? opts.content : p.proposed_content, s.banned_phrases || []);
    if (!chk.ok) throw new Error(chk.warns.join(', '));
    content = chk.content;
  } else {
    const merged = applyChanges(cur.content, (p.changes || []) as SopChange[], opts.selected, opts.edits || {});
    content = opts.content?.trim() ? opts.content : merged.content;
    applied = merged.results.filter((r) => r.ok).map((r) => r.i);
    conflicts = merged.results.filter((r) => !r.ok);
  }
  if (content.trim() === cur.content.trim()) throw new Error('반영할 변경이 없습니다');

  await saveSop(step, { content }, `${p.kind === 'rewrite' ? 'SOP 재정리' : 'SOP 학습 보완'} #${id} 반영${p.kind === 'patch' ? ` (${applied.length}건)` : ''}${opts.by === 'auto' ? ' · 자동' : ''}${opts.note ? ' — ' + opts.note : ''} [${sopHash(cur.content)}→${sopHash(content)}]`);
  await db.from('sop_proposals').update({
    status: 'applied', applied_content: content, applied_changes: applied, decided_by: opts.by || 'human',
    decided_note: opts.note || null, decided_at: new Date().toISOString(),
  }).eq('id', id);
  await exportNow(() => exportSopChange(id));
  await notify('sop_applied', { step, extra: { proposal: { ...p, applied_content: content, changes: p.kind === 'rewrite' ? (p.changelog || []).map((c: any) => ({ op: c.type, section: '', text: c.detail })) : p.changes }, applied: p.kind === 'rewrite' ? undefined : applied, conflicts, by: opts.by || 'human' } });
  return { step, applied, conflicts, content };
}

export async function rejectProposal(id: number, note = '') {
  const db = sbAdmin();
  const { error } = await db.from('sop_proposals').update({ status: 'rejected', decided_by: 'human', decided_note: note || null, decided_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
  if (error) throw new Error(error.message);
  await exportNow(() => exportSopChange(id));
  return { ok: true };
}

export async function revertProposal(id: number) {
  const db = sbAdmin();
  const { data: p } = await db.from('sop_proposals').select('*').eq('id', id).single();
  if (!p || p.status !== 'applied') throw new Error('반영된 제안만 되돌릴 수 있습니다');
  const cur = await getSop(p.step);
  if (cur.content !== p.applied_content) throw new Error('반영 이후 SOP 가 다시 수정되었습니다. [SOP · AI 제어] → 변경 이력에서 원하는 버전을 불러오세요.');
  await saveSop(p.step, { content: p.base_content }, `SOP 제안 #${id} 되돌림`);
  await db.from('sop_proposals').update({ status: 'rejected', decided_note: `${p.decided_note || ''} (되돌림)`.trim(), decided_at: new Date().toISOString() }).eq('id', id);
  await exportNow(() => exportSopChange(id));
  return { ok: true };
}

/** 하루 1회(크론): 조건을 채운 단계마다 보완 제안 (최대 3개) */
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

export { tierOf, tagStats };
