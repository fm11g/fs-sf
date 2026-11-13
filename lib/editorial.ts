import { ask } from './llm';
import { getSettings } from './settings';
import { sbAdmin } from './supabase/server';
import { channelInsights, contentAttrs, type Insights } from './channels';
import { candidateTable, greedyLineup, validateLineup, type Slot } from './editorial-core';
import { DIMENSIONS, DIM_KEYS, EDITORIAL_RULES } from './editorial-taxonomy';
import { exportEditorial, exportNow } from './export';

/**
 * 편성: 채널 성과(최종 점수) × 새로움 → 7일 편성표 → 매일 콘텐츠가 슬롯 하나를 받아 조사·기획에 반영
 */
const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(+new Date(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const DAYS = 7;

export async function activePlan() {
  const { data } = await sbAdmin().from('editorial_plans').select('*').eq('status', 'active').order('id', { ascending: false }).limit(1).maybeSingle();
  return data;
}

function refinePrompt(s: any, ins: Insights, table: any, draft: Slot[], recent: any[]) {
  const top = (k: string) => table[k].slice(0, 6).map((c: any) => `${c.value}(성과 ★${c.shrunk}${c.n ? `, n=${c.n}` : ', 데이터 없음'}, 새로움 ${c.novelty}${c.days_since != null ? `, ${c.days_since}일 전` : ', 미사용'})`).join(' · ');
  return {
    system: `당신은 '${s.brand}' 숏폼 채널의 편성 PD입니다. 시청자가 지루해하지 않고 매일 새로움을 느끼면서도, 우리 채널에서 점수가 높았던 형태를 살리는 7일 편성을 짭니다.
타깃: ${s.target}

편성 규칙 (반드시 지킴)
${EDITORIAL_RULES.map((r) => `- ${r}`).join('\n')}
- 쿨다운 ${s.cooldown_days ?? 3}일 · 실험 비율 ${s.explore_rate ?? 0.2} · 새로움 강도 ${s.novelty_strength ?? 0.35} (0 = 성과 우선, 1 = 새로움 우선)
- 각 값은 아래 분류 목록에서만 고릅니다.
${DIM_KEYS.map((k) => `  - ${k}: ${DIMENSIONS[k].values.join(', ')}`).join('\n')}

흐름 원칙
- 한 주에 리듬을 만듭니다: 강한 훅(마감·금액) 다음 날은 정보형(자격·절차), 주 중반에 오해·사례로 환기, 주 후반에 마감 정리처럼 강약을 섞습니다.
- 시청자 요청이 있으면 1~2편은 그 주제로 응답합니다.
- 고정(locked)·배정된 슬롯은 바꾸지 않습니다.`,
    prompt: `## 형태별 후보 (성과 × 새로움, 위가 유리)
${DIM_KEYS.map((k) => `- ${DIMENSIONS[k].label}: ${top(k)}`).join('\n')}

## 점수가 높았던 영상
${ins.top.map((p) => `- ★${p.score} ${p.title} [${Object.values(p.attrs || {}).filter(Boolean).join(' · ')}]${p.why.length ? ` — ${p.why.join('·')} 상위` : ''}`).join('\n') || '아직 없음'}
## 점수가 낮았던 영상
${ins.bottom.map((p) => `- ★${p.score} ${p.title} [${Object.values(p.attrs || {}).filter(Boolean).join(' · ')}]`).join('\n') || '아직 없음'}

## 시청자 요청·질문 (댓글)
${ins.requests.map((r) => `- ${r.text} (${r.n}회)`).join('\n') || '없음'}

## 최근 흐름 (최신순)
${recent.slice(0, 10).map((r: any) => `- ${String(r.at).slice(0, 10)} ${r.title || ''} [${DIM_KEYS.map((k) => r.attrs?.[k]).filter(Boolean).join(' · ')}]${r.score != null ? ` ★${r.score}` : ''}`).join('\n') || '없음'}

## 초안 (규칙을 만족하도록 계산한 편성 — 바꿔도 되지만 규칙은 지킬 것)
${draft.map((d) => `${d.order}. ${d.date}${d.locked || d.content_id ? ' [고정]' : ''}${d.experiment ? ' [실험]' : ''} ${d.topic_category} / ${d.angle} / ${d.hook_type} / ${d.format} / ${d.target}`).join('\n')}

JSON: {
  "series_note": "이번 주 흐름을 2~3문장 (왜 이 순서인지)",
  "slots": [{ "date": "YYYY-MM-DD", "topic_category": "", "angle": "", "hook_type": "", "format": "", "target": "", "experiment": false,
    "title_idea": "영상 제목 아이디어 (구체적 공고명은 조사 단계가 정하므로 형태 위주)", "hook_example": "첫 2초 훅 예시", "reason": "왜 이 슬롯인지 (성과·새로움·요청 근거)", "flow_note": "앞뒤 영상과의 연결" }]
}
slots 는 ${draft.length}개, 날짜 순서 그대로.`,
  };
}

/** 편성표 만들기·갱신: 오늘부터 7일. 이미 배정·고정된 슬롯은 유지 */
export async function buildPlan(o: { force?: boolean } = {}) {
  const s = await getSettings();
  const db = sbAdmin();
  const today = todayKST();
  const cur = await activePlan();
  const covers = cur && cur.start_date <= today && addDays(cur.start_date, DAYS - 1) >= today;
  const hasToday = covers && (cur.slots || []).some((x: any) => x.date === today);
  if (cur && covers && hasToday && !o.force) {
    // 남은 슬롯이 3개 미만이면 뒤를 이어 다시 편성
    const remain = (cur.slots || []).filter((x: any) => x.date >= today).length;
    if (remain >= 3) return { plan: cur, rebuilt: false };
  }

  const ins = await channelInsights();
  const table = candidateTable(ins.dims as any, ins.overall, s);
  const fixed: Record<string, Partial<Slot>> = {};
  for (const x of cur?.slots || []) if (x.date >= today && (x.locked || x.content_id)) fixed[x.date] = x;
  const recent = ins.sequence.filter((r) => String(r.at).slice(0, 10) < today);
  const draft = greedyLineup(table, recent as any, today, DAYS, s, fixed);

  let slots: Slot[] = draft;
  let series_note = '';
  let provider: string | null = null;
  const warnings: string[] = [];
  try {
    const res = await ask<any>({ ...refinePrompt(s, ins, table, draft, ins.sequence), maxTokens: 3500, chain: s.llm_chain, task: 'editorial' });
    provider = `${res.provider}/${res.model}`;
    const refined: Slot[] = draft.map((d, i) => {
      const r = (res.data.slots || []).find((x: any) => x.date === d.date) || {};
      if (d.locked || d.content_id) return { ...d, title_idea: d.title_idea || r.title_idea, hook_example: d.hook_example || r.hook_example, flow_note: d.flow_note || r.flow_note };
      const dims = Object.fromEntries(DIM_KEYS.map((k) => [k, (DIMENSIONS[k].values as readonly string[]).includes(r[k]) ? r[k] : (d as any)[k]]));
      if (!r.date) return { ...d, title_idea: `${d.topic_category} · ${d.angle}` };
      return { ...d, ...dims, experiment: r.experiment ?? d.experiment, title_idea: r.title_idea, hook_example: r.hook_example, flow_note: r.flow_note, reason: r.reason ? `${r.reason}` : d.reason } as Slot;
    });
    const v = validateLineup(refined, recent as any, s);
    if (v.filter((w) => w.index >= 0).length) {
      warnings.push(`AI 편성안이 규칙 ${v.length}건을 어겨 계산된 편성을 사용 (제목 아이디어는 형태가 같은 날만 유지)`);
      slots = draft.map((d, i) => (DIM_KEYS.every((k) => (refined[i] as any)[k] === (d as any)[k]) ? refined[i] : { ...d, flow_note: refined[i].flow_note }));
    } else slots = refined;
    series_note = res.data.series_note || '';
  } catch (e: any) {
    warnings.push(`AI 편성 다듬기 생략 (계산된 편성만): ${String(e.message).slice(0, 100)}`);
  }
  warnings.push(...validateLineup(slots, recent as any, s).map((w) => (w.index >= 0 ? `${w.index + 1}번: ${w.msg}` : w.msg)));

  if (cur) await db.from('editorial_plans').update({ status: 'superseded' }).eq('id', cur.id);
  const { data: plan, error } = await db.from('editorial_plans').insert({
    start_date: today, slots, series_note, warnings, provider,
    inputs: { overall: ins.overall, scored: ins.scored, requests: ins.requests.slice(0, 6), top: ins.top.slice(0, 3), table: Object.fromEntries(DIM_KEYS.map((k) => [k, table[k].slice(0, 5)])), recent: ins.sequence.slice(0, 7) },
  }).select().single();
  if (error) throw new Error(error.message);
  await exportNow(() => exportEditorial(plan));
  return { plan, rebuilt: true };
}

/** 새 콘텐츠에 오늘(없으면 가장 가까운 미배정) 슬롯 배정 */
export async function claimSlot(contentId: string) {
  const s = await getSettings();
  if (s.editorial_enabled === false) return null;
  const db = sbAdmin();
  let plan = await activePlan();
  if (!plan || !(plan.slots || []).some((x: any) => x.date >= todayKST() && !x.content_id)) plan = (await buildPlan({ force: !!plan })).plan;
  const today = todayKST();
  const slots: Slot[] = plan.slots || [];
  const idx = slots.findIndex((x) => x.date === today && !x.content_id) >= 0 ? slots.findIndex((x) => x.date === today && !x.content_id) : slots.findIndex((x) => x.date >= today && !x.content_id);
  if (idx < 0) return null;
  slots[idx] = { ...slots[idx], content_id: contentId };
  await db.from('editorial_plans').update({ slots }).eq('id', plan.id);
  const editorial = { ...slots[idx], plan_id: plan.id, series_note: plan.series_note };
  await db.from('contents').update({ editorial }).eq('id', contentId);
  return editorial;
}

/** 조사·기획 프롬프트에 넣을 편성 브리프 */
export async function editorialBrief(c: any, step: 'research' | 'plan') {
  const e = c.editorial;
  const db = sbAdmin();
  const [{ data: recent }, { data: posts }] = await Promise.all([
    db.from('contents').select('id, topic, research, plan, editorial, created_at').neq('id', c.id).order('created_at', { ascending: false }).limit(6),
    db.from('channel_posts').select('title, attrs, perf_score, comment_analysis').order('published_at', { ascending: false }).limit(40),
  ]);
  const reqs = [...new Set((posts || []).flatMap((p: any) => p.comment_analysis?.requests || []).filter(Boolean))].slice(0, 6);
  const sameCat = e?.topic_category ? (posts || []).filter((p: any) => p.attrs?.topic_category === e.topic_category && p.perf_score != null).sort((a: any, b: any) => b.perf_score - a.perf_score).slice(0, 3) : [];
  const avoid = (recent || []).map((r: any) => ({ topic: r.topic, ...contentAttrs(r) }));
  if (!e && !avoid.length && !reqs.length) return '';
  const lines = ['## 오늘의 편성 (채널 성과와 새로움을 기준으로 정해진 슬롯)'];
  if (e) {
    lines.push(`- 주제 분류: ${e.topic_category} · 각도: ${e.angle} · 훅: ${e.hook_type} · 구성: ${e.format} · 대상: ${e.target}${e.experiment ? ' · [실험 슬롯 — 평소와 다른 시도]' : ''}`);
    if (e.title_idea) lines.push(`- 제목 아이디어: ${e.title_idea}`);
    if (e.hook_example && step === 'plan') lines.push(`- 훅 예시: ${e.hook_example}`);
    if (e.reason) lines.push(`- 편성 이유: ${e.reason}`);
    if (e.flow_note) lines.push(`- 흐름: ${e.flow_note}`);
  }
  if (step === 'research') {
    lines.push(e ? `- 위 주제 분류에 맞는 공고를 우선 찾습니다. 맞는 공고가 없으면 가장 가까운 것을 고르고 _ai.opinion 에 이유를 적습니다. 결과 JSON 의 topic_category 는 분류 목록에서 고릅니다.` : '');
    if (reqs.length) lines.push(`- 시청자 요청(댓글): ${reqs.join(' / ')} — 슬롯과 맞으면 우선 반영`);
  } else {
    lines.push(e ? `- angle·hook_type·format 은 위 슬롯을 따릅니다. 자유도 3 에서 더 나은 근거가 있으면 바꿀 수 있지만 _ai.opinion 에 이유를 적습니다.` : '');
    if (sameCat.length) lines.push(`- 같은 주제 분류에서 점수가 높았던 영상: ${sameCat.map((p: any) => `"${p.title}" ★${p.perf_score}`).join(' · ')} — 형태만 참고, 내용 반복 금지`);
  }
  if (avoid.length) lines.push(`- 최근 콘텐츠와 겹치지 않게 (주제·훅·각도 반복 금지): ${avoid.map((a: any) => `${a.topic || '-'}[${[a.topic_category, a.angle, a.hook_type].filter(Boolean).join('·')}]`).join(' / ')}`);
  return '\n\n' + lines.filter(Boolean).join('\n');
}

const bigrams = (s: string) => { const t = String(s || '').replace(/\s/g, ''); const out = new Set<string>(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
const sim = (a: string, b: string) => { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => { if (B.has(x)) n++; }); return n / Math.min(A.size, B.size); };

/** 반복·편성 이탈 검사 (규칙 검사에 경고로 추가) */
export async function noveltyChecks(step: string, out: any, c: any) {
  if (!['research', 'plan'].includes(step) || !out) return [];
  const { data: recent } = await sbAdmin().from('contents').select('id, topic, research, plan, created_at').neq('id', c.id).order('created_at', { ascending: false }).limit(10);
  const R = recent || [];
  const w: { level: 'warn'; msg: string }[] = [];
  const e = c.editorial;
  if (step === 'research') {
    const hit = R.map((r: any) => ({ r, v: sim(out.topic, r.topic) })).filter((x) => x.r.topic && x.v >= 0.6).sort((a, b) => b.v - a.v)[0];
    if (hit) w.push({ level: 'warn', msg: `최근 주제와 겹침 (${Math.round(hit.v * 100)}%): "${hit.r.topic}"` });
    const prev = R[0]?.research?.topic_category;
    if (out.topic_category && prev && out.topic_category === prev) w.push({ level: 'warn', msg: `직전 콘텐츠와 같은 주제 분류: ${prev}` });
    if (e?.topic_category && out.topic_category && out.topic_category !== e.topic_category) w.push({ level: 'warn', msg: `편성 슬롯(${e.topic_category})과 다른 주제 분류: ${out.topic_category}` });
  }
  if (step === 'plan') {
    const prev = R.map((r: any) => contentAttrs(r));
    if (out.angle && prev[0]?.angle === out.angle) w.push({ level: 'warn', msg: `직전 콘텐츠와 같은 각도: ${out.angle}` });
    const hooks = (out.hook_options || []).find((h: any) => (typeof h === 'string' ? h : h.text) === out.chosen_hook);
    const ht = hooks && typeof hooks === 'object' ? hooks.type : null;
    if (ht && prev[0]?.hook_type === ht && prev[1]?.hook_type === ht) w.push({ level: 'warn', msg: `같은 훅 유형 3연속: ${ht}` });
    if (out.format && prev[0]?.format === out.format) w.push({ level: 'warn', msg: `직전 콘텐츠와 같은 구성: ${out.format}` });
    for (const k of ['angle', 'format'] as const) if (e?.[k] && out[k] && e[k] !== out[k]) w.push({ level: 'warn', msg: `편성 슬롯과 다른 ${DIMENSIONS[k].label}: ${out[k]} (슬롯: ${e[k]})` });
  }
  return w;
}

/** 슬롯 수동 수정·순서 변경·고정 */
export async function updateSlot(index: number, patch: Partial<Slot>) {
  const plan = await activePlan();
  if (!plan) throw new Error('편성표가 없습니다');
  const slots: Slot[] = plan.slots || [];
  if (!slots[index]) throw new Error('슬롯 번호가 없습니다');
  const allowed = ['topic_category', 'angle', 'hook_type', 'format', 'target', 'title_idea', 'hook_example', 'reason', 'flow_note', 'locked', 'experiment'];
  slots[index] = { ...slots[index], ...Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k))) };
  const s = await getSettings();
  const warnings = validateLineup(slots, [], s).map((w) => (w.index >= 0 ? `${w.index + 1}번: ${w.msg}` : w.msg));
  await sbAdmin().from('editorial_plans').update({ slots, warnings }).eq('id', plan.id);
  return { slots, warnings };
}

export async function moveSlot(index: number, dir: -1 | 1) {
  const plan = await activePlan();
  if (!plan) throw new Error('편성표가 없습니다');
  const slots: Slot[] = plan.slots || [];
  const j = index + dir;
  if (!slots[index] || !slots[j]) throw new Error('이동할 수 없습니다');
  if (slots[index].content_id || slots[j].content_id) throw new Error('이미 콘텐츠가 배정된 슬롯은 옮길 수 없습니다');
  const keep = (x: Slot) => ({ date: x.date, order: x.order });
  const a = { ...slots[j], ...keep(slots[index]) };
  const b = { ...slots[index], ...keep(slots[j]) };
  slots[index] = a; slots[j] = b;
  const s = await getSettings();
  const warnings = validateLineup(slots, [], s).map((w) => (w.index >= 0 ? `${w.index + 1}번: ${w.msg}` : w.msg));
  await sbAdmin().from('editorial_plans').update({ slots, warnings }).eq('id', plan.id);
  return { slots, warnings };
}
