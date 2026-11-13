import { NextRequest, NextResponse } from 'next/server';
import { advance, aiDecide, decide, ensureSteps, getOutput, getSettings, newSlug, onEdited, requireApproved, runStep, stepBrief, stepSubmit } from '@/lib/pipeline';
import { providersStatus, resolveChain } from '@/lib/llm';
import { applyProposal, learnCounts, markExemplar, proposeSop, rejectProposal, revertProposal } from '@/lib/learn';
import { board, metrics } from '@/lib/ops';
import { getSop, listSops, saveSop } from '@/lib/sop';
import { dispatch } from '@/lib/github';
import { sbAdmin } from '@/lib/supabase/server';
import { AI_STEPS, STEP_DEFS, STEP_KEYS, stepDef, type StepKey } from '@/lib/steps';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * MCP 서버 (Streamable HTTP, stateless JSON) — Claude / Claude Code 에서 공장을 직접 조작
 *   claude mcp add --transport http tpf https://사이트/api/mcp --header "Authorization: Bearer $MCP_TOKEN"
 */
const str = { type: 'string' } as const;
const stepEnum = { type: 'string', enum: STEP_KEYS, description: STEP_DEFS.map((d) => `${d.key}=${d.label}`).join(', ') };
const obj = (properties: Record<string, any>, required: string[] = []) => ({ type: 'object', properties, required });

