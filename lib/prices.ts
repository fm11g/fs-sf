/**
 * API 단가표 + 비용 계산 — 사이트(lib/usage.ts)와 렌더 워커(worker/src/usage.ts)가 같이 씀. 순수 데이터만.
 * 관리자 [API 사용량 → 단가표]에서 고친 값(settings.value.prices)이 아래 기본값보다 우선.
 *
 * 기본값 출처: Claude 공식 요금 (2026-11 확인) — Opus 5.5 $4/$20, Sonnet 5.5 $2/$10,
 *   Haiku 5.5 $0.10/$0.50 (프롬프트 10만 토큰 초과 시 $0.50/$2.50), Fable 5.x $10/$50.
 *   생각(thinking) 토큰은 출력 토큰으로 청구됨. 웹검색은 1,000회당 $10.
 * 그 외(OpenAI·Fish Audio·GitHub Actions 등)는 요금제마다 달라 기본값이 0(단가 미입력)인 것이 있음 → 화면에서 입력.
 */
export type Price = {
  in?: number; out?: number;           // USD / 100만 토큰
  cache_read?: number; cache_write?: number;
  long_in?: number; long_out?: number; long_over?: number; // 긴 프롬프트 구간 단가 (long_over 토큰 초과 시)
  per_search?: number;                 // USD / 검색 1회
  per_unit?: number; unit?: string;    // USD / 단위 (글자·분·회 등)
  note?: string;
};
export type PriceTable = Record<string, Price>; // 키: "플랫폼:모델" 또는 "플랫폼:*"

export const DEFAULT_PRICES: PriceTable = {
  'anthropic:claude-fable-5-2': { in: 10, out: 50, cache_read: 0.25, cache_write: 12.5, note: 'Fable 5.x 공시가 기준' },
  'anthropic:claude-opus-5-5': { in: 4, out: 20, cache_read: 0.2, cache_write: 5 },
  'anthropic:claude-sonnet-5-5': { in: 2, out: 10, cache_read: 0.1, cache_write: 2.5 },
  'anthropic:claude-haiku-5-5': { in: 0.1, out: 0.5, cache_read: 0.01, cache_write: 0.125, long_in: 0.5, long_out: 2.5, long_over: 100_000 },
  'anthropic:*': { in: 2, out: 10, note: '목록에 없는 Claude 모델 — 직접 입력 권장' },
  'anthropic:web_search': { per_search: 0.01, note: '1,000회당 $10' },
  'openai:*': { note: '요금제 확인 후 입력' },
  'openai:web_search': { note: '요금제 확인 후 입력' },
  'openai:whisper-1': { per_unit: 0.006, unit: '분', note: '음성 인식 (참고 영상) — 요금 확인 후 수정' },
  'oss:*': { in: 0, out: 0, note: '직접 운영 서버면 0' },
  'tavily:search': { note: '요금제 확인 후 입력 (오픈소스 모델 웹검색)' },
  'searxng:search': { per_search: 0, note: '자체 서버' },
  'fish:tts': { unit: '글자', note: 'Fish Audio 요금제 확인 후 입력' },
  'fish:asr': { unit: '분', note: 'Fish Audio 음성 인식 — 요금제 확인 후 입력' },
  'github:actions': { unit: '분', note: '비공개 저장소 무료 한도 초과분만 청구 — 요금 확인 후 입력' },
  'youtube:api': { per_unit: 0, unit: '쿼터', note: '무료 (하루 쿼터 한도만 있음)' },
  'instagram:api': { per_unit: 0, unit: '호출', note: '무료' },
  'email:send': { per_unit: 0, unit: '통', note: 'Resend/SMTP 요금제에 따라' },
};

export const PLATFORM_LABEL: Record<string, string> = {
  anthropic: 'Anthropic (Claude)', openai: 'OpenAI', oss: '오픈소스 모델', tavily: 'Tavily 검색', searxng: 'SearXNG 검색',
  fish: 'Fish Audio', github: 'GitHub Actions', youtube: 'YouTube API', instagram: 'Instagram API', email: '이메일', agent: '외부 에이전트',
};
export const KIND_LABEL: Record<string, string> = { llm: 'AI 생성', search: '웹검색', tts: 'AI 목소리', stt: '음성 인식', render: '영상 렌더', upload: '업로드', analytics: '채널 통계', email: '메일' };
/** ask() 의 provider id → 플랫폼 */
export const PROVIDER_PLATFORM: Record<string, string> = { claude: 'anthropic', openai: 'openai', oss: 'oss' };

export type UsageIn = {
  platform: string; model?: string | null; kind?: string;
  input_tokens?: number; output_tokens?: number; cache_read_tokens?: number; cache_write_tokens?: number;
  searches?: number; units?: number;
  price_key?: string; // 글자·분·회 단위 요금표 키 (예: fish 의 'tts', github 의 'actions')
};

/** "anthropic:claude-opus-5-5 · high" 처럼 생각 깊이가 붙은 모델명도 처리 */
export function priceOf(table: PriceTable | null | undefined, platform: string, model?: string | null): { p: Price; key: string; custom: boolean } | null {
  const m = String(model || '').split(' · ')[0].trim();
  const t = { ...DEFAULT_PRICES, ...(table || {}) };
  for (const key of [`${platform}:${m}`, `${platform}:*`]) if (t[key]) return { p: t[key], key, custom: !!table?.[key] };
  return null;
}

/** 비용(USD)과 단가 유무. priced=false 면 단가가 없어 0 으로 잡힌 것 */
export function costOf(table: PriceTable | null | undefined, u: UsageIn): { usd: number; priced: boolean } {
  let usd = 0;
  let priced = true;
  const tok = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_tokens || 0) + (u.cache_write_tokens || 0);
  if (tok > 0) {
    const r = priceOf(table, u.platform, u.model);
    const p = r?.p;
    if (!p || (p.in == null && p.out == null)) priced = false;
    else {
      const long = p.long_over && (u.input_tokens || 0) + (u.cache_read_tokens || 0) > p.long_over;
      const pin = (long ? p.long_in : undefined) ?? p.in ?? 0;
      const pout = (long ? p.long_out : undefined) ?? p.out ?? 0;
      usd += ((u.input_tokens || 0) * pin + (u.output_tokens || 0) * pout
        + (u.cache_read_tokens || 0) * (p.cache_read ?? pin) + (u.cache_write_tokens || 0) * (p.cache_write ?? pin)) / 1e6;
    }
  }
  if (u.searches) {
    const key = u.platform === 'anthropic' || u.platform === 'openai' ? 'web_search' : 'search';
    const p = priceOf(table, u.platform, key)?.p;
    if (p?.per_search == null) priced = false; else usd += u.searches * p.per_search;
  }
  if (u.units) {
    const p = priceOf(table, u.platform, u.price_key || u.model || '*')?.p;
    if (p?.per_unit == null) priced = false; else usd += u.units * p.per_unit;
  }
  return { usd: Math.round(usd * 1e6) / 1e6, priced };
}

export const fmtUsd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : n > 0 ? `$${n.toFixed(4)}` : '$0');
export const fmtTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0));
