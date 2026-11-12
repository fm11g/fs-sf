import Anthropic from '@anthropic-ai/sdk';

/**
 * LLM 제공자 계층 — Claude → OpenAI → 오픈소스(OpenAI 호환) 순으로 자동 전환
 *  - claude : Anthropic Messages API (웹검색 도구 + MCP connector)
 *  - openai : OpenAI Responses API (web_search 도구)
 *  - oss    : OpenAI 호환 /chat/completions (Ollama · vLLM · OpenRouter · Groq · Together 등)
 *             웹검색이 없으므로 조사 단계는 외부 검색(Tavily/SearXNG) 결과를 주입
 * 한 제공자가 실패(키 없음·한도·장애·시간 초과·JSON 깨짐)하면 다음 제공자로 넘어간다.
 */
export type ProviderId = 'claude' | 'openai' | 'oss';
export type Usage = { input: number; output: number };
export type McpServer = { name: string; url: string; token?: string };
export type AskOpts = {
  system: string; prompt: string; webSearch?: boolean; mcp?: McpServer[]; maxTokens?: number;
  chain?: string[];           // 설정의 llm_chain
  prefer?: string | null;     // 단계별 지정 제공자 (auto/빈값이면 chain 순서)
};
export type AskResult<T> = { data: T; usage: Usage; provider: ProviderId; model: string; tried: { provider: string; error: string }[] };

const JSON_RULE = '\n\n반드시 마지막에 ```json 코드블록 하나로만 결과를 출력하세요. 코드블록 밖 설명은 최소화합니다.';
const TIMEOUT = Number(process.env.LLM_TIMEOUT_MS || 120000);
export const DEFAULT_CHAIN: ProviderId[] = ['claude', 'openai', 'oss'];

const MODELS = {
  claude: () => process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
  openai: () => process.env.OPENAI_MODEL || 'gpt-5.5',
  oss: () => process.env.OSS_MODEL || '',
};

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
type Raw = { text: string; usage: Usage };

async function callClaude(o: AskOpts): Promise<Raw> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT * 2, maxRetries: 1 });
  const servers = (o.mcp || []).filter((m) => m?.name && m?.url);
  const tools: any[] = [];
  if (o.webSearch) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'KR', timezone: 'Asia/Seoul' } });
  for (const m of servers) tools.push({ type: 'mcp_toolset', mcp_server_name: m.name });
  const body: any = {
    model: MODELS.claude(), max_tokens: o.maxTokens || 8000, system: o.system + JSON_RULE,
    messages: [{ role: 'user', content: o.prompt }],
    ...(tools.length ? { tools } : {}),
    ...(servers.length ? { mcp_servers: servers.map((m) => ({ type: 'url', name: m.name, url: m.url, ...(m.token ? { authorization_token: m.token } : {}) })) } : {}),
  };
  const res: any = await client.messages.create(body, servers.length ? { headers: { 'anthropic-beta': 'mcp-client-2025-11-20' } } : undefined);
  return {
    text: (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
    usage: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 },
  };
}

