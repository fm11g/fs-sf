import { commitFiles, dataRepoConfig, type DataFile } from './github-data';
import { appendRows, sheetsMode } from './sheets';
import { getOutput, getSettings } from './settings';
import { sbAdmin } from './supabase/server';
import { STEP_DEFS, stepDef, type StepKey } from './steps';
import { FEATURE_COLUMNS, features, tierOf } from './tags';
import { summarize } from './email';
import { learningData } from './learn-data';
import { learningNotesMd } from './learn-notes';
import { getSop } from './sop';

/**
 * 모든 결과물·중간 데이터 → GitHub(data 브랜치) + 구글 시트
 *  - 이벤트(단계 실행·결정·평가·SOP 변경)마다 큐에 넣고 바로 비운다(flush). 실패하면 남아서 재시도
 *  - 하루 1회 데이터셋(학습용 JSONL)·색인 CSV·학습 노트를 다시 만든다
 *
 * data/
 *   runs/YYYY/MM/<slug>/<NN-step>-a<시도>.json        모든 단계 실행: 입력(지시문)·출력·특징·검사·결정
 *   ratings/<step>/<gold|silver|neutral|negative>/…   점수 매긴 결과물 (등급별 폴더)
 *   pairs/<step>/…                                     사람이 고친 예 (AI 원본 ↔ 최종본)
 *   datasets/<step>/sft.jsonl · preference.jsonl · negative.jsonl
 *   index/ratings.csv · index/summary.json
 *   learnings/<NN-step>.md · sop/<NN-step>.md · sop-history/<step>/…
 */

