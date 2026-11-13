import { ask, type Usage } from './llm';
import { USER, buildSystem, reviewPrompt } from './prompts';
import { sbAdmin } from './supabase/server';
import { charLen, parseSlots, validate } from './landing';
import { getSop, type Sop } from './sop';
import { getOutput, getSettings } from './settings';
import { notify } from './notify';
import { fewShotBlock, judgeCandidates, learnCounts, recordEditExemplar } from './learn';
import { exportNow, exportRun } from './export';
import { sopHash } from './sop';
export { getOutput, getSettings };
import { STEP_DEFS, STEP_KEYS, downstream, stepDef, type StepKey } from './steps';
import type { Settings, StepRow } from './types';

type Check = { level: 'error' | 'warn' | 'ok'; msg: string };

export function landingLink(s: Settings, slug: string, source: 'youtube' | 'instagram' | 'blog') {
  const medium = source === 'youtube' ? 'shorts' : source === 'instagram' ? 'reels' : 'post';
  return `${s.site_url.replace(/\/$/, '')}/l/${slug}?utm_source=${source}&utm_medium=${medium}&utm_campaign=${slug}`;
}

/** 오늘 날짜 기반 slug: 2026-11-12-a1b2 */
export function newSlug() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  return `${d}-${Math.random().toString(36).slice(2, 6)}`;
}

async function log(contentId: string, step: string, status: string, message?: string) {
  await sbAdmin().from('jobs').insert({ content_id: contentId, step, status, message });
}

const charsNoSpace = (s: string) => (s || '').replace(/\s/g, '').length;
const now = () => new Date().toISOString();
const add = (a: Usage, b: Usage) => ({ input: a.input + b.input, output: a.output + b.output });

// ── 단계 행 ─────────────────────────────────────────────────────────
export async function ensureSteps(contentId: string): Promise<Record<StepKey, StepRow>> {
  const db = sbAdmin();
  await db.from('steps').upsert(STEP_KEYS.map((step) => ({ content_id: contentId, step })), { onConflict: 'content_id,step', ignoreDuplicates: true });
  const { data } = await db.from('steps').select('*').eq('content_id', contentId);
  return Object.fromEntries((data || []).map((r: any) => [r.step, r])) as any;
}

async function setStep(contentId: string, step: StepKey, patch: Record<string, any>) {
  const { error } = await sbAdmin().from('steps').update(patch).eq('content_id', contentId).eq('step', step);
  if (error) throw new Error(error.message);
}

/** 현황판용: 첫 미승인 단계를 contents.current_step 에 기록 */
export async function syncCurrent(contentId: string) {
  const rows = await ensureSteps(contentId);
  const cur = STEP_KEYS.find((k) => rows[k]?.state !== 'approved') || 'done';
  await sbAdmin().from('contents').update({ current_step: cur }).eq('id', contentId);
  return cur;
}

/** 상위 산출물이 바뀌면 그것을 읽는 하위 단계를 '재작업 필요'로 */
async function markStale(contentId: string, step: StepKey) {
  const ds = downstream(step);
  if (!ds.length) return;
  await sbAdmin().from('steps').update({ state: 'stale', decided_by: null, decided_at: null })
    .eq('content_id', contentId).in('step', ds).in('state', ['approved', 'review', 'rejected']);
}

