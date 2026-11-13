import { randomBytes } from 'node:crypto';
import { sbAdmin } from './supabase/server';

/**
 * 연결·키 — Vercel 환경변수 대신 관리자 페이지에서 입력 → Supabase(app_secrets)에 저장 →
 * 사이트(이 모듈)와 워커(worker/src/env.ts) 가 실행될 때마다 읽어 process.env 로 적용.
 * 우선순위: 관리자 페이지에 저장한 값 > Vercel/GitHub 환경변수 > 없음
 * Vercel 에 꼭 필요한 것은 Supabase 3개(NEXT_PUBLIC_SUPABASE_URL·ANON_KEY·SERVICE_ROLE_KEY) 뿐.
 */
export type KeyDef = { key: string; label: string; group: string; secret?: boolean; auto?: boolean; multiline?: boolean; help?: string; placeholder?: string };

export const KEY_GROUPS: { group: string; desc: string }[] = [
  { group: 'AI', desc: '하나 이상 필요. 여러 개 넣으면 실패 시 다음 제공자로 자동 전환' },
  { group: '워커(GitHub)', desc: '렌더·업로드·채널 수집·참고 영상 분석을 돌리는 GitHub Actions' },
  { group: 'AI 목소리', desc: '렌더 단계 TTS' },
  { group: '유튜브', desc: '업로드·댓글·채널 성과' },
  { group: '인스타그램', desc: '릴스 업로드·채널 성과' },
  { group: '이메일 알림', desc: 'Resend 또는 Gmail SMTP 중 하나' },
  { group: '데이터 내보내기', desc: '구글 시트(서비스 계정)·별도 데이터 저장소 (선택)' },
  { group: '자동 생성', desc: '첫 가입 때 자동으로 만들어짐. 필요할 때만 다시 발급' },
];