const J = (v: any) => JSON.stringify(v, null, 2);
const kst = (iso?: string | null) => new Date(new Date(iso || Date.now()).getTime() + 9 * 3600e3).toISOString();
const ymd = (iso?: string | null) => kst(iso).slice(0, 10);
const flat = (pairs: [string, any][]) => pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' / ') : String(v).replace(/<[^>]+>/g, '')}`).join(' | ');

export const paths = {
  run: (c: any, step: string, attempt: number) => { const t = kst(c.created_at); return `data/runs/${t.slice(0, 4)}/${t.slice(5, 7)}/${c.slug}/${stepDef(step).no}-${step}-a${attempt || 1}.json`; },
  rating: (e: any, slug: string) => e.kind === 'edit' && e.score == null
    ? `data/pairs/${e.step}/${slug || ymd(e.created_at)}-r${e.id}.json`
    : `data/ratings/${e.step}/${tierOf(e.score)}/${slug || ymd(e.created_at)}-r${e.id}.json`,
};

const SHEET = {
  outputs: ['기록시각', '콘텐츠ID', '슬러그', '주제', '단계', '시도', '상태', '결정', '제공자', '모델', 'SOP버전', '자유도', '후보수', 'AI예측점수', '오류수', '경고수', '작업초', '입력토큰', '출력토큰', '요약', 'GitHub경로', '산출물JSON', ...FEATURE_COLUMNS],
  ratings: ['기록시각', '평가ID', '콘텐츠ID', '슬러그', '주제', '단계', '점수', '등급', '종류', '내태그', '메모', '제공자', '모델', 'SOP버전', '사람수정', 'GitHub경로', ...FEATURE_COLUMNS],
  sop_changes: ['기록시각', '제안ID', '단계', '종류', '상태', '결정', '요약', '변경수', '반영수', '변경내용', 'GitHub경로'],
  performance: ['기준일', '슬러그', '주제', '게시일', '랜딩조회', '버튼클릭', '신청', '전환율(%)', '평균점수', '평가수', '유튜브'],
};

async function enqueue(kind: string, ref: string, p: { files?: DataFile[]; message?: string; sheet?: { tab: keyof typeof SHEET; rows: any[][] } }) {
  const s = await getSettings();
  const rows: any[] = [];
  if (s.export_github !== false && p.files?.length && dataRepoConfig(s).repo) rows.push({ target: 'github', kind, ref, payload: { files: p.files, message: p.message || `data: ${kind} ${ref}` } });
  if (s.export_sheets && p.sheet && sheetsMode(s)) rows.push({ target: 'sheets', kind, ref, payload: { tab: p.sheet.tab, header: SHEET[p.sheet.tab], rows: p.sheet.rows } });
  if (rows.length) await sbAdmin().from('export_queue').insert(rows);
  return rows.length;
}

// ── 레코드 빌더 ──────────────────────────────────────────────────────
/** 단계 실행 1건 (AI 단계는 지시문·산출물, 렌더/업로드는 결과 메타) */
export async function exportRun(contentId: string, step: StepKey, error?: string) {
  const db = sbAdmin();
  const [{ data: c }, { data: row }] = await Promise.all([
    db.from('contents').select('*').eq('id', contentId).single(),
    db.from('steps').select('*').eq('content_id', contentId).eq('step', step).maybeSingle(),
  ]);
  if (!c || !row) return 0;
  const output = stepDef(step).kind === 'ai'
    ? await getOutput(step, c)
    : { video_url: c.video_url, thumbnail_url: c.thumbnail_url, audio: c.audio, youtube_id: c.youtube_id, instagram_id: c.instagram_id, published_at: c.published_at };
  const feat = features(step, output, { c, row });
  const path = paths.run(c, step, row.attempts);
  const rec = {
    type: 'run', recorded_at: new Date().toISOString(),
    content: { id: c.id, slug: c.slug, topic: c.topic }, step, no: stepDef(step).no, attempt: row.attempts,
    state: row.state, decided_by: row.decided_by, decision_note: row.decision_note,
    provider: row.provider, model: row.model, sop_hash: row.sop_hash, freedom: row.freedom, candidates: row.candidates, pred_score: row.pred_score, refs: row.refs,
    features: feat, checks: row.checks, ai_review: row.ai_review, ai_notes: row.ai_notes,
    usage: { input_tokens: row.input_tokens, output_tokens: row.output_tokens, work_ms: row.work_ms, wait_ms: row.wait_ms },
    error: error || null, input: row.ai_input || null, output,
  };
  const checks = row.checks || [];
  return enqueue('run', `${contentId}:${step}`, {
    files: [{ path, content: J(rec) }],
    message: `data(run): ${c.slug} ${stepDef(step).no}-${step} a${row.attempts} ${row.state}`,
    sheet: {
      tab: 'outputs', rows: [[
        kst(), c.id, c.slug, c.topic, `${stepDef(step).no} ${stepDef(step).label}`, row.attempts, row.state, row.decided_by || '', row.provider || '', row.model || '', row.sop_hash || '', row.freedom ?? '',
        row.candidates ?? '', row.pred_score ?? '', checks.filter((x: any) => x.level === 'error').length, checks.filter((x: any) => x.level === 'warn').length,
        Math.round(Number(row.work_ms || 0) / 1000), row.input_tokens, row.output_tokens, error ? `오류: ${error}` : flat(summarize(step, output, c)), path, output,
        ...FEATURE_COLUMNS.map((k) => feat[k] ?? ''),
      ]],
    },
  });
}

/** 평가 1건 (점수·태그·특징 + 생성 당시 입력/출력). 점수가 바뀌면 예전 등급 폴더 파일은 삭제 */
export async function exportRating(exemplarId: number, oldPath?: string | null) {
  const db = sbAdmin();
  const { data: e } = await db.from('exemplars').select('*').eq('id', exemplarId).single();
  if (!e) return 0;
  const { data: c } = e.content_id ? await db.from('contents').select('id, slug, topic').eq('id', e.content_id).maybeSingle() : { data: null as any };
  const path = paths.rating(e, c?.slug || '');
  if (e.github_path !== path) await db.from('exemplars').update({ github_path: path }).eq('id', e.id);
  const rec = {
    type: e.kind === 'edit' ? 'pair' : 'rating', id: e.id, created_at: e.created_at, updated_at: e.updated_at,
    content: c ? { id: c.id, slug: c.slug, topic: c.topic } : { topic: e.topic }, step: e.step,
    score: e.score, tier: tierOf(e.score), kind: e.kind, tags: e.tags, features: e.features, note: e.note, source: e.source,
    provider: e.provider, model: e.model, sop_hash: e.sop_hash, input: e.input, output: e.output, before: e.before,
  };
  const files: DataFile[] = [{ path, content: J(rec) }];
  const prev = oldPath || (e.github_path !== path ? e.github_path : null);
  if (prev && prev !== path) files.push({ path: prev, content: null });
  return enqueue('rating', String(e.id), {
    files, message: `data(rating): ${e.step} ★${e.score ?? '-'} r${e.id}`,
    sheet: {
      tab: 'ratings', rows: [[
        kst(), e.id, e.content_id || '', c?.slug || '', e.topic || '', `${stepDef(e.step).no} ${stepDef(e.step).label}`, e.score ?? '', tierOf(e.score), e.kind,
        (e.tags || []).join(', '), e.note || '', e.provider || '', e.model || '', e.sop_hash || '', e.kind === 'edit' ? 'Y' : '', path,
        ...FEATURE_COLUMNS.map((k) => e.features?.[k] ?? ''),
      ]],
    },
  });
}

/** SOP 변경(제안 반영·거절) + 현재 SOP 스냅샷 + 학습 노트 */
export async function exportSopChange(proposalId: number) {
  const db = sbAdmin();
  const { data: p } = await db.from('sop_proposals').select('*').eq('id', proposalId).single();
  if (!p) return 0;
  const step = p.step as StepKey;
  const no = stepDef(step).no;
  const hist = `data/sop-history/${step}/${ymd(p.decided_at || p.created_at)}-p${p.id}-${p.kind}-${p.status}.md`;
  const sop = await getSop(step);
  const L = await learningData(step);
  const body = [
    `# 제안 #${p.id} · ${no} ${stepDef(step).label} · ${p.kind === 'rewrite' ? '전체 재정리' : '줄 단위 보완'} · ${p.status}`,
    '', p.summary || '', '',
    '## 변경', ...(p.kind === 'rewrite' ? (p.changelog || []).map((x: any) => `- [${x.type}] ${x.detail}`) : (p.changes || []).map((x: any, i: number) => `- ${(p.applied_changes || []).includes(i) ? '✓' : '·'} [${x.op}] ${x.section}: ${x.target ? `"${x.target}" → ` : ''}${x.text || ''} — ${x.reason || ''}`)),
    '', `결정: ${p.decided_by || '-'} ${p.decided_note || ''}`, '',
    '## 반영 전 SOP', '```md', p.base_content || '', '```',
    ...(p.applied_content ? ['', '## 반영 후 SOP', '```md', p.applied_content, '```'] : []),
  ].join('\n');
  return enqueue('sop', String(p.id), {
    files: [
      { path: hist, content: body },
      { path: `data/sop/${no}-${step}.md`, content: sop.content },
      { path: `data/learnings/${no}-${step}.md`, content: learningNotesMd(L) },
    ],
    message: `data(sop): ${no}-${step} 제안 #${p.id} ${p.status}`,
    sheet: { tab: 'sop_changes', rows: [[kst(), p.id, `${no} ${stepDef(step).label}`, p.kind, p.status, p.decided_by || '', p.summary || '', (p.changes || []).length || (p.changelog || []).length, (p.applied_changes || []).length, p.kind === 'rewrite' ? p.changelog : p.changes, hist]] },
  });
}

