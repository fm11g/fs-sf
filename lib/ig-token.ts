import { sbAdmin } from './supabase/server';
import { hydrateEnv } from './secrets';

/**
 * 인스타 장기 토큰 자동 연장 (매일 크론에서 호출)
 * 인스타 로그인 토큰(IGAA…)은 60일 뒤 만료 → 저장한 지 20일이 넘으면 refresh_access_token 으로 새 60일 토큰을 받아 [연결·키]에 저장.
 * 페이스북 로그인 토큰(EAA…)은 이 방식으로 연장되지 않아 건너뜀 (그쪽은 페이지 토큰을 만료 없음으로 발급 권장).
 */
export async function refreshIgToken(force = false) {
  await hydrateEnv(true);
  const token = String(process.env.IG_ACCESS_TOKEN || '');
  if (!token) return { skipped: '토큰 없음' };
  if (!token.startsWith('IG')) return { skipped: '페이스북 로그인 토큰(EAA…) — 자동 연장 대상 아님' };
  const db = sbAdmin();
  const { data } = await db.from('app_secrets').select('updated_at').eq('key', 'IG_ACCESS_TOKEN').single();
  const age = data?.updated_at ? (Date.now() - Date.parse(data.updated_at)) / 86400000 : 999;
  if (!force && age < 20) return { skipped: `저장한 지 ${age.toFixed(0)}일 — 20일 지나면 연장` };
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return { error: `인스타 토큰 연장 실패 ${r.status}: ${j.error?.message || ''} — 만료됐다면 [연결·키]에 새 토큰을 넣으세요` };
  await db.from('app_secrets').upsert({ key: 'IG_ACCESS_TOKEN', value: j.access_token, updated_by: '자동 연장', updated_at: new Date().toISOString() });
  await hydrateEnv(true);
  return { refreshed: true, expires_in_days: Math.round((j.expires_in || 0) / 86400) };
}