const TOOLS: { name: string; description: string; inputSchema: any; run: (a: any) => Promise<any> }[] = [
  { name: 'factory_board', description: '현황판: 최근 콘텐츠와 단계별 상태(pending/running/review/approved/rejected/stale/failed)', inputSchema: obj({}), run: async () => (await board(30)).map((c: any) => ({ id: c.id, slug: c.slug, topic: c.topic, current_step: c.current_step, steps: Object.fromEntries(Object.entries(c.steps).map(([k, v]: any) => [k, v.state])) })) },
  { name: 'factory_metrics', description: '작업 효율 지표: 단계별 작업·대기 시간, 재작업률, AI 결정 비율, 토큰 비용, 조회→신청 전환', inputSchema: obj({ days: { type: 'number' } }), run: (a) => metrics(a.days || 30) },
  { name: 'content_create', description: '새 숏폼 콘텐츠 생성. topic 을 비우면 조사 단계에서 AI가 주제를 고름', inputSchema: obj({ topic: str }), run: async (a) => {
    const { data, error } = await sbAdmin().from('contents').insert({ slug: newSlug(), topic: a.topic || null, status: 'working', current_step: 'research' }).select('id, slug').single();
    if (error) throw new Error(error.message);
    await ensureSteps(data.id);
    return data;
  } },
  { name: 'content_get', description: '콘텐츠의 단계 상태·AI 의견·검수 결과와 산출물 조회. step 을 주면 그 단계 산출물 전문', inputSchema: obj({ content_id: str, step: stepEnum }, ['content_id']), run: async (a) => {
    const { data: c } = await sbAdmin().from('contents').select('*').eq('id', a.content_id).single();
    if (!c) throw new Error('콘텐츠 없음');
    const steps = await ensureSteps(a.content_id);
    if (a.step) return { step: steps[a.step as StepKey], output: await getOutput(a.step, c) };
    return { id: c.id, slug: c.slug, topic: c.topic, current_step: c.current_step, video_url: c.video_url, youtube_id: c.youtube_id, instagram_id: c.instagram_id, error: c.error,
      steps: Object.fromEntries(STEP_KEYS.map((k) => [k, { state: steps[k].state, attempts: steps[k].attempts, decided_by: steps[k].decided_by, checks: steps[k].checks, ai_opinion: steps[k].ai_notes?.opinion, ai_review: steps[k].ai_review?.summary }])) };
  } },
  { name: 'step_run', description: 'AI 단계 실행(조사~정보글). feedback 을 주면 이전 산출물을 그 지시대로 고쳐 재생성. 상위 단계 승인이 필요', inputSchema: obj({ content_id: str, step: { type: 'string', enum: AI_STEPS }, feedback: str, provider: { type: 'string', enum: ['auto', 'claude', 'openai', 'oss'], description: '제공자 지정(실패 시 설정의 전환 순서로 넘어감)' } }, ['content_id', 'step']), run: (a) => runStep(a.step, a.content_id, { feedback: a.feedback, provider: a.provider }) },
  { name: 'step_brief', description: '에이전트 직접 작업 ①: 이 단계의 지시문(system + task + 출력 JSON 형식)을 받는다. 서버 AI 제공자가 없거나, 지금 대화 중인 에이전트(Codex·Claude Code·오픈소스)가 직접 산출물을 만들 때 사용', inputSchema: obj({ content_id: str, step: { type: 'string', enum: AI_STEPS }, feedback: str }, ['content_id', 'step']), run: (a) => stepBrief(a.step, a.content_id, a.feedback) },
  { name: 'step_submit', description: '에이전트 직접 작업 ②: step_brief 지시대로 만든 JSON 산출물을 제출. 규칙 검사와 결정 방식(사람/AI/자동)이 적용됨. agent 에 자기 이름(codex, claude-code, opencode 등)', inputSchema: obj({ content_id: str, step: { type: 'string', enum: AI_STEPS }, output: { type: 'object' }, agent: str }, ['content_id', 'step', 'output']), run: (a) => stepSubmit(a.step, a.content_id, a.output, a.agent) },
  { name: 'providers_status', description: '서버 AI 제공자(claude/openai/oss) 준비 상태와 전환 순서', inputSchema: obj({}), run: async () => { const s = await getSettings().catch(() => ({ llm_chain: undefined } as any)); return { ...providersStatus(), effective_chain: resolveChain(s.llm_chain) }; } },
  { name: 'step_decide', description: '단계 산출물 승인/반려. 반려 note 는 다음 재생성의 피드백으로 쓰임', inputSchema: obj({ content_id: str, step: stepEnum, decision: { type: 'string', enum: ['approve', 'reject'] }, note: str }, ['content_id', 'step', 'decision']), run: (a) => decide(a.step, a.content_id, a.decision, a.note || '', 'human') },
  { name: 'step_ai_decide', description: 'AI 검수자에게 판단을 맡김: SOP 체크리스트로 채점해 통과면 승인. apply=true 면 미달 시 피드백 반영 재생성', inputSchema: obj({ content_id: str, step: { type: 'string', enum: AI_STEPS }, apply: { type: 'boolean' } }, ['content_id', 'step']), run: (a) => aiDecide(a.step, a.content_id, !!a.apply) },
  { name: 'step_update_output', description: '단계 산출물을 직접 교체(JSON). 해당 단계는 검수 대기, 하위 단계는 재작업 필요가 됨', inputSchema: obj({ content_id: str, step: { type: 'string', enum: AI_STEPS }, output: { type: 'object' } }, ['content_id', 'step', 'output']), run: async (a) => {
    const db = sbAdmin();
    if (a.step === 'landing') await db.from('landing_variants').update({ values: a.output }).eq('content_id', a.content_id);
    else await db.from('contents').update({ [stepDef(a.step).field!]: a.output }).eq('id', a.content_id);
    await onEdited(a.step, a.content_id);
    return { ok: true };
  } },
  { name: 'pipeline_advance', description: '다음 단계 1개 진행. action 이 continue 면 다시 호출, wait_review 면 결정 필요, worker 면 render_request/publish_request', inputSchema: obj({ content_id: str }, ['content_id']), run: (a) => advance(a.content_id) },
  { name: 'sop_list', description: '단계별 SOP 요약(자유도·결정 방식)', inputSchema: obj({}), run: async () => (await listSops()).map((s) => ({ step: s.step, freedom: s.freedom, gate: s.gate, chars: s.content.length, is_default: !!s.isDefault })) },
  { name: 'sop_get', description: '단계 SOP(md) 전문', inputSchema: obj({ step: stepEnum }, ['step']), run: (a) => getSop(a.step) },
  { name: 'sop_update', description: 'SOP 수정: content(md 전문), freedom(0~3), gate(manual|ai|auto). 다음 실행부터 반영, 이력 저장', inputSchema: obj({ step: stepEnum, content: str, freedom: { type: 'number' }, gate: { type: 'string', enum: ['manual', 'ai', 'auto'] }, provider: { type: 'string', enum: ['auto', 'claude', 'openai', 'oss'] }, note: str }, ['step']), run: (a) => saveSop(a.step, { content: a.content, freedom: a.freedom, gate: a.gate, provider: a.provider }, a.note || 'MCP') },
  { name: 'exemplar_mark', description: '산출물을 👍 좋은 예(good) 또는 👎 아쉬운 예(bad)로 저장 → SOP 학습 재료. note 에 좋은/아쉬운 이유. should_propose 가 true 면 sop_learn_propose 를 호출할 때', inputSchema: obj({ content_id: str, step: { type: 'string', enum: AI_STEPS }, kind: { type: 'string', enum: ['good', 'bad'] }, note: str }, ['content_id', 'step', 'kind']), run: (a) => markExemplar(a.step, a.content_id, a.kind, a.note || '', 'mcp') },
  { name: 'sop_learn_status', description: '단계별 학습 재료 개수(좋은 예·수정 예·아쉬운 예)·대기 제안·제안 가능 여부', inputSchema: obj({ step: { type: 'string', enum: AI_STEPS } }), run: async (a) => a.step ? learnCounts(a.step) : Object.fromEntries(await Promise.all(AI_STEPS.map(async (k) => [k, await learnCounts(k)]))) },
  { name: 'sop_learn_propose', description: '좋은 결과물을 분석해 기존 SOP 대비 추가/수정/삭제 제안 생성 (learn_mode=auto 면 안전한 변경 자동 반영). 20~60초', inputSchema: obj({ step: { type: 'string', enum: AI_STEPS }, force: { type: 'boolean' } }, ['step']), run: (a) => proposeSop(a.step, { force: !!a.force }) },
  { name: 'sop_proposals', description: 'SOP 학습 제안 목록 (변경 번호·op·section·target·text·reason·근거)', inputSchema: obj({ step: { type: 'string', enum: AI_STEPS }, status: { type: 'string', enum: ['pending', 'applied', 'rejected', 'superseded'] } }), run: async (a) => {
    let q = sbAdmin().from('sop_proposals').select('id, step, status, summary, changes, patterns, exemplar_ids, created_at, decided_by').order('created_at', { ascending: false }).limit(20);
    if (a.step) q = q.eq('step', a.step);
    if (a.status) q = q.eq('status', a.status);
    return (await q).data || [];
  } },
  { name: 'sop_proposal_decide', description: 'SOP 학습 제안 처리. apply: selected(반영할 변경 번호, 0부터)·edits({번호: 새 문구}) 지정 가능 / reject / revert(반영 되돌리기). 운영자가 결정했을 때만 호출', inputSchema: obj({ id: { type: 'number' }, decision: { type: 'string', enum: ['apply', 'reject', 'revert'] }, selected: { type: 'array', items: { type: 'number' } }, edits: { type: 'object' }, note: str }, ['id', 'decision']), run: (a) =>
    a.decision === 'apply' ? applyProposal(a.id, { selected: a.selected, edits: a.edits, note: a.note, by: 'human' }) : a.decision === 'reject' ? rejectProposal(a.id, a.note) : revertProposal(a.id) },
  { name: 'render_request', description: '음성·자막·BGM·모션그래픽 렌더를 워커에 요청 (대사·디자인 승인 필요, 3~6분)', inputSchema: obj({ content_id: str }, ['content_id']), run: async (a) => {
    await requireApproved(a.content_id, 'render');
    await sbAdmin().from('steps').update({ state: 'running', started_at: new Date().toISOString() }).eq('content_id', a.content_id).eq('step', 'render');
    await dispatch('render', { content_id: a.content_id });
    return { ok: true };
  } },
  { name: 'publish_request', description: '유튜브·인스타 업로드를 워커에 요청 (렌더·카피·랜딩·정보글 승인 필요). 외부에 공개되는 작업', inputSchema: obj({ content_id: str, targets: { type: 'array', items: { type: 'string', enum: ['youtube', 'instagram'] } } }, ['content_id']), run: async (a) => {
    await requireApproved(a.content_id, 'publish');
    await sbAdmin().from('steps').update({ state: 'running', started_at: new Date().toISOString() }).eq('content_id', a.content_id).eq('step', 'publish');
    await dispatch('publish', { content_id: a.content_id, targets: a.targets || ['youtube', 'instagram'] });
    return { ok: true };
  } },
];