// ── 큐 비우기 ────────────────────────────────────────────────────────
export async function flushExports(o: { limit?: number } = {}) {
  const db = sbAdmin();
  const s = await getSettings();
  // 10분 넘게 처리 중이면 멈춘 것으로 보고 되돌림
  await db.from('export_queue').update({ status: 'failed', error: '처리 중 중단됨' }).eq('status', 'processing').lt('created_at', new Date(Date.now() - 600e3).toISOString());
  const { data: cand } = await db.from('export_queue').select('id').in('status', ['pending', 'failed']).lt('attempts', 6).order('id').limit(o.limit || 100);
  if (!cand?.length) return { github: 0, sheets: 0 };
  const { data: rows } = await db.from('export_queue').update({ status: 'processing' }).in('id', cand.map((x: any) => x.id)).in('status', ['pending', 'failed']).select('*');
  const items = rows || [];
  const res = { github: 0, sheets: 0, errors: [] as string[] };
  const done = async (ids: number[]) => ids.length && db.from('export_queue').update({ status: 'done', done_at: new Date().toISOString(), error: null }).in('id', ids);
  const fail = async (list: any[], err: string) => { for (const r of list) await db.from('export_queue').update({ status: 'failed', attempts: r.attempts + 1, error: err.slice(0, 400) }).eq('id', r.id); };

  const gh = items.filter((r: any) => r.target === 'github');
  if (gh.length) {
    try {
      const kinds = [...new Set(gh.map((r: any) => r.kind))];
      const msg = gh.length === 1 ? gh[0].payload.message : `data: ${kinds.map((k) => `${k}×${gh.filter((r: any) => r.kind === k).length}`).join(' ')}`;
      await commitFiles(gh.flatMap((r: any) => r.payload.files || []), msg, s);
      await done(gh.map((r: any) => r.id)); res.github = gh.length;
    } catch (e: any) { await fail(gh, e.message); res.errors.push(`github: ${e.message}`); }
  }
  const sh = items.filter((r: any) => r.target === 'sheets');
  const tabs = [...new Set(sh.map((r: any) => r.payload.tab))];
  for (const tab of tabs) {
    const list = sh.filter((r: any) => r.payload.tab === tab);
    try {
      await appendRows(tab, list[0].payload.header, list.flatMap((r: any) => r.payload.rows), s);
      await done(list.map((r: any) => r.id)); res.sheets += list.length;
    } catch (e: any) { await fail(list, e.message); res.errors.push(`sheets(${tab}): ${e.message}`); }
  }
  return res;
}

