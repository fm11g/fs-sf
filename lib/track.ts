/**
 * 숏폼 고유 코드 · 추적 링크 (순수 함수)
 * 코드: slug 2026-11-19-a1b2 → 261119a1b2 (홈페이지 leads.track_code · shorts.code 와 같은 값)
 * 링크: {홈페이지}/go.html?c=코드&ch=…  → 홈페이지 go.html 이 그 숏폼 정보글(없으면 신청폼)로 보내고 유입을 기록
 *   ch: yt 유튜브 설명 · ytc 유튜브 고정 댓글 · ig 인스타 캡션 · igc 인스타 첫 댓글 · igp 인스타 프로필(c=today)
 */
export const CODE_RE = /^[a-z0-9]{4,24}$/;
export type TrackCh = 'yt' | 'ytc' | 'ig' | 'igc' | 'igp';
const MEDIUM: Record<TrackCh, [string, string]> = {
  yt: ['youtube', 'shorts_description'], ytc: ['youtube', 'shorts_comment'],
  ig: ['instagram', 'reels_caption'], igc: ['instagram', 'reels_comment'], igp: ['instagram', 'profile'],
};

export function trackCode(slug: string) {
  const m = /^\d{2}(\d{2})-(\d{2})-(\d{2})-([a-z0-9]+)$/i.exec(String(slug || ''));
  const code = m ? `${m[1]}${m[2]}${m[3]}${m[4]}`.toLowerCase() : String(slug || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(-16);
  return CODE_RE.test(code) ? code : null;
}

export function trackedLink(site: string, code: string, ch: TrackCh) {
  const base = String(site || '').replace(/\/+$/, '');
  const [src, med] = MEDIUM[ch];
  return `${base}/go.html?c=${encodeURIComponent(code)}&ch=${ch}&utm_source=${src}&utm_medium=${med}&utm_campaign=${encodeURIComponent(code)}`;
}

/** 인스타 프로필 고정 링크 — 항상 가장 최근 숏폼 정보글로 */
export const profileLink = (site: string) => `${String(site || '').replace(/\/+$/, '')}/go.html?c=today&ch=igp&utm_source=instagram&utm_medium=profile`;

/** 플랫폼 영상별 신청 수: 자기 채널 신청 + (검색·정보글·기타) 신청을 조회수 비율로 나눠 가짐 */
export function postLeads(stats: { by_channel?: Record<string, number> } | null | undefined, platform: string, views: number, siblingViews: number) {
  if (!stats) return null;
  const bc = stats.by_channel || {};
  const own = Number(bc[platform] || 0);
  const organic = Object.entries(bc).filter(([k]) => k !== 'youtube' && k !== 'instagram').reduce((a, [, v]) => a + Number(v || 0), 0);
  const total = Math.max(0, views) + Math.max(0, siblingViews);
  const share = organic ? organic * (total > 0 ? Math.max(0, views) / total : siblingViews > 0 ? 0.5 : 1) : 0;
  return { leads: Math.round((own + share) * 100) / 100, own, organic_share: Math.round(share * 100) / 100, by_channel: bc };
}
