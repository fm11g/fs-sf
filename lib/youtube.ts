import { google } from 'googleapis';

/** Vercel 미리보기(배포마다 바뀌는) 주소인지 — 예: fs-gnlq76tgy-fm11g.vercel.app */
export const isPreviewHost = (u: string) => /^https?:\/\/[^/]+-[a-z0-9]{9}-[^/.]+\.vercel\.app/i.test(u);

/**
 * 유튜브 OAuth 에 쓸 '고정' 주소 — 구글에 등록한 리디렉션 URI 와 매번 같아야 하므로 접속한 주소(미리보기일 수 있음)를 쓰지 않음.
 * 우선순위: 설정의 사이트 URL(커스텀 도메인) > Vercel Production 주소 > 연결·키 SITE_URL(미리보기 주소가 아니면) > 지금 접속한 주소
 */
export function oauthOrigin(reqOrigin: string, siteSetting?: string) {
  const clean = (v?: string) => String(v || '').trim().replace(/\/+$/, '');
  const cands = [
    clean(siteSetting),
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)}` : '',
    clean(process.env.SITE_URL),
  ].filter((v) => /^https:\/\//.test(v) && !isPreviewHost(v));
  return cands[0] || clean(reqOrigin);
}
export const ytRedirectUri = (origin: string) => `${origin}/api/oauth/youtube/callback`;

export function oauthClient(origin: string) {
  return new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET, ytRedirectUri(origin));
}
