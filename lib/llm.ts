import Anthropic from '@anthropic-ai/sdk';
import { sbAdmin } from './supabase/server';
import { logUsage, type UsageCtx, type UsageRow } from './usage';
import { PROVIDER_PLATFORM } from './prices';
import { DEFAULT_CLAUDE, OPENAI_EFFORT, THINK_HEADROOM, resolveTask, type Effort, type ModelSettings } from './models';

/**
 * LLM 제공자 계층 — Claude → OpenAI → 오픈소스(OpenAI 호환) 순으로 자동 전환
 *  - claude : Anthropic Messages API (웹검색 도구 + MCP connector)
 *  - openai : OpenAI Responses API (web_search 도구)
 *  - oss    : OpenAI 호환 /chat/completions (Ollama · vLLM · OpenRouter · Groq · Together 등)
 *             웹검색이 없으므로 조사 단계는 외부 검색(Tavily/SearXNG) 결과를 주입
 * 한 제공자가 실패(키 없음·한도·장애·시간 초과·JSON 깨짐)하면 다음 제공자로 넘어간다.
 */
export type ProviderId = 'claude' | 'openai' | 'oss';
export type Usage = { input: number; output: number; cache_read?: number; cache_write?: number; searches?: number };
export type McpServer = { name: string; url: string; token?: string };
export type AskOpts = {
  system: string; prompt: string; webSearch?: boolean; mcp?: McpServer[]; maxTokens?: number;
  chain?: string[];           // 설정의 llm_chain
  prefer?: string | null;     // 단계별 지정 제공자 (auto/빈값이면 chain 순서)
  images?: string[];          // 이미지 URL (참고 영상 프레임 분석 등 — 비전 지원 모델)
  task?: string;              // 작업 키 (lib/models.ts TASKS) → 그 작업에 지정한 모델·생각 깊이 적용
  model?: string;             // Claude 모델 직접 지정 (task 설정보다 우선)
  effort?: Effort;            // 생각 깊이 직접 지정
  meta?: UsageCtx;            // 사용 기록부에 남길 산출물 정보 (콘텐츠·단계·참조 대상·실행자)
};
/** 한 번의 API 호출 기록 (성공·실패 모두) */
export type CallRecord = { provider: string; platform: string; model: string; effort: string | null; usage: Usage; ms: number; ok: boolean; error?: string; attempt: number };
/** 한 번의 호출에 실제로 쓰는 모델 설정 */
type Cfg = { claude: string; effort: Effort; openai: string; oss: string };
export type AskResult<T> = { data: T; usage: Usage; provider: ProviderId; model: string; effort: string | null; tried: { provider: string; error: string }[]; calls: CallRecord[]; cost_usd: number; priced: boolean; usage_ids: number[] };

const JSON_RULE = '\n\n반드시 마지막에 ```json 코드블록 하나로만 결과를 출력하세요. 코드블록 밖 설명은 최소화합니다.';
const TIMEOUT = Number(process.env.LLM_TIMEOUT_MS || 120000);
export const DEFAULT_CHAIN: ProviderId[] = ['claude', 'openai', 'oss'];

const MODELS = {
  claude: () => DEFAULT_CLAUDE,
  openai: () => process.env.OPENAI_MODEL || 'gpt-5.5',
  oss: () => process.env.OSS_MODEL || '',
};

// 작업별 모델 설정 (settings.value.models) — 20초 캐시
let msCache: { at: number; v: ModelSettings | null } = { at: 0, v: null };
export async function modelSettings(force = false): Promise<ModelSettings | null> {
  if (!force && Date.now() - msCache.at < 20_000) return msCache.v;
  try {
    const { data } = await sbAdmin().from('settings').select('value').eq('id', 1).single();
    msCache = { at: Date.now(), v: (data?.value as any)?.models || null };
  } catch { msCache = { at: Date.now(), v: null }; }
  return msCache.v;
}
export const clearModelCache = () => { msCache = { at: 0, v: null }; };

export function providersStatus() {
  const search = process.env.TAVILY_API_KEY ? 'tavily' : process.env.SEARXNG_URL ? 'searxng' : 'none';
  return {
    claude: { ready: !!process.env.ANTHROPIC_API_KEY, model: MODELS.claude(), web_search: true },
    openai: { ready: !!process.env.OPENAI_API_KEY, model: MODELS.openai(), web_search: process.env.OPENAI_WEB_SEARCH !== '0' },
    oss: { ready: !!(process.env.OSS_BASE_URL && process.env.OSS_MODEL), model: MODELS.oss(), base_url: process.env.OSS_BASE_URL || '', web_search: search !== 'none' },
    search_backend: search,
  };
}