const rpc = (id: any, result: any) => ({ jsonrpc: '2.0', id, result });
const rpcErr = (id: any, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(m: any) {
  if (m.id === undefined) return null; // notification
  switch (m.method) {
    case 'initialize':
      return rpc(m.id, { protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'today-policy-fund', version: '0.4.0' },
        instructions: '오늘의 정책자금 숏폼 공장. factory_board 로 현황을 보고, pipeline_advance 로 진행, 검수 대기 단계는 content_get 으로 확인 후 step_decide. 서버 제공자가 없으면 step_brief → 직접 작성 → step_submit. publish_request 는 운영자가 명시적으로 요청할 때만.' });
    case 'ping': return rpc(m.id, {});
    case 'tools/list': return rpc(m.id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const t = TOOLS.find((x) => x.name === m.params?.name);
      if (!t) return rpcErr(m.id, -32602, `알 수 없는 도구: ${m.params?.name}`);
      try {
        const out = await t.run(m.params?.arguments || {});
        return rpc(m.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      } catch (e: any) {
        return rpc(m.id, { content: [{ type: 'text', text: `오류: ${e.message}` }], isError: true });
      }
    }
    default: return rpcErr(m.id, -32601, `지원하지 않는 메서드: ${m.method}`);
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.MCP_TOKEN;
  if (!token) return NextResponse.json({ error: 'MCP_TOKEN 환경변수가 설정되지 않았습니다' }, { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${token}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json(rpcErr(null, -32700, 'parse error'), { status: 400 });
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return out.length ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
  }
  const out = await handle(body);
  return out ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
}

export function GET() {
  return new NextResponse('MCP endpoint: POST JSON-RPC', { status: 405, headers: { Allow: 'POST' } });
}