export const KEY_DEFS: KeyDef[] = [
  { key: 'ANTHROPIC_API_KEY', label: 'Claude API 키', group: 'AI', secret: true, placeholder: 'sk-ant-…' },
  { key: 'CLAUDE_MODEL', label: 'Claude 모델', group: 'AI', placeholder: 'claude-sonnet-5-5' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API 키', group: 'AI', secret: true, placeholder: 'sk-…' },
  { key: 'OPENAI_MODEL', label: 'OpenAI 모델', group: 'AI', placeholder: 'gpt-5.5' },
  { key: 'OSS_BASE_URL', label: '오픈소스 모델 주소', group: 'AI', placeholder: 'https://openrouter.ai/api/v1', help: 'OpenAI 호환 주소 (Ollama·vLLM·OpenRouter·Groq)' },
  { key: 'OSS_API_KEY', label: '오픈소스 모델 키', group: 'AI', secret: true },
  { key: 'OSS_MODEL', label: '오픈소스 모델 이름', group: 'AI', placeholder: 'qwen/qwen3-235b-a22b' },
  { key: 'TAVILY_API_KEY', label: 'Tavily 검색 키', group: 'AI', secret: true, help: '오픈소스 모델로 조사할 때 웹검색용' },
  { key: 'SEARXNG_URL', label: 'SearXNG 주소', group: 'AI' },

  { key: 'GITHUB_REPO', label: '저장소 (owner/repo)', group: '워커(GitHub)', placeholder: 'flos/today-policy-fund' },
  { key: 'GITHUB_TOKEN', label: 'GitHub 토큰', group: '워커(GitHub)', secret: true, help: 'Fine-grained · 이 저장소 · Contents·Secrets 읽기/쓰기. 저장 후 [워커에 적용]을 누르면 GitHub Secrets 가 자동 등록됩니다' },

  { key: 'FISH_AUDIO_API_KEY', label: 'Fish Audio API 키', group: 'AI 목소리', secret: true },

  { key: 'YT_CLIENT_ID', label: 'OAuth 클라이언트 ID', group: '유튜브', placeholder: '….apps.googleusercontent.com' },
  { key: 'YT_CLIENT_SECRET', label: 'OAuth 클라이언트 보안 비밀', group: '유튜브', secret: true },
  { key: 'YT_REFRESH_TOKEN', label: '리프레시 토큰', group: '유튜브', secret: true, help: '직접 넣지 말고 [유튜브 계정 연결] 버튼을 누르면 자동 저장됩니다' },
  { key: 'YT_API_KEY', label: 'YouTube Data API 키', group: '유튜브', secret: true, help: '참고 영상 정보 조회용 (선택)' },

  { key: 'IG_USER_ID', label: '인스타 비즈니스 계정 ID', group: '인스타그램' },
  { key: 'IG_ACCESS_TOKEN', label: '장기 액세스 토큰', group: '인스타그램', secret: true },
  { key: 'GRAPH_VERSION', label: 'Graph API 버전', group: '인스타그램', placeholder: 'v23.0' },
  { key: 'IG_GRAPH_HOST', label: 'Graph 호스트', group: '인스타그램', placeholder: 'graph.facebook.com', help: '인스타 로그인 방식이면 graph.instagram.com' },

  { key: 'RESEND_API_KEY', label: 'Resend API 키', group: '이메일 알림', secret: true },
  { key: 'EMAIL_FROM', label: '보내는 사람', group: '이메일 알림', placeholder: '오늘의 정책자금 <noreply@도메인>' },
  { key: 'SMTP_HOST', label: 'SMTP 서버', group: '이메일 알림', placeholder: 'smtp.gmail.com' },
  { key: 'SMTP_PORT', label: 'SMTP 포트', group: '이메일 알림', placeholder: '465' },
  { key: 'SMTP_USER', label: 'SMTP 아이디', group: '이메일 알림' },
  { key: 'SMTP_PASS', label: 'SMTP 비밀번호(앱 비밀번호)', group: '이메일 알림', secret: true },

  { key: 'GOOGLE_SERVICE_ACCOUNT_JSON', label: '구글 서비스 계정 JSON', group: '데이터 내보내기', secret: true, multiline: true, help: 'Apps Script 방식이면 비워 두세요' },
  { key: 'GITHUB_DATA_REPO', label: '데이터 저장소 (다른 저장소에 저장할 때)', group: '데이터 내보내기' },
  { key: 'GITHUB_DATA_TOKEN', label: '데이터 저장소 토큰', group: '데이터 내보내기', secret: true },

  { key: 'SITE_URL', label: '사이트 주소', group: '자동 생성', auto: true, help: '첫 가입한 주소로 자동 저장. 도메인을 연결하면 바꾸세요' },
  { key: 'WORKER_SECRET', label: '워커 비밀값', group: '자동 생성', secret: true, auto: true },
  { key: 'MCP_TOKEN', label: 'MCP 토큰 (Claude Code·Codex 연결)', group: '자동 생성', secret: true, auto: true },
];

const ALLOWED = new Set(KEY_DEFS.map((k) => k.key));
/** 워커(GitHub Actions)가 읽는 키 — 워커도 DB 에서 직접 읽으므로 GitHub Secrets 엔 Supabase 2개만 있으면 됨 */
export const WORKER_KEYS = ['SITE_URL', 'WORKER_SECRET', 'FISH_AUDIO_API_KEY', 'YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN', 'YT_API_KEY', 'IG_USER_ID', 'IG_ACCESS_TOKEN', 'GRAPH_VERSION', 'IG_GRAPH_HOST', 'OPENAI_API_KEY'];

// ── 실행 중 적용 ────────────────────────────────────────────────────
const TTL = 20_000;
let loadedAt = 0;
let loading: Promise<void> | null = null;
const orig: Record<string, string | undefined> = {};   // 덮어쓰기 전 원래 env (삭제하면 되돌림)
const applied = new Set<string>();

function apply(rows: { key: string; value: string }[]) {
  const seen = new Set<string>();
  for (const r of rows) {
    if (!ALLOWED.has(r.key) || !r.value) continue;
    if (!applied.has(r.key)) orig[r.key] = process.env[r.key];
    process.env[r.key] = r.value;
    applied.add(r.key);
    seen.add(r.key);
  }
  for (const k of [...applied]) {
    if (seen.has(k)) continue;
    if (orig[k] === undefined) delete process.env[k]; else process.env[k] = orig[k];
    applied.delete(k);
  }
}

/** DB 에 저장한 키를 process.env 로 (20초 캐시). 모든 서버 진입점에서 호출 */
export async function hydrateEnv(force = false) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  if (!force && Date.now() - loadedAt < TTL) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const { data, error } = await sbAdmin().from('app_secrets').select('key, value');
      if (!error) { apply(data || []); loadedAt = Date.now(); }
    } catch { /* 테이블이 아직 없으면(마이그레이션 전) 환경변수만 사용 */ }
    finally { loading = null; }
  })();
  return loading;
}

