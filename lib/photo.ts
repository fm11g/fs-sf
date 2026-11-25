/**
 * 정보글 대표 이미지용 사진 찾기 (서버)
 *  1) Pexels (PEXELS_API_KEY)  2) Unsplash (UNSPLASH_ACCESS_KEY) — 둘 다 무료 키, 상업 이용 가능 라이선스
 *  검색어: 정보글 단계의 thumb_query(영문) → 없으면 분류별 기본 검색어
 *  최근 정보글에 쓴 사진은 다시 쓰지 않음 (contents.site_post.photo.id)
 *  사진이 없으면 null → 홈페이지 관리자가 브랜드 녹색 카드로 대표 이미지를 만듦
 */
import { sbAdmin } from './supabase/server';

export type Photo = { id: string; url: string; credit: { name: string; url?: string; source: string } };

const FALLBACK_QUERY: [RegExp, string][] = [
  [/대환/, 'financial documents calculator desk'],
  [/시설|설비|공장/, 'modern factory machinery'],
  [/수출|무역/, 'shipping containers port'],
  [/창업|기술|R&D|연구/, 'startup office laptop'],
  [/운전|인건비|원자재/, 'small business office documents'],
  [/공고|접수|모집/, 'business application paperwork'],
];
export function defaultQuery(text: string) {
  for (const [re, q] of FALLBACK_QUERY) if (re.test(text)) return q;
  return 'business finance meeting documents';
}

async function recentIds() {
  const { data } = await sbAdmin().from('contents').select('site_post').not('site_post', 'is', null).order('created_at', { ascending: false }).limit(80);
  return new Set((data || []).map((r: any) => r.site_post?.photo?.id).filter(Boolean));
}

async function pexels(q: string, used: Set<string>): Promise<Photo | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=landscape&size=large&per_page=30`, { headers: { Authorization: key }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const j: any = await r.json();
  const p = (j.photos || []).find((x: any) => !used.has(`pexels:${x.id}`) && x.width >= 1200);
  if (!p) return null;
  return { id: `pexels:${p.id}`, url: p.src?.landscape || p.src?.large2x || p.src?.large, credit: { name: p.photographer || 'Pexels', url: p.url, source: 'Pexels' } };
}

async function unsplash(q: string, used: Set<string>): Promise<Photo | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=landscape&per_page=30&content_filter=high`, { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const j: any = await r.json();
  const p = (j.results || []).find((x: any) => !used.has(`unsplash:${x.id}`));
  if (!p) return null;
  // Unsplash 가이드: 다운로드 시 download_location 호출
  if (p.links?.download_location) fetch(`${p.links.download_location}&client_id=${key}`).catch(() => {});
  const ref = '?utm_source=today_policy_fund&utm_medium=referral';
  return { id: `unsplash:${p.id}`, url: `${p.urls?.raw}&w=1200&h=630&fit=crop&fm=jpg&q=80`, credit: { name: p.user?.name || 'Unsplash', url: p.user?.links?.html ? p.user.links.html + ref : undefined, source: 'Unsplash' } };
}

/** 검색어 여러 개를 차례로 시도 */
export async function findPhoto(queries: (string | null | undefined)[]): Promise<Photo | null> {
  const qs = Array.from(new Set(queries.map((q) => String(q || '').trim()).filter(Boolean))).slice(0, 3);
  if (!qs.length || (!process.env.PEXELS_API_KEY && !process.env.UNSPLASH_ACCESS_KEY)) return null;
  const used = await recentIds().catch(() => new Set<string>());
  for (const q of qs) {
    try { const p = (await pexels(q, used)) || (await unsplash(q, used)); if (p?.url) return p; } catch { /* 다음 검색어 */ }
  }
  return null;
}