export function resolveChain(chain?: string[], prefer?: string | null): ProviderId[] {
  const st = providersStatus();
  const base = (chain?.length ? chain : DEFAULT_CHAIN).filter((p): p is ProviderId => p === 'claude' || p === 'openai' || p === 'oss');
  const order = prefer && prefer !== 'auto' ? [prefer as ProviderId, ...base] : base;
  return [...new Set(order)].filter((p) => st[p]?.ready);
}

export function extractJSON<T>(text: string): T {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  const candidates = fences.length ? fences.map((m) => m[1]).reverse() : [];
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try { return JSON.parse(c.trim()); } catch { /* 다음 후보 */ }
  }
  throw new Error('응답에서 JSON을 찾지 못했습니다: ' + text.slice(0, 200));
}

// ── 외부 검색 (네이티브 웹검색이 없는 제공자용) ─────────────────────
type Hit = { title: string; url: string; content: string };
async function webSearch(query: string): Promise<Hit[]> {
  if (process.env.TAVILY_API_KEY) {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query, max_results: 5, search_depth: 'basic', country: 'south korea' }),
    });
    if (!r.ok) throw new Error(`Tavily ${r.status}`);
    return ((await r.json()).results || []).map((x: any) => ({ title: x.title, url: x.url, content: String(x.content || '').slice(0, 700) }));
  }
  if (process.env.SEARXNG_URL) {
    const u = `${process.env.SEARXNG_URL.replace(/\/$/, '')}/search?format=json&language=ko-KR&q=${encodeURIComponent(query)}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`SearXNG ${r.status}`);
    return ((await r.json()).results || []).slice(0, 5).map((x: any) => ({ title: x.title, url: x.url, content: String(x.content || '').slice(0, 700) }));
  }
  throw new Error('검색 수단 없음 (TAVILY_API_KEY 또는 SEARXNG_URL 필요)');
}

// ── 제공자별 호출: (system, prompt) → 텍스트 ─────────────────────────
type Raw = { text: string; usage: Usage; model?: string; effort?: Effort | null; extra?: UsageRow[] };

async function callClaude(o: AskOpts, cfg: Cfg): Promise<Raw> {
  const effort = cfg.effort;
  // 생각이 깊을수록 오래 걸림 → 제한 시간도 늘림 (Vercel 함수 300초 안쪽)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: ['high', 'xhigh', 'max'].includes(effort) ? 290_000 : TIMEOUT * 2, maxRetries: 1 });
  const servers = (o.mcp || []).filter((m) => m?.name && m?.url);
  const tools: any[] = [];
  if (o.webSearch) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'KR', timezone: 'Asia/Seoul' } });
  for (const m of servers) tools.push({ type: 'mcp_toolset', mcp_server_name: m.name });
  const base: any = {
    model: cfg.claude,
    // max_tokens = 생각 + 답변 합계 → 생각 깊이만큼 여유를 더함
    max_tokens: Math.min(64000, (o.maxTokens || 8000) + THINK_HEADROOM[effort]),
    system: o.system + JSON_RULE,
    messages: [{ role: 'user', content: o.images?.length ? [...o.images.map((url) => ({ type: 'image', source: { type: 'url', url } })), { type: 'text', text: o.prompt }] : o.prompt }],
    ...(tools.length ? { tools } : {}),
    ...(servers.length ? { mcp_servers: servers.map((m) => ({ type: 'url', name: m.name, url: m.url, ...(m.token ? { authorization_token: m.token } : {}) })) } : {}),
  };
  const opts = servers.length ? { headers: { 'anthropic-beta': 'mcp-client-2025-11-20' } } : undefined;
  const send = (body: any) => client.messages.stream(body, opts).finalMessage();
  let model = cfg.claude;
  let used: Effort | null = effort !== 'auto' ? effort : null;
  let res: any;
  try {
    // 생각 깊이 = output_config.effort (최신 모델은 생각이 항상 켜져 있고 깊이만 조절)
    res = await send(effort !== 'auto' ? { ...base, output_config: { effort } } : base);
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (effort !== 'auto' && /effort|output_config/i.test(msg) && e?.status === 400) {
      res = await send(base); used = null; // effort 를 지원하지 않는 모델 → 기본 생각으로
    } else if (e?.status === 404 && cfg.claude !== DEFAULT_CLAUDE) {
      model = DEFAULT_CLAUDE; // 계정에서 못 쓰는 모델 → 기본 모델로
      res = await send({ ...base, model, ...(effort !== 'auto' ? { output_config: { effort } } : {}) });
    } else throw e;
  }
  return {
    text: (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
    usage: {
      input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0, // 출력에 생각 토큰 포함
      cache_read: res.usage?.cache_read_input_tokens ?? 0, cache_write: res.usage?.cache_creation_input_tokens ?? 0,
      searches: res.usage?.server_tool_use?.web_search_requests ?? 0,
    },
    model, effort: used,
  };
}

async function callOpenAI(o: AskOpts, cfg: Cfg): Promise<Raw> {
  const re = OPENAI_EFFORT[cfg.effort];
  const native = o.webSearch && process.env.OPENAI_WEB_SEARCH !== '0';
  const post = (withReasoning: boolean) => fetch(`${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/responses`, {
    method: 'POST', signal: AbortSignal.timeout(native || (re && re !== 'low') ? TIMEOUT * 2 : TIMEOUT),
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: cfg.openai, instructions: o.system + JSON_RULE,
      ...(withReasoning && re ? { reasoning: { effort: re } } : {}),
      input: o.images?.length ? [{ role: 'user', content: [{ type: 'input_text', text: o.prompt }, ...o.images.map((u) => ({ type: 'input_image', image_url: u }))] }] : o.prompt,
      max_output_tokens: (o.maxTokens || 8000) + 4000, // 추론 토큰 여유
      ...(native ? { tools: [{ type: 'web_search' }] } : {}),
    }),
  });
  let r = await post(true);
  let j: any = await r.json().catch(() => ({}));
  let usedRe = !!re;
  if (!r.ok && re && r.status === 400 && /reasoning/i.test(j.error?.message || '')) { r = await post(false); j = await r.json().catch(() => ({})); usedRe = false; } // 추론 미지원 모델
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${j.error?.message || ''}`.slice(0, 200));
  const text = (j.output || []).filter((x: any) => x.type === 'message').flatMap((x: any) => x.content || [])
    .filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('\n');
  const cached = j.usage?.input_tokens_details?.cached_tokens ?? 0;
  return {
    text, model: cfg.openai, effort: usedRe ? cfg.effort : null,
    usage: { input: (j.usage?.input_tokens ?? 0) - cached, output: j.usage?.output_tokens ?? 0, cache_read: cached, searches: (j.output || []).filter((x: any) => x.type === 'web_search_call').length },
  };
}

