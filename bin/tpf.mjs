#!/usr/bin/env node
/**
 * tpf — 오늘의 정책자금 공장 CLI (의존성 없음, Node 18+)
 * 어떤 에이전트(Codex · Claude Code · OpenCode · aider …)든 셸에서 같은 방식으로 공장을 조작한다.
 * 내부적으로 사이트의 MCP 엔드포인트(/api/mcp)를 호출하므로 MCP 연결이 안 되는 환경에서도 동작.
 *
 *   환경변수(.env.tpf 또는 .env.local 에서도 읽음): TPF_URL=https://사이트  MCP_TOKEN=...
 */
import fs from 'node:fs';
import path from 'node:path';

for (const f of ['.env.tpf', '.env.local']) {
  try {
    for (const line of fs.readFileSync(path.join(process.cwd(), f), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* 파일 없음 */ }
}
const URL_ = (process.env.TPF_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
const TOKEN = process.env.MCP_TOKEN || '';

const HELP = `tpf <명령> [인자] [--옵션]

현황
  board                              현황판 (콘텐츠별 단계 상태)
  waiting                            지금 결정이 필요한 것만
  get <id> [step]                    콘텐츠 요약 / 단계 산출물 전문
  metrics [--days 30]                작업 효율
  providers                          서버 AI 제공자 상태·전환 순서

제작
  new [주제]                         새 콘텐츠
  advance <id> [--loop]              다음 단계 진행 (--loop: 사람 결정 지점까지)
  run <id> <step> [--feedback "…"] [--provider claude|openai|oss]
  approve <id> <step> [--note "…"]   승인
  reject <id> <step> --note "…"      반려 (사유 = 다음 재생성 지시)
  ai-decide <id> <step> [--apply]    AI 검수자에게 판단 위임
  render <id>                        렌더 요청 (3~6분)
  publish <id> [--targets youtube,instagram]

에이전트 직접 작업 (서버 API 키 없이, 지금 이 에이전트가 산출물을 만든다)
  brief <id> <step> [--feedback "…"] 지시문(system·task·출력 형식) 받기
  submit <id> <step> <file.json> [--agent codex]   만든 JSON 제출
  set-output <id> <step> <file.json> 산출물 직접 교체

평가 · SOP 학습 (점수 → 생성 최적화 · SOP 보완)
  rate <id> <step> <1-5> [--tags 훅강함,숫자명확] [--note "이유"]   결과물 평가 (같은 산출물이면 갱신)
  tags <step>                              평가 태그 후보
  good <id> <step> [--note …] | bad <id> <step> --note …   (이전 방식: 4점 / 2점)
  notes <step>                             지금까지의 학습 노트 (md)
  consolidate <step> [--instruction "…"] [--force]   누적 학습으로 SOP 전체 재정리안
  learn [step]                             학습 재료 현황 (step 없으면 전체)
  learn <step> --propose [--force]         지금 SOP 보완 제안 만들기
  proposals [step] [--status pending]      제안 목록
  proposal apply <pid> [--only 0,2] [--note …]   선택 반영 (번호는 0부터)
  proposal reject <pid> [--note …] | proposal revert <pid>
  proposal apply <pid> [--file 다듬은.md] [--force]   (재정리안)

데이터 내보내기 (GitHub data 브랜치 · 구글 시트)
  export status | export flush | export rebuild

SOP
  sop list | sop get <step> | sop set <step> [--file f.md] [--freedom 0-3] [--gate manual|ai|auto] [--provider auto|claude|openai|oss] [--note "…"]

단계: research plan script offer landing design copy post render publish
id 자리에 'latest' 를 쓰면 가장 최근 콘텐츠.`;

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; flags[k] = v; }
  else pos.push(argv[i]);
}
const [cmd, a1, a2, a3] = pos;

let rid = 0;
async function call(name, args = {}) {
  if (!URL_ || !TOKEN) { console.error('TPF_URL 과 MCP_TOKEN 환경변수가 필요합니다 (.env.tpf 에 적어도 됩니다).'); process.exit(2); }
  const res = await fetch(`${URL_}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method: 'tools/call', params: { name, arguments: args } }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error?.message || j.error || `HTTP ${res.status}`);
  const text = j.result?.content?.[0]?.text ?? '';
  if (j.result?.isError) throw new Error(text.replace(/^오류: /, ''));
  try { return JSON.parse(text); } catch { return text; }
}
const out = (v) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const need = (v, what) => { if (!v) { console.error(`${what} 가 필요합니다.\n`); console.error(HELP); process.exit(2); } return v; };
const readJson = (f) => JSON.parse(fs.readFileSync(need(f, 'JSON 파일 경로'), 'utf8'));
async function id(v) {
  need(v, '콘텐츠 id');
  if (v !== 'latest') return v;
  const b = await call('factory_board');
  if (!b.length) throw new Error('콘텐츠가 없습니다');
  return b[0].id;
}

async function main() {
  switch (cmd) {
    case 'board': return out(await call('factory_board'));
    case 'waiting': {
      const b = await call('factory_board');
      return out(b.filter((c) => c.steps[c.current_step] === 'review').map((c) => ({ id: c.id, topic: c.topic, waiting_step: c.current_step })));
    }
    case 'get': return out(await call('content_get', { content_id: await id(a1), ...(a2 ? { step: a2 } : {}) }));
    case 'metrics': return out(await call('factory_metrics', { days: Number(flags.days || 30) }));
    case 'providers': return out(await call('providers_status'));
    case 'new': return out(await call('content_create', { topic: pos.slice(1).join(' ') }));
    case 'advance': {
      const cid = await id(a1);
      for (let i = 0; i < 12; i++) {
        const r = await call('pipeline_advance', { content_id: cid });
        out(r);
        if (!(flags.loop && r.action === 'continue')) return;
      }
      return;
    }
    case 'run': return out(await call('step_run', { content_id: await id(a1), step: need(a2, 'step'), ...(flags.feedback ? { feedback: flags.feedback } : {}), ...(flags.provider ? { provider: flags.provider } : {}) }));
    case 'approve': return out(await call('step_decide', { content_id: await id(a1), step: need(a2, 'step'), decision: 'approve', note: flags.note || '' }));
    case 'reject': return out(await call('step_decide', { content_id: await id(a1), step: need(a2, 'step'), decision: 'reject', note: need(flags.note, '--note (반려 사유)') }));
    case 'ai-decide': return out(await call('step_ai_decide', { content_id: await id(a1), step: need(a2, 'step'), apply: !!flags.apply }));
    case 'render': return out(await call('render_request', { content_id: await id(a1) }));
    case 'publish': return out(await call('publish_request', { content_id: await id(a1), ...(flags.targets ? { targets: String(flags.targets).split(',') } : {}) }));
    case 'brief': return out(await call('step_brief', { content_id: await id(a1), step: need(a2, 'step'), ...(flags.feedback ? { feedback: flags.feedback } : {}) }));
    case 'submit': return out(await call('step_submit', { content_id: await id(a1), step: need(a2, 'step'), output: readJson(a3), agent: flags.agent || process.env.TPF_AGENT || 'agent' }));
    case 'set-output': return out(await call('step_update_output', { content_id: await id(a1), step: need(a2, 'step'), output: readJson(a3) }));
    case 'good':
    case 'bad': {
      if (cmd === 'bad') need(flags.note, '--note (아쉬운 점)');
      const r = await call('exemplar_mark', { content_id: await id(a1), step: need(a2, 'step'), kind: cmd, note: flags.note || '' });
      out({ saved: r.exemplar?.id, counts: r.counts, learn_min: r.learn_min, should_propose: r.should_propose });
      if (r.should_propose) console.log(`→ 학습 재료가 충분합니다: tpf learn ${a2} --propose`);
      return;
    }
    case 'rate': {
      const r = await call('output_rate', { content_id: await id(a1), step: need(a2, 'step'), score: Number(need(a3, '점수 1~5')), ...(flags.tags ? { tags: String(flags.tags).split(',') } : {}), note: flags.note || '' });
      out({ saved: r.exemplar?.id, score: r.exemplar?.score, tags: r.exemplar?.tags, updated: r.updated, counts: r.counts, should_propose: r.should_propose });
      if (r.should_propose) console.log(`→ 학습 재료가 충분합니다: tpf learn ${a2} --propose`);
      return;
    }
    case 'tags': return out(await call('rating_tags', { step: need(a1, 'step') }));
    case 'notes': return out(await call('learning_notes', { step: need(a1, 'step') }));
    case 'consolidate': return out(await call('sop_consolidate', { step: need(a1, 'step'), ...(flags.instruction ? { instruction: flags.instruction } : {}), force: !!flags.force }));
    case 'export': return out(await call('data_export', { action: a1 || 'status' }));
    case 'learn':
      if (a1 && flags.propose) return out(await call('sop_learn_propose', { step: a1, force: !!flags.force }));
      return out(await call('sop_learn_status', a1 ? { step: a1 } : {}));
    case 'proposals': return out(await call('sop_proposals', { ...(a1 ? { step: a1 } : {}), ...(flags.status ? { status: flags.status } : {}) }));
    case 'proposal': {
      const pid = Number(need(a2, '제안 번호'));
      if (a1 === 'apply') return out(await call('sop_proposal_decide', { id: pid, decision: 'apply', ...(flags.only ? { selected: String(flags.only).split(',').map(Number) } : {}), ...(flags.file ? { content: fs.readFileSync(flags.file, 'utf8') } : {}), force: !!flags.force, note: flags.note || 'CLI' }));
      if (a1 === 'reject' || a1 === 'revert') return out(await call('sop_proposal_decide', { id: pid, decision: a1, note: flags.note || '' }));
      break;
    }
    case 'sop': {
      if (a1 === 'list') return out(await call('sop_list'));
      if (a1 === 'get') { const s = await call('sop_get', { step: need(a2, 'step') }); return flags.json ? out(s) : out(`# 자유도 ${s.freedom} · 결정 ${s.gate} · 제공자 ${s.provider || 'auto'}\n\n${s.content}`); }
      if (a1 === 'set') return out(await call('sop_update', {
        step: need(a2, 'step'),
        ...(flags.file ? { content: fs.readFileSync(flags.file, 'utf8') } : {}),
        ...(flags.freedom !== undefined ? { freedom: Number(flags.freedom) } : {}),
        ...(flags.gate ? { gate: flags.gate } : {}), ...(flags.provider ? { provider: flags.provider } : {}),
        note: flags.note || 'CLI',
      }));
    }
    // fallthrough
    default: console.log(HELP); process.exit(cmd && cmd !== 'help' ? 2 : 0);
  }
}
main().catch((e) => { console.error('오류:', e.message); process.exit(1); });