async function callOpenAI(o: AskOpts): Promise<Raw> {
  const native = o.webSearch && process.env.OPENAI_WEB_SEARCH !== '0';
  const r = await fetch(`${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/responses`, {
    method: 'POST', signal: AbortSignal.timeout(native ? TIMEOUT * 2 : TIMEOUT),
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODELS.openai(), instructions: o.system + JSON_RULE, input: o.prompt,
      max_output_tokens: (o.maxTokens || 8000) + 4000, // 추론 토큰 여유
      ...(native ? { tools: [{ type: 'web_search' }] } : {}),
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${j.error?.message || ''}`.slice(0, 200));
  const text = (j.output || []).filter((x: any) => x.type === 'message').flatMap((x: any) => x.content || [])
    .filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('\n');
  return { text, usage: { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 } };
}

async function chat(system: string, prompt: string, maxTokens: number): Promise<Raw> {
  const r = await fetch(`${process.env.OSS_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(TIMEOUT),
    headers: { 'content-type': 'application/json', ...(process.env.OSS_API_KEY ? { Authorization: `Bearer ${process.env.OSS_API_KEY}` } : {}) },
    body: JSON.stringify({
      model: MODELS.oss(), max_tokens: maxTokens, temperature: 0.4,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      ...(process.env.OSS_JSON_MODE === '1' ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OSS ${r.status}: ${j.error?.message || JSON.stringify(j).slice(0, 120)}`);
  const text = String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, ''); // 추론 모델의 사고 블록 제거
  return { text, usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 } };
}

async function callOss(o: AskOpts): Promise<Raw> {
  let prompt = o.prompt;
  let usage: Usage = { input: 0, output: 0 };
  if (o.webSearch) {
    // 1) 검색어 생성 → 2) 외부 검색 → 3) 결과를 근거로 주입
    const q = await chat('당신은 검색어를 만드는 조사 보조입니다.' + JSON_RULE,
      `아래 작업에 필요한 최신 정보를 찾기 위한 한국어 검색어 4개를 만드세요. 기관명·연도·"공고"를 포함합니다.\n\n${o.prompt.slice(0, 1500)}\n\nJSON: { "queries": [""] }`, 600);
    usage = q.usage;
    let queries: string[] = [];
    try { queries = (extractJSON<any>(q.text).queries || []).slice(0, 4); } catch { /* 기본 검색어 사용 */ }
    if (!queries.length) queries = [`정책자금 공고 접수 ${new Date().getFullYear()}`, '중소벤처기업진흥공단 정책자금 신청'];
    const hits = (await Promise.all(queries.map((x) => webSearch(x).catch(() => [] as Hit[])))).flat();
    if (!hits.length) throw new Error('검색 결과 없음 — 조사 단계는 검색 수단이 필요합니다 (TAVILY_API_KEY 또는 SEARXNG_URL)');
    const uniq = [...new Map(hits.map((h) => [h.url, h])).values()].slice(0, 14);
    prompt += `\n\n## 검색 결과 (아래 URL만 출처로 사용. 여기에 없는 숫자·사실은 쓰지 말고 "공고 확인 필요"로 둡니다)\n` +
      uniq.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`).join('\n\n');
  }
  const res = await chat(o.system + JSON_RULE, prompt, o.maxTokens || 8000);
  return { text: res.text, usage: { input: usage.input + res.usage.input, output: usage.output + res.usage.output } };
}

const CALL: Record<ProviderId, (o: AskOpts) => Promise<Raw>> = { claude: callClaude, openai: callOpenAI, oss: callOss };

/** 제공자 체인을 따라 호출 → JSON 추출. JSON이 깨지면 같은 제공자로 1회 재시도 후 다음 제공자 */
export async function ask<T = any>(o: AskOpts): Promise<AskResult<T>> {
  const order = resolveChain(o.chain, o.prefer);
  if (!order.length) throw new Error('사용 가능한 AI 제공자가 없습니다. ANTHROPIC_API_KEY / OPENAI_API_KEY / OSS_BASE_URL+OSS_MODEL 중 하나를 설정하거나, 에이전트 직접 작업(step_brief → step_submit)을 사용하세요.');
  const tried: { provider: string; error: string }[] = [];
  let usage: Usage = { input: 0, output: 0 };
  for (const p of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await CALL[p](o);
        usage = { input: usage.input + raw.usage.input, output: usage.output + raw.usage.output };
        return { data: extractJSON<T>(raw.text), usage, provider: p, model: MODELS[p](), tried };
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 200);
        tried.push({ provider: p, error: msg });
        if (!/JSON을 찾지 못했습니다/.test(msg)) break; // JSON 문제만 같은 제공자로 재시도
      }
    }
  }
  throw new Error('모든 AI 제공자 실패 — ' + tried.map((t) => `${t.provider}: ${t.error}`).join(' | '));
}