// ── 산출물 읽기/쓰기 ────────────────────────────────────────────────
// ── 코드 규칙 검사 (md 로 바뀌지 않는 기계 규칙) ─────────────────────
export function lint(step: StepKey, out: any, c: any, s: Settings, extra: { slots?: any[] } = {}): Check[] {
  const r: Check[] = [];
  const err = (msg: string) => r.push({ level: 'error', msg });
  const warn = (msg: string) => r.push({ level: 'warn', msg });
  const text = JSON.stringify(out ?? '');
  for (const b of s.banned_phrases || []) if (b && text.includes(b)) err(`금지 표현 포함: "${b}"`);

  if (step === 'research') {
    const facts = out?.facts || [];
    if (facts.length < 3) warn(`근거 fact ${facts.length}개 (3개 이상 권장)`);
    const noSrc = facts.filter((f: any) => !/^https?:\/\//.test(f.source_url || '')).length;
    if (noSrc) err(`출처 URL 없는 fact ${noSrc}개`);
    if (!out?.program?.deadline) warn('접수 마감/기간이 비어 있음');
  }
  if (step === 'plan') {
    const st = out?.structure || [];
    const sum = st.reduce((n: number, x: any) => n + Number(x.seconds || 0), 0);
    if (sum < 36 || sum > 44) warn(`장면 합계 ${sum}초 (38~42 권장)`);
    if (st.length && st[st.length - 1].role !== 'cta') err('마지막 장면이 cta 가 아님');
    if (st.length < 5 || st.length > 9) warn(`장면 ${st.length}개 (6~8 권장)`);
  }
  if (step === 'script') {
    const sc = out?.scenes || [];
    const total = sc.reduce((n: number, x: any) => n + charsNoSpace(x.narration), 0);
    if (total < 195 || total > 265) err(`내레이션 ${total}자 (210~250자 필요)`);
    else if (total < 210 || total > 250) warn(`내레이션 ${total}자 (210~250 권장)`);
    const long = sc.flatMap((x: any) => x.captions || []).filter((t: string) => charLen(t) > 14).length;
    if (long) warn(`14자 넘는 자막 ${long}컷`);
    const planIds = (c.plan?.structure || []).map((x: any) => x.id).join(',');
    if (planIds && planIds !== sc.map((x: any) => x.id).join(',')) warn('장면 id 가 기획과 다름');
  }
  if (step === 'offer') {
    if (!out?.event_name) err('이벤트명이 비어 있음');
    if (out?.deadline_label && !out?.deadline_source) err('마감 문구에 근거(deadline_source)가 없음');
    if (!/심사/.test(out?.disclaimer || '')) warn('유의 문구에 "심사" 안내가 없음');
    if (charLen(out?.cta || '') > 14) warn('버튼 문구 14자 초과');
  }
  if (step === 'landing') {
    const slots = extra.slots || [];
    const over = validate(slots, out || {});
    for (const o of over) err(`슬롯 ${o.key}: ${o.len}/${o.max}자 초과`);
    const empty = slots.filter((x) => !(out || {})[x.key]).length;
    if (empty) err(`비어 있는 슬롯 ${empty}개`);
    const thin = slots.filter((x) => x.max && (out || {})[x.key] && charLen(out[x.key]) < x.max * 0.4).length;
    if (thin) warn(`최대 글자수의 40% 미만인 슬롯 ${thin}개 (레이아웃이 빌 수 있음)`);
  }
  if (step === 'design') {
    const ids = (c.script?.scenes || []).map((x: any) => x.id);
    const got = (out?.scenes || []).map((x: any) => x.id);
    const miss = ids.filter((i: string) => !got.includes(i));
    if (miss.length) err(`디자인 없는 장면: ${miss.join(', ')}`);
    const long = (out?.scenes || []).filter((x: any) => charLen(x.headline || '') > 12).length;
    if (long) warn(`headline 12자 초과 ${long}개`);
    for (const x of out?.scenes || []) if (x.layout === 'stat' && !/\d/.test(x.value || '')) warn(`${x.id}: stat 장면에 숫자 value 없음`);
  }
  if (step === 'copy') {
    const y = out?.youtube || {}; const i = out?.instagram || {};
    if (charLen(y.title || '') > 100) err('유튜브 제목 100자 초과'); else if (charLen(y.title || '') > 45) warn('유튜브 제목 40자 초과');
    if (!/https?:\/\//.test(y.comment || '')) err('유튜브 댓글에 링크 없음');
    if (!/https?:\/\//.test(i.caption || '')) err('인스타 캡션에 링크 없음');
    if (charLen(i.caption || '') > 2200) err('인스타 캡션 2,200자 초과');
    if (((i.caption || '').match(/#/g) || []).length > 30) err('해시태그 30개 초과');
  }
  if (step === 'post') {
    const n = charLen(out?.body_markdown || '');
    if (n < 1500) warn(`본문 ${n}자 (2,000자 이상 권장)`);
    if (charLen(out?.title || '') > 36) warn('제목 32자 초과');
    const md = charLen(out?.meta_description || '');
    if (md < 60 || md > 140) warn(`메타 설명 ${md}자 (80~120 권장)`);
    if (!/\|.*\|/.test(out?.body_markdown || '')) warn('표가 없음');
  }
  if (!r.length) r.push({ level: 'ok', msg: '규칙 검사 통과' });
  return r;
}
const hasError = (c: Check[]) => c.some((x) => x.level === 'error');

// ── 생성: 준비(prepare) → LLM 또는 에이전트 → 마무리(finalize) ─────────
type Prep = { system: string; prompt: string; webSearch: boolean; maxTokens: number; slots?: any[]; tpl?: any; refs?: number[] };
type Gen = { output: any; notes: any; usage: Usage; slots?: any[]; provider?: string; model?: string; tried?: any[]; input?: { system: string; prompt: string }; candidates?: number; pred_score?: number | null; judge?: any; refs?: number[] };

/** 이 단계에서 모델(또는 에이전트)이 받을 지시문 전체 */
async function prepare(step: StepKey, c: any, s: Settings, sop: Sop, feedback?: string | null): Promise<Prep> {
  const db = sbAdmin();
  const prev = feedback ? await getOutput(step, c) : undefined;
  const ctx: any = { s, c, prev, feedback };
  const prep: Prep = { system: '', prompt: '', webSearch: step === 'research', maxTokens: step === 'post' ? 10000 : 8000 };

  if (step === 'research') {
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const { data } = await db.from('contents').select('topic').gte('created_at', since).neq('id', c.id).not('topic', 'is', null).limit(30);
    ctx.recentTopics = (data || []).map((x: any) => x.topic);
  }
  if (step === 'landing') {
    const { data: tpl } = await db.from('landing_templates').select('*').eq('is_active', true).maybeSingle();
    if (!tpl) throw new Error('활성 랜딩 템플릿이 없습니다. [랜딩 템플릿] 메뉴에서 등록하세요.');
    prep.tpl = tpl;
    prep.slots = ctx.slots = parseSlots(tpl.html);
  }
  prep.system = buildSystem(s, step, sop);
  prep.prompt = USER[step](ctx);
  // 점수 기반 최적화 ①: 운영자가 높은 점수를 준 예시와 낮은 점수 이유를 참고로 주입
  try {
    const fs = await fewShotBlock(step, c.id, s);
    prep.prompt += fs.text;
    prep.refs = fs.ids;
  } catch { /* 예시 없음 */ }
  return prep;
}

/** 모델/에이전트가 낸 JSON을 후처리해 저장 */
async function finalize(step: StepKey, c: any, s: Settings, raw: any, prep: Prep): Promise<Gen> {
  const db = sbAdmin();
  let usage: Usage = { input: 0, output: 0 };
  if (!raw || typeof raw !== 'object') throw new Error('산출물이 JSON 객체가 아닙니다');
  let out = { ...raw };
  const notes = out._ai ?? null;
  delete out._ai;

  if (step === 'script') {
    out.total_chars = (out.scenes || []).reduce((n: number, x: any) => n + charsNoSpace(x.narration), 0);
  }
  if (step === 'design') {
    if (c.design?.fonts) out.fonts = c.design.fonts; // 관리자가 조정한 폰트·크기 유지
    if (c.design?.scale) out.scale = c.design.scale;
  }
  if (step === 'copy') {
    const yt = landingLink(s, c.slug, 'youtube');
    const ig = landingLink(s, c.slug, 'instagram');
    const r = (t: string, link: string) => (t || '').split('{LINK}').join(link);
    out = {
      youtube: { ...out.youtube, description: r(out.youtube?.description, yt), comment: r(out.youtube?.comment, yt), link: yt },
      instagram: { ...out.instagram, caption: r(out.instagram?.caption, ig), first_comment: r(out.instagram?.first_comment, ig), link: ig },
    };
  }
  if (step === 'post') {
    out.body_markdown = String(out.body_markdown || '').split('{LINK}').join(landingLink(s, c.slug, 'blog'));
  }

  if (step === 'landing') {
    const slots = prep.slots || [];
    let values: Record<string, string> = out.values || out;
    const over = validate(slots, values);
    if (over.length) {
      try { // 글자수 초과분만 자동 축약 (서버 제공자가 없으면 건너뛰고 규칙 검사에서 오류로 표시)
        const fix = await ask<{ values: Record<string, string> }>({
          system: '당신은 카피 편집자입니다. 의미를 유지하면서 글자수(공백 포함, \\n 제외)를 줄입니다.',
          prompt: `다음 문구를 각 최대 글자수 이하로 줄이세요.\n${over.map((o) => `- ${o.key} (최대 ${o.max}자): "${o.value}"`).join('\n')}\nJSON: { "values": { "key": "문구" } }`,
          chain: s.llm_chain,
        });
        usage = add(usage, fix.usage);
        values = { ...values, ...fix.data.values };
      } catch { /* 규칙 검사에 맡김 */ }
    }
    await db.from('landing_variants').upsert(
      { content_id: c.id, template_id: prep.tpl.id, slug: c.slug, values, warnings: validate(slots, values) },
      { onConflict: 'content_id' },
    );
    return { output: values, notes, usage, slots };
  }

  const patch: any = { [stepDef(step).field!]: out, error: null };
  if (step === 'research' && !c.topic) patch.topic = out.topic;
  await db.from('contents').update(patch).eq('id', c.id);
  return { output: out, notes, usage };
}

async function generate(step: StepKey, c: any, s: Settings, sop: Sop, feedback?: string | null, prefer?: string | null): Promise<Gen> {
  const prep = await prepare(step, c, s, sop, feedback);
  const req = {
    system: prep.system, prompt: prep.prompt, webSearch: prep.webSearch, maxTokens: prep.maxTokens,
    mcp: step === 'research' ? s.mcp_servers : undefined,
    chain: s.llm_chain, prefer: prefer || sop.provider,
  };
  // 점수 기반 최적화 ②: 후보 N개(SOP 의 best_of) → 운영자 채점 기준으로 점수 예측 → 최고 선택
  const n = Math.max(1, Math.min(4, Number(sop.best_of || 1)));
  const settled = await Promise.allSettled(Array.from({ length: n }, () => ask<any>(req)));
  const ok = settled.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw (settled[0] as PromiseRejectedResult).reason;
  let usage = ok.reduce((u: Usage, r: any) => add(u, r.usage), { input: 0, output: 0 });
  let pick = 0;
  let judge: any = null;
  if (ok.length > 1) {
    try {
      judge = await judgeCandidates(step, ok.map((r: any) => { const d = { ...r.data }; delete d._ai; return d; }), s, sop.content);
      usage = add(usage, judge.usage);
      pick = judge.best;
    } catch { /* 채점 실패 → 첫 후보 */ }
  }
  const res = ok[pick];
  const gen = await finalize(step, c, s, res.data, prep);
  const pred = judge?.scores?.find((x: any) => x.i === pick)?.score ?? null;
  return {
    ...gen, usage: add(gen.usage, usage), provider: res.provider, model: res.model, tried: res.tried,
    input: { system: prep.system, prompt: prep.prompt }, candidates: ok.length, pred_score: pred,
    judge: judge ? { best: pick, scores: judge.scores } : null, refs: prep.refs,
  };
}

// ── AI 검수 ─────────────────────────────────────────────────────────
async function review(step: StepKey, c: any, s: Settings, sop: Sop, output: any, checks: Check[]) {
  const inputs = Object.fromEntries(await Promise.all(stepDef(step).deps.map(async (d) => [d, await getOutput(d, c)])));
  if (step === 'offer') (inputs as any).available_offers = s.offers;
  const res = await ask<any>({ ...reviewPrompt(s, step, sop, inputs, output, checks), maxTokens: 4000, chain: s.llm_chain });
  if (hasError(checks)) res.data.verdict = 'revise';
  return res;
}

async function loadContent(contentId: string) {
  const { data: c, error } = await sbAdmin().from('contents').select('*').eq('id', contentId).single();
  if (error || !c) throw new Error('콘텐츠를 찾을 수 없습니다');
  return c;
}

async function slotsFor(contentId: string) {
  const { data } = await sbAdmin().from('landing_variants').select('landing_templates(html)').eq('content_id', contentId).maybeSingle();
  const html = (data as any)?.landing_templates?.html;
  return html ? parseSlots(html) : [];
}

function depsBlocked(step: StepKey, rows: Record<string, StepRow>) {
  return stepDef(step).deps.filter((d) => rows[d]?.state !== 'approved');
}

/** 규칙 검사 → 결정 방식(게이트) 적용 → 단계 행 기록 → 하위 단계 무효화 */
async function settle(step: StepKey, contentId: string, row: StepRow, s: Settings, sop: Sop, gen: Gen, t0: number, regen?: (fb: string) => Promise<Gen>) {
  let c = await loadContent(contentId);
  let usage = gen.usage;
  let checks = lint(step, gen.output, c, s, { slots: gen.slots });
  let aiReview: any = null;
  let state: StepRow['state'] = 'review';
  let decidedBy: string | null = null;
  let extra = 0;

  if (sop.gate === 'auto') {
    if (!hasError(checks)) { state = 'approved'; decidedBy = 'auto'; }
  } else if (sop.gate === 'ai') {
    try {
      let rv = await review(step, c, s, sop, gen.output, checks);
      usage = add(usage, rv.usage);
      if (rv.data.verdict !== 'pass' && rv.data.feedback && regen) {
        gen = await regen(rv.data.feedback); // 미달 → AI 피드백 반영 1회 재작업 후 재검수
        usage = add(usage, gen.usage);
        extra = 1;
        c = await loadContent(contentId);
        checks = lint(step, gen.output, c, s, { slots: gen.slots });
        rv = await review(step, c, s, sop, gen.output, checks);
        usage = add(usage, rv.usage);
      }
      aiReview = rv.data;
      if (rv.data.verdict === 'pass') { state = 'approved'; decidedBy = 'ai'; }
    } catch (e: any) {
      checks = [...checks, { level: 'warn', msg: `AI 검수를 실행하지 못해 사람 검수로 넘김: ${String(e.message).slice(0, 120)}` }];
    }
  }
  if (gen.tried?.length) checks = [...checks, { level: 'warn', msg: `제공자 전환: ${gen.tried.map((t: any) => `${t.provider} 실패`).join(' → ')} → ${gen.provider} 사용` }];

  const t = now();
  await setStep(contentId, step, {
    state, decided_by: decidedBy, decided_at: decidedBy ? t : null,
    decision_note: decidedBy === 'ai' ? aiReview?.summary ?? null : null,
    ai_notes: gen.judge ? { ...(gen.notes || {}), judge: gen.judge } : gen.notes, ai_review: aiReview, checks, feedback: null, finished_at: t, ai_output: gen.output ?? null,
    provider: gen.provider ?? null, model: gen.model ?? null,
    ai_input: gen.input ?? null, sop_hash: sopHash(sop.content), freedom: sop.freedom, candidates: gen.candidates ?? 1, refs: gen.refs ?? null,
    pred_score: gen.pred_score ?? (aiReview?.score != null ? Math.round((Number(aiReview.score) / 20) * 10) / 10 : null),
    attempts: row.attempts + 1 + extra,
    work_ms: Number(row.work_ms) + (Date.now() - t0),
    input_tokens: Number(row.input_tokens) + usage.input,
    output_tokens: Number(row.output_tokens) + usage.output,
  });
  await markStale(contentId, step);
  await syncCurrent(contentId);
  await log(contentId, step, 'done', `${gen.provider || '-'} · ${state === 'approved' ? `승인(${decidedBy})` : '검수 대기'}`);
  await notify(state === 'approved' ? 'step_done' : 'step_review', { contentId, step });
  await exportNow(() => exportRun(contentId, step));
  return { step, state, decided_by: decidedBy, provider: gen.provider, model: gen.model, checks, ai_review: aiReview };
}

// ── 단계 실행 (서버 LLM 체인) ───────────────────────────────────────
export async function runStep(step: StepKey, contentId: string, opts: { feedback?: string; force?: boolean; provider?: string } = {}) {
  const def = stepDef(step);
  if (!def || def.kind !== 'ai') throw new Error(`'${step}' 는 AI 단계가 아닙니다 (렌더·업로드는 워커가 실행)`);
  const c = await loadContent(contentId);
  const rows = await ensureSteps(contentId);
  const blocked = depsBlocked(step, rows);
  if (blocked.length && !opts.force) throw new Error(`상위 단계 승인이 필요합니다: ${blocked.map((d) => stepDef(d).label).join(', ')}`);

  const [s, sop] = await Promise.all([getSettings(), getSop(step)]);
  const row = rows[step];
  const feedback = opts.feedback || row.feedback || null;
  const t0 = Date.now();
  await setStep(contentId, step, { state: 'running', started_at: now(), attempts: row.attempts + 1, ai_review: null });
  await log(contentId, step, 'running', feedback ? `피드백 반영: ${feedback.slice(0, 80)}` : undefined);

  try {
    const gen = await generate(step, c, s, sop, feedback, opts.provider);
    return await settle(step, contentId, row, s, sop, gen, t0,
      async (fb) => generate(step, await loadContent(contentId), s, sop, fb, opts.provider));
  } catch (e: any) {
    await setStep(contentId, step, { state: 'failed', finished_at: now(), work_ms: Number(row.work_ms) + (Date.now() - t0) });
    await sbAdmin().from('contents').update({ error: `[${step}] ${e.message}` }).eq('id', contentId);
    await log(contentId, step, 'failed', e.message);
    await notify('step_failed', { contentId, step, message: e.message });
    await exportNow(() => exportRun(contentId, step, e.message));
    throw e;
  }
}

// ── 에이전트 직접 작업: Codex·Claude Code·오픈소스 에이전트가 스스로 산출물을 만든다 ──
/** 지시문(시스템+작업+출력 형식)을 내려준다. 서버 API 키 없이도 단계 진행 가능 */
export async function stepBrief(step: StepKey, contentId: string, feedback?: string) {
  if (stepDef(step)?.kind !== 'ai') throw new Error('AI 단계만 가능합니다');
  const c = await loadContent(contentId);
  const rows = await ensureSteps(contentId);
  const blocked = depsBlocked(step, rows);
  if (blocked.length) throw new Error(`상위 단계 승인이 필요합니다: ${blocked.map((d) => stepDef(d).label).join(', ')}`);
  const [s, sop] = await Promise.all([getSettings(), getSop(step)]);
  const prep = await prepare(step, c, s, sop, feedback || rows[step].feedback || null);
  return {
    step, content_id: contentId, needs_web_search: prep.webSearch, freedom: sop.freedom, gate: sop.gate,
    system: prep.system, task: prep.prompt,
    how_to_submit: '위 system 과 task 를 따라 JSON 하나를 만든 뒤 step_submit(content_id, step, output, agent) 으로 제출. 제출하면 규칙 검사와 결정 방식이 적용됩니다.' +
      (prep.webSearch ? ' 조사 단계는 반드시 실제 웹 검색으로 확인한 공식 출처 URL만 facts 에 넣으세요.' : ''),
  };
}

/** 에이전트가 만든 산출물 제출 → 후처리·규칙 검사·게이트 적용 */
export async function stepSubmit(step: StepKey, contentId: string, output: any, agent = 'agent') {
  if (stepDef(step)?.kind !== 'ai') throw new Error('AI 단계만 가능합니다');
  const c = await loadContent(contentId);
  const rows = await ensureSteps(contentId);
  const blocked = depsBlocked(step, rows);
  if (blocked.length) throw new Error(`상위 단계 승인이 필요합니다: ${blocked.map((d) => stepDef(d).label).join(', ')}`);
  const [s, sop] = await Promise.all([getSettings(), getSop(step)]);
  const row = rows[step];
  const t0 = Date.now();
  const prep = await prepare(step, c, s, sop, null);
  const gen = await finalize(step, c, s, output, prep);
  return settle(step, contentId, row, s, sop, { ...gen, provider: `agent:${String(agent).slice(0, 30)}`, model: undefined, input: { system: prep.system, prompt: prep.prompt }, refs: prep.refs }, t0);
}

// ── 결정: 사람 승인/반려 ────────────────────────────────────────────
export async function decide(step: StepKey, contentId: string, decision: 'approve' | 'reject', note = '', by: 'human' | 'ai' = 'human') {
  const rows = await ensureSteps(contentId);
  const row = rows[step];
  if (!row) throw new Error('알 수 없는 단계');
  if (!['review', 'stale', 'rejected', 'approved'].includes(row.state)) throw new Error(`현재 상태(${row.state})에서는 결정할 수 없습니다`);
  const t = now();
  const wait = row.finished_at && row.state === 'review' ? Math.max(0, Date.now() - new Date(row.finished_at).getTime()) : 0;
  if (decision === 'approve') {
    if (step === 'landing' || stepDef(step).kind === 'ai') {
      const c = await loadContent(contentId);
      if ((await getOutput(step, c)) == null) throw new Error('산출물이 없습니다');
    }
    await setStep(contentId, step, { state: 'approved', decided_by: by, decided_at: t, decision_note: note || null, wait_ms: Number(row.wait_ms) + wait });
  } else {
    await setStep(contentId, step, { state: 'rejected', decided_by: by, decided_at: t, decision_note: note || null, feedback: note || null, wait_ms: Number(row.wait_ms) + wait });
  }
  await log(contentId, step, decision === 'approve' ? 'approved' : 'rejected', `${by}${note ? ': ' + note.slice(0, 100) : ''}`);
  await syncCurrent(contentId);
  // 사람이 고친 뒤 승인 → AI 원본과 최종본의 차이를 학습 재료(수정 예)로 자동 저장
  let learned = false;
  if (decision === 'approve' && by === 'human' && stepDef(step).kind === 'ai') {
    learned = await recordEditExemplar(step, contentId, row.ai_output, note).catch(() => false);
  }
  await exportNow(() => exportRun(contentId, step));
  const lc = learned ? await learnCounts(step).catch(() => null) : null;
  return { step, state: decision === 'approve' ? 'approved' : 'rejected', learned_edit: learned, should_propose: !!lc?.should_propose };
}

// ── 결정: AI 에게 판단 맡기기 ───────────────────────────────────────
export async function aiDecide(step: StepKey, contentId: string, apply = false) {
  if (stepDef(step).kind !== 'ai') throw new Error('영상 검수는 사람이 확인해야 합니다');
  const c = await loadContent(contentId);
  const rows = await ensureSteps(contentId);
  const [s, sop] = await Promise.all([getSettings(), getSop(step)]);
  const output = await getOutput(step, c);
  if (output == null) throw new Error('산출물이 없습니다');
  const checks = lint(step, output, c, s, { slots: step === 'landing' ? await slotsFor(contentId) : undefined });
  const rv = await review(step, c, s, sop, output, checks);
  const row = rows[step];
  await setStep(contentId, step, {
    ai_review: rv.data, checks,
    input_tokens: Number(row.input_tokens) + rv.usage.input, output_tokens: Number(row.output_tokens) + rv.usage.output,
  });
  if (rv.data.verdict === 'pass') {
    await decide(step, contentId, 'approve', rv.data.summary || 'AI 검수 통과', 'ai');
    return { step, state: 'approved', ai_review: rv.data };
  }
  if (apply && rv.data.feedback) return runStep(step, contentId, { feedback: rv.data.feedback, force: true });
  return { step, state: row.state, ai_review: rv.data };
}

// ── 사람이 산출물을 직접 고친 뒤 호출 ────────────────────────────────
export async function onEdited(step: StepKey, contentId: string) {
  const rows = await ensureSteps(contentId);
  const c = await loadContent(contentId);
  const s = await getSettings();
  const output = await getOutput(step, c);
  const checks = lint(step, output, c, s, { slots: step === 'landing' ? await slotsFor(contentId) : undefined });
  const row = rows[step];
  await setStep(contentId, step, {
    checks,
    ...(row.state === 'approved' || row.state === 'stale' || row.state === 'pending' || row.state === 'failed'
      ? { state: 'review', decided_by: null, decided_at: null, finished_at: now() }
      : {}),
  });
  await markStale(contentId, step);
  await syncCurrent(contentId);
  await log(contentId, step, 'edited', '사람이 직접 수정');
}

// ── 다음 단계 1개 진행 (원클릭·워커·MCP 공용) ───────────────────────
export async function advance(contentId: string) {
  const rows = await ensureSteps(contentId);
  for (const d of STEP_DEFS) {
    const st = rows[d.key].state;
    if (st === 'approved') continue;
    if (st === 'review') return { step: d.key, action: 'wait_review' as const, message: `'${d.label}' 검수 대기 중` };
    if (st === 'running') return { step: d.key, action: 'running' as const, message: `'${d.label}' 작업 중` };
    if (d.kind === 'worker') return { step: d.key, action: 'worker' as const, message: `'${d.label}' 는 워커가 실행합니다` };
    const r = await runStep(d.key, contentId);
    return { step: d.key, action: r.state === 'approved' ? ('continue' as const) : ('wait_review' as const), state: r.state, message: `'${d.label}' ${r.state === 'approved' ? '승인' : '검수 대기'}` };
  }
  return { step: null, action: 'done' as const, message: '모든 단계 완료' };
}

export async function requireApproved(contentId: string, step: StepKey) {
  const rows = await ensureSteps(contentId);
  const blocked = stepDef(step).deps.filter((d) => rows[d]?.state !== 'approved');
  if (blocked.length) throw new Error(`승인이 필요한 단계: ${blocked.map((d) => stepDef(d).label).join(', ')}`);
}