export const isManaged = (k: string) => applied.has(k);

export async function setSecrets(values: Record<string, string | null>, by: string) {
  const db = sbAdmin();
  const up: any[] = [];
  const del: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    if (!ALLOWED.has(k)) throw new Error(`저장할 수 없는 키: ${k}`);
    const val = typeof v === 'string' ? v.trim() : '';
    if (val) up.push({ key: k, value: val, updated_by: by, updated_at: new Date().toISOString() });
    else del.push(k);
  }
  if (up.length) { const { error } = await db.from('app_secrets').upsert(up); if (error) throw new Error(error.message); }
  if (del.length) await db.from('app_secrets').delete().in('key', del);
  await hydrateEnv(true);
  return { saved: up.map((x) => x.key), removed: del };
}

export const genToken = (n = 32) => randomBytes(n).toString('base64url');

/** 첫 가입 때: 없는 자동 키만 생성 */
export async function ensureAutoSecrets(origin: string, by: string) {
  const { data } = await sbAdmin().from('app_secrets').select('key').in('key', ['SITE_URL', 'WORKER_SECRET', 'MCP_TOKEN']);
  const has = new Set((data || []).map((r: any) => r.key));
  const vals: Record<string, string> = {};
  if (!has.has('SITE_URL') && origin && !/localhost|127\.0\.0\.1/.test(origin)) vals.SITE_URL = origin.replace(/\/$/, '');
  if (!has.has('WORKER_SECRET')) vals.WORKER_SECRET = process.env.WORKER_SECRET || genToken();
  if (!has.has('MCP_TOKEN')) vals.MCP_TOKEN = process.env.MCP_TOKEN || genToken();
  if (Object.keys(vals).length) await setSecrets(vals, by);
  return Object.keys(vals);
}

/** 화면 표시용: 비밀값은 끝 4자리만 */
export async function secretsStatus() {
  await hydrateEnv(true);
  const { data } = await sbAdmin().from('app_secrets').select('key, value, updated_by, updated_at');
  const rows = new Map((data || []).map((r: any) => [r.key, r]));
  return KEY_DEFS.map((d) => {
    const r: any = rows.get(d.key);
    const envVal = r ? orig[d.key] : process.env[d.key];
    const v: string | undefined = r?.value ?? envVal;
    return {
      ...d,
      source: r ? 'admin' : envVal ? 'env' : 'none',
      preview: !v ? '' : d.secret ? `••••${v.slice(-4)}` : v,
      updated_by: r?.updated_by ?? null,
      updated_at: r?.updated_at ?? null,
    };
  });
}

/** 사이트 주소: 설정의 사이트 URL(도메인) > 연결·키 SITE_URL > 환경변수 > Vercel 자동 주소 */
export function siteUrl(s?: { site_url?: string } | null) {
  const v = s?.site_url || process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return String(v || '').replace(/\/$/, '');
}