async function chat(system: string, prompt: string, maxTokens: number, images?: string[], model = MODELS.oss()): Promise<Raw> {
  const r = await fetch(`${process.env.OSS_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(TIMEOUT),
    headers: { 'content-type': 'application/json', ...(process.env.OSS_API_KEY ? { Authorization: `Bearer ${process.env.OSS_API_KEY}` } : {}) },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.4,
      messages: [{ role: 'system', content: system }, { role: 'user', content: images?.length ? [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))] : prompt }],
      ...(process.env.OSS_JSON_MODE === '1' ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OSS ${r.status}: ${j.error?.message || JSON.stringify(j).slice(0, 120)}`);
  const text = String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, ''); // 추론 모델의 사고 블록 제거
  return { text, usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 } };
}

async function callOss(o: AskOpts, cfg: Cfg): Promise<Raw> {
  let prompt = o.prompt;
  const searchRows: UsageRow[] = [];
  let usage: Usage = { input: 0, output: 0 };
  if (o.webSearch) {
    // 1) 검색어 생성 → 2) 외부 검색 → 3) 결과를 근거로 주입
    const q = await chat('당신은 검색어를 만드는 조사 보조입니다.' + JSON_RULE,
      `아래 작업에 필요한 최신 정보를 찾기 위한 한국어 검색어 4개를 만드세요. 기관명·연도·"공고"를 포함합니다.\n\n${o.prompt.slice(0, 1500)}\n\nJSON: { "queries": [""] }`, 600, undefined, cfg.oss);
    usage = q.usage;
    let queries: string[] = [];
    try { queries = (extractJSON<any>(q.text).queries || []).slice(0, 4); } catch { /* 기본 검색어 사용 */ }
    if (!queries.length) queries = [`정책자금 공고 접수 ${new Date().getFullYear()}`, '중소벤처기업진흥공단 정책자금 신청'];
    const hits = (await Promise.all(queries.map((x) => webSearch(x).catch(() => [] as Hit[])))).flat();
    searchRows.push({ kind: 'search', platform: process.env.TAVILY_API_KEY ? 'tavily' : 'searxng', model: 'search', searches: queries.length, ok: hits.length > 0 });
    if (!hits.length) throw new Error('검색 결과 없음 — 조사 단계는 검색 수단이 필요합니다 (TAVILY_API_KEY 또는 SEARXNG_URL)');
    const uniq = [...new Map(hits.map((h) => [h.url, h])).values()].slice(0, 14);
    prompt += `\n\n## 검색 결과 (아래 URL만 출처로 사용. 여기에 없는 숫자·사실은 쓰지 말고 "공고 확인 필요"로 둡니다)\n` +
      uniq.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`).join('\n\n');
  }
  const res = await chat(o.system + JSON_RULE, prompt, o.maxTokens || 8000, o.images, cfg.oss);
  return { text: res.text, usage: { input: usage.input + res.usage.input, output: usage.output + res.usage.output }, model: cfg.oss, extra: searchRows };
}

const CALL: Record<ProviderId, (o: AskOpts, cfg: Cfg) => Promise<Raw>> = { claude: callClaude, openai: callOpenAI, oss: callOss };

/** 제공자 체인을 따라 호출 → JSON 추출. JSON이 깨지면 같은 제공자로 1회 재시도 후 다음 제공자 */
export async function ask<T = any>(o: AskOpts): Promise<AskResult<T>> {
  // 작업별 모델·생각 깊이 (AI 모델 화면에서 지정) — 직접 지정(model/effort)이 있으면 그게 우선
  const t = resolveTask(await modelSettings(), o.task);
  const cfg: Cfg = { claude: o.model || t.claude, effort: o.effort || t.effort, openai: t.openai || MODELS.openai(), oss: t.oss || MODELS.oss() };
  const order = resolveChain(o.chain, o.prefer || t.provider);
  if (!order.length) throw new Error('사용 가능한 AI 제공자가 없습니다. ANTHROPIC_API_KEY / OPENAI_API_KEY / OSS_BASE_URL+OSS_MODEL 중 하나를 설정하거나, 에이전트 직접 작업(step_brief → step_submit)을 사용하세요.');
  const tried: { provider: string; error: string }[] = [];
  const calls: CallRecord[] = [];
  const extra: UsageRow[] = [];
  let usage: Usage = { input: 0, output: 0, cache_read: 0, cache_write: 0, searches: 0 };
  const add = (u: Usage) => {
    usage = { input: usage.input + u.input, output: usage.output + u.output, cache_read: (usage.cache_read || 0) + (u.cache_read || 0), cache_write: (usage.cache_write || 0) + (u.cache_write || 0), searches: (usage.searches || 0) + (u.searches || 0) };
  };
  // 성공·실패 상관없이 모든 시도를 기록부에 남김 (어떤 플랫폼·모델로 얼마나 썼는지)
  const record = async () => logUsage([
    ...calls.map((c): UsageRow => ({
      kind: 'llm', platform: c.platform, model: c.model, effort: c.effort, attempt: c.attempt, ms: c.ms, ok: c.ok, error: c.error,
      input_tokens: c.usage.input, output_tokens: c.usage.output, cache_read_tokens: c.usage.cache_read, cache_write_tokens: c.usage.cache_write, searches: c.usage.searches,
    })),
    ...extra,
  ], { task: o.task, ...(o.meta || {}) });
  for (const p of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      const modelOf = p === 'claude' ? cfg.claude : p === 'openai' ? cfg.openai : cfg.oss;
      let raw: Raw | null = null;
      try {
        raw = await CALL[p](o, cfg);
        add(raw.usage);
        if (raw.extra) extra.push(...raw.extra);
        const model = raw.model || modelOf || MODELS[p]();
        const data = extractJSON<T>(raw.text);
        calls.push({ provider: p, platform: PROVIDER_PLATFORM[p], model, effort: raw.effort || null, usage: raw.usage, ms: Date.now() - t0, ok: true, attempt: calls.length + 1 });
        const lg = await record();
        return { data, usage, provider: p, model: raw.effort ? `${model} · ${raw.effort}` : model, effort: raw.effort || null, tried, calls, cost_usd: lg.cost, priced: lg.priced, usage_ids: lg.ids };
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 200);
        tried.push({ provider: p, error: msg });
        // 응답은 왔는데 JSON 이 깨진 경우도 토큰은 쓴 것 → 그대로 기록
        calls.push({ provider: p, platform: PROVIDER_PLATFORM[p], model: raw?.model || modelOf || MODELS[p](), effort: raw?.effort || null, usage: raw?.usage || { input: 0, output: 0 }, ms: Date.now() - t0, ok: false, error: msg, attempt: calls.length + 1 });
        if (!/JSON을 찾지 못했습니다/.test(msg)) break; // JSON 문제만 같은 제공자로 재시도
      }
    }
  }
  await record();
  throw new Error('모든 AI 제공자 실패 — ' + tried.map((t) => `${t.provider}: ${t.error}`).join(' | '));
}