/** 파이프라인에서 호출: 기록하고 바로 비우기. 어떤 오류도 공정을 멈추지 않는다 */
export async function exportNow(fn: () => Promise<any>) {
  try { const n = await fn(); if (n) await flushExports({ limit: 30 }); } catch (e: any) { console.warn('내보내기 실패:', e?.message); }
}

// ── 하루 1회: 학습용 데이터셋·색인·학습 노트 재생성 ───────────────────
const csvCell = (v: any) => { const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const msg = (input: any) => [{ role: 'system', content: input?.system || '' }, { role: 'user', content: input?.prompt || '' }];

export async function rebuildDatasets() {
  const db = sbAdmin();
  const s = await getSettings();
  const { data: ex } = await db.from('exemplars').select('*').order('id').limit(5000);
  const all = ex || [];
  const slugOf = new Map<string, string>();
  const cids = [...new Set(all.map((e: any) => e.content_id).filter(Boolean))];
  for (let i = 0; i < cids.length; i += 200) {
    const { data } = await db.from('contents').select('id, slug').in('id', cids.slice(i, i + 200));
    for (const c of data || []) slugOf.set(c.id, c.slug);
  }
  const files: DataFile[] = [];
  const summary: any = { generated_at: new Date().toISOString(), steps: {} };

  for (const d of STEP_DEFS.filter((x) => x.kind === 'ai')) {
    const list = all.filter((e: any) => e.step === d.key);
    const withInput = list.filter((e: any) => e.input?.prompt);
    const sft = withInput.filter((e: any) => (e.score ?? 0) >= 4)
      .map((e: any) => ({ id: e.id, score: e.score, tier: tierOf(e.score), tags: e.tags, features: e.features, messages: [...msg(e.input), { role: 'assistant', content: JSON.stringify(e.output) }] }));
    const pref = withInput.filter((e: any) => e.kind === 'edit' && e.before)
      .map((e: any) => ({ id: e.id, score: e.score, note: e.note, input: { messages: msg(e.input) }, preferred_output: [{ role: 'assistant', content: JSON.stringify(e.output) }], non_preferred_output: [{ role: 'assistant', content: JSON.stringify(e.before) }] }));
    const neg = withInput.filter((e: any) => e.score != null && e.score <= 2)
      .map((e: any) => ({ id: e.id, score: e.score, note: e.note, tags: e.tags, messages: [...msg(e.input), { role: 'assistant', content: JSON.stringify(e.output) }] }));
    const jl = (a: any[]) => a.map((x) => JSON.stringify(x)).join('\n') + (a.length ? '\n' : '');
    files.push({ path: `data/datasets/${d.key}/sft.jsonl`, content: jl(sft) });
    files.push({ path: `data/datasets/${d.key}/preference.jsonl`, content: jl(pref) });
    files.push({ path: `data/datasets/${d.key}/negative.jsonl`, content: jl(neg) });
    const L = await learningData(d.key);
    files.push({ path: `data/learnings/${d.no}-${d.key}.md`, content: learningNotesMd(L) });
    files.push({ path: `data/sop/${d.no}-${d.key}.md`, content: (await getSop(d.key)).content });
    summary.steps[d.key] = { label: d.label, ratings: L.counts.rated, avg: L.avg, sft: sft.length, preference: pref.length, negative: neg.length, sop_trend: L.sopTrend.slice(-5), top_lift: L.lift.slice(0, 5) };
  }

  const head = ['id', 'created_at', 'step', 'score', 'tier', 'kind', 'tags', 'note', 'slug', 'topic', 'provider', 'model', 'sop_hash', 'source', 'github_path', ...FEATURE_COLUMNS];
  const csv = [head.join(','), ...all.map((e: any) => [e.id, e.created_at, e.step, e.score ?? '', tierOf(e.score), e.kind, (e.tags || []).join('|'), e.note, slugOf.get(e.content_id) || '', e.topic, e.provider, e.model, e.sop_hash, e.source, e.github_path,
    ...FEATURE_COLUMNS.map((k) => e.features?.[k] ?? '')].map(csvCell).join(','))].join('\n');
  files.push({ path: 'data/index/ratings.csv', content: '﻿' + csv + '\n' });
  files.push({ path: 'data/index/summary.json', content: J(summary) });
  files.push({ path: 'data/README.md', content: DATA_README });

  let commit: any = null;
  if (s.export_github !== false && dataRepoConfig(s).repo) commit = await commitFiles(files, `data(rebuild): 데이터셋·색인·학습 노트 ${ymd()}`, s);

  // 성과 스냅샷 → 시트
  let perf = 0;
  if (s.export_sheets && sheetsMode(s)) {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: pub } = await db.from('contents').select('id, slug, topic, published_at, youtube_id').not('published_at', 'is', null).gte('published_at', since);
    const slugs = (pub || []).map((c: any) => c.slug);
    const [{ data: ev }, { data: ld }] = slugs.length ? await Promise.all([
      db.from('events').select('content_slug, type').in('content_slug', slugs).limit(50000),
      db.from('leads').select('content_slug').in('content_slug', slugs),
    ]) : [{ data: [] as any[] }, { data: [] as any[] }];
    const rows = (pub || []).map((c: any) => {
      const v = (ev || []).filter((x: any) => x.content_slug === c.slug && x.type === 'view').length;
      const k = (ev || []).filter((x: any) => x.content_slug === c.slug && x.type === 'cta').length;
      const l = (ld || []).filter((x: any) => x.content_slug === c.slug).length;
      const sc = all.filter((e: any) => e.content_id === c.id && e.score != null);
      return [ymd(), c.slug, c.topic, ymd(c.published_at), v, k, l, v ? Math.round((l / v) * 1000) / 10 : '', sc.length ? Math.round((sc.reduce((a: number, e: any) => a + e.score, 0) / sc.length) * 100) / 100 : '', sc.length, c.youtube_id || ''];
    });
    if (rows.length) perf = await appendRows('performance', SHEET.performance, rows, s);
  }
  return { commit, files: files.length, performance_rows: perf, summary };
}

export async function exportStatus() {
  const db = sbAdmin();
  const s = await getSettings();
  const { data } = await db.from('export_queue').select('target, status, error, created_at').order('id', { ascending: false }).limit(300);
  const rows = data || [];
  const count = (t: string, st: string) => rows.filter((r: any) => r.target === t && r.status === st).length;
  const cfg = dataRepoConfig(s);
  return {
    github: { enabled: s.export_github !== false, repo: cfg.repo, branch: cfg.branch, ready: !!(cfg.repo && cfg.token), url: cfg.repo ? `https://github.com/${cfg.repo}/tree/${cfg.branch}/data` : null, done: count('github', 'done'), pending: count('github', 'pending') + count('github', 'processing'), failed: count('github', 'failed') },
    sheets: { enabled: !!s.export_sheets, mode: sheetsMode(s), done: count('sheets', 'done'), pending: count('sheets', 'pending') + count('sheets', 'processing'), failed: count('sheets', 'failed') },
    last_errors: rows.filter((r: any) => r.status === 'failed' && r.error).slice(0, 5).map((r: any) => ({ target: r.target, error: r.error, at: r.created_at })),
  };
}

const DATA_README = `# 오늘의 정책자금 — 학습 데이터

관리자 공장이 자동으로 커밋하는 브랜치입니다. 직접 수정하지 마세요(다음 동기화에서 덮어씁니다).

| 경로 | 내용 | 갱신 |
|---|---|---|
| runs/YYYY/MM/<슬러그>/<NN-단계>-a<시도>.json | 모든 단계 실행: 입력 지시문(system·prompt) · 산출물 · 특징 태그 · 규칙 검사 · AI 의견/검수 · 결정 · 토큰·시간 | 실행·결정 때마다 |
| ratings/<단계>/<등급>/… | 점수 매긴 결과물. 등급: gold(★5) · silver(★4) · neutral(★3) · negative(★1~2) | 평가 때마다 (점수 바뀌면 폴더 이동) |
| pairs/<단계>/… | 사람이 고친 예: before(AI 원본) ↔ output(최종본) | 수정 후 승인 때 |
| datasets/<단계>/sft.jsonl | ★4 이상 · chat 형식 {messages:[system,user,assistant]} — 지도 미세조정용 | 매일 |
| datasets/<단계>/preference.jsonl | 사람 수정 쌍 {input, preferred_output, non_preferred_output} — 선호 학습(DPO)용 | 매일 |
| datasets/<단계>/negative.jsonl | ★2 이하 + 이유 — 피할 예시 | 매일 |
| index/ratings.csv | 모든 평가 한 표 (점수 · 등급 · 내 태그 · 특징 태그 열 분리) | 매일 |
| index/summary.json | 단계별 평균 점수 · SOP 버전별 점수 · 점수를 올린 조건 | 매일 |
| learnings/<NN-단계>.md | 지금까지의 학습 노트 (SOP 정리 때 AI 가 읽는 원본) | SOP 변경·매일 |
| sop/<NN-단계>.md · sop-history/ | 현재 SOP 와 변경 이력(반영 전/후 전문) | SOP 변경 때 |

특징 태그(features): provider · model · sop(SOP 버전 해시) · freedom · candidates · hook_type · mood · scenes · chars · has_deadline · title_has_number … — 어떤 조건에서 점수가 높았는지 비교할 때 씁니다.
`;
