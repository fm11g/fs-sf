/**
 * 오늘의 정책자금 홈페이지 연동 — 숏폼 공장 ↔ 홈페이지 관리자(today-fund-admin) /api/integration/*
 *
 *   업로드 완료(/api/notify 'published')
 *     → publishPost   : 정보글 대본·조사 → 홈페이지 「정책자금 정보」 SEO 글 (목차·FAQ·영상 임베드·JSON-LD)
 *     → registerShort : 유튜브 ID · 인스타 URL · 정보글 번호 등록 → go.html?c=코드 가 그 글로 연결
 *   매일 · 채널 분석 전  syncLeads : 코드별 신청(DB) 수(채널별) → contents.lead_stats → 성과 점수(DB 가중치 최대)
 *   공장 랜딩 신청      forwardLead : 홈페이지 관리자 상담 목록으로 전달
 *
 * 연동 실패가 업로드·분석을 멈추면 안 됩니다 (모든 함수는 결과 객체로 실패를 돌려줌).
 */
import { getSettings } from './settings';
import { sbAdmin } from './supabase/server';
import { hydrateEnv } from './secrets';
import { profileLink, trackCode, trackedLink } from './track';
import { defaultQuery, findPhoto } from './photo';
import type { Settings } from './types';

const trim = (u?: string | null) => String(u || '').trim().replace(/\/+$/, '');
const kstDate = (iso?: string | null) => new Date(new Date(iso || Date.now()).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

export function tpfConfig(s: Settings) {
  const site = trim(s.tpf_site_url);
  const admin = trim(s.tpf_admin_url);
  const key = String(process.env.TPF_ADMIN_KEY || '');
  return { site, admin, key, links: !!site, api: !!admin && key.length >= 16 };
}

/** 카피에 넣을 링크 — 홈페이지 주소가 있으면 추적 링크, 없으면 null (기존 공장 랜딩 사용) */
export function siteLinks(s: Settings, c: { slug: string; track_code?: string | null }) {
  const { site } = tpfConfig(s);
  const code = c.track_code || trackCode(c.slug);
  if (!site || !code) return null;
  return { code, yt: trackedLink(site, code, 'yt'), ytc: trackedLink(site, code, 'ytc'), ig: trackedLink(site, code, 'ig'), igc: trackedLink(site, code, 'igc'), profile: profileLink(site) };
}

export async function call(s: Settings, path: string, init: { method?: string; body?: any } = {}) {
  await hydrateEnv();
  const cfg = tpfConfig(s);
  if (!cfg.api) throw new Error('홈페이지 연동 미설정 — [설정 > 홈페이지 연동] 관리자 주소, [연결·키] TPF_ADMIN_KEY');
  const res = await fetch(`${cfg.admin}${path}`, {
    method: init.method || 'GET', cache: 'no-store', signal: AbortSignal.timeout(45000),
    headers: { authorization: `Bearer ${cfg.key}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${j.message || j.error || '실패'}`);
  return j;
}

async function ensureCode(c: any) {
  if (c.track_code) return c.track_code as string;
  const code = trackCode(c.slug);
  if (code) await sbAdmin().from('contents').update({ track_code: code }).eq('id', c.id);
  return code;
}

/** 인스타 미디어 ID → 게시물 주소 (best-effort) */
async function igPermalink(mediaId: string) {
  try {
    const token = String(process.env.IG_ACCESS_TOKEN || '');
    if (!token || !mediaId) return null;
    const host = process.env.IG_GRAPH_HOST || (token.startsWith('IG') ? 'graph.instagram.com' : 'graph.facebook.com');
    const r = await fetch(`https://${host}/${process.env.GRAPH_VERSION || 'v23.0'}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) });
    const j: any = await r.json();
    return typeof j.permalink === 'string' ? j.permalink : null;
  } catch { return null; }
}

/** 정보글 발행 (같은 코드면 홈페이지가 기존 글을 유지 · force 면 다시 씀) */
export async function publishPost(contentId: string, o: { force?: boolean } = {}) {
  await hydrateEnv(); // 사진 검색 키(PEXELS_API_KEY 등)
  const s = await getSettings();
  const db = sbAdmin();
  const { data: c } = await db.from('contents').select('id, slug, track_code, topic, post, images, youtube_id, thumbnail_url, published_at, research, site_post').eq('id', contentId).single();
  if (!c?.post?.body_markdown) throw new Error('정보글 산출물이 없습니다');
  const code = await ensureCode(c);
  if (!code) throw new Error('콘텐츠 코드를 만들 수 없습니다');
  const p = c.post;
  // 대표 이미지 사진: 정보글 단계 thumb_query(영문) → 분류 기본 검색어
  const category = p.category || c.research?.topic_category || null;
  const photo = c.site_post?.id && !o.force ? null : await findPhoto([p.thumb_query, p.thumb_query_alt, defaultQuery(`${category || ''} ${p.title || ''} ${c.topic || ''}`)]).catch(() => null);
  const r = await call(s, '/api/integration/posts', {
    method: 'POST',
    body: {
      code, force: !!o.force,
      title: p.title, description: p.meta_description, keywords: p.keywords || [],
      markdown: p.body_markdown, faq: p.faq || [], images: c.images || [],
      youtubeId: c.youtube_id || null,
      photoUrl: photo?.url || null, photoCredit: photo?.credit || null,  // 없으면 홈페이지가 브랜드 카드로
      category,
      date: kstDate(c.published_at),
    },
  });
  const site_post = { id: r.id, slug: r.slug, url: r.url, commit: r.commit?.url ?? r.commit ?? null, at: new Date().toISOString(), photo: photo ? { id: photo.id, source: photo.credit.source } : c.site_post?.photo ?? null, skipped: !!r.skipped };
  await db.from('contents').update({ site_post }).eq('id', contentId);
  return site_post;
}

/** 숏폼 등록 → 홈페이지 data/shorts.json (go.html 목적지) + shorts 테이블 */
export async function registerShort(contentId: string) {
  const s = await getSettings();
  const db = sbAdmin();
  const { data: c } = await db.from('contents').select('id, slug, track_code, topic, post, youtube_id, instagram_id, instagram_url, thumbnail_url, published_at, site_post').eq('id', contentId).single();
  if (!c) throw new Error('콘텐츠 없음');
  const code = await ensureCode(c);
  let igUrl = c.instagram_url;
  if (!igUrl && c.instagram_id) {
    igUrl = await igPermalink(c.instagram_id);
    if (igUrl) await db.from('contents').update({ instagram_url: igUrl }).eq('id', contentId);
  }
  return call(s, '/api/integration/shorts', {
    method: 'POST',
    body: {
      code, slug: c.slug, title: c.post?.title || c.topic || c.slug, topic: c.topic,
      youtubeId: c.youtube_id, instagramId: c.instagram_id, instagramUrl: igUrl,
      thumbnailUrl: c.thumbnail_url, publishedAt: c.published_at, postId: c.site_post?.id ?? null,
    },
  });
}

/** 업로드 직후 한 번에: 정보글 → 숏폼 등록. 실패는 경고로만 */
export async function siteSync(contentId: string, o: { force?: boolean } = {}) {
  const s = await getSettings();
  const cfg = tpfConfig(s);
  const out: { post?: any; short?: any; warnings: string[] } = { warnings: [] };
  if (!cfg.api) { out.warnings.push('홈페이지 연동 미설정'); return out; }
  if (s.tpf_post_on_publish !== false || o.force) {
    try { out.post = await publishPost(contentId, o); } catch (e: any) { out.warnings.push(`정보글: ${e.message}`); }
  }
  try { out.short = await registerShort(contentId); } catch (e: any) { out.warnings.push(`숏폼 등록: ${e.message}`); }
  return out;
}

export type LeadStats = { total: number; by_channel: Record<string, number>; by_status?: Record<string, number>; first_at?: string | null; last_at?: string | null };

/** 홈페이지 신청(DB) 수 → contents.lead_stats. 반환: code → stats */
export async function syncLeads(o: { days?: number } = {}) {
  const s = await getSettings();
  const cfg = tpfConfig(s);
  const map = new Map<string, LeadStats>();
  if (!cfg.api) return { ok: false, map, updated: 0, warning: '홈페이지 연동 미설정 — 성과 점수에서 DB 항목 제외' };
  const days = o.days ?? Math.max(30, Number(s.channel_lookback_days || 60) + 14);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const r = await call(s, `/api/integration/leads?since=${encodeURIComponent(since)}`);
  for (const [code, v] of Object.entries<any>(r.codes || {})) map.set(code, v);
  const db = sbAdmin();
  const { data: cs } = await db.from('contents').select('id, track_code, lead_stats').not('track_code', 'is', null).gte('created_at', since);
  const now = new Date().toISOString();
  let updated = 0;
  for (const c of cs || []) {
    const st = map.get(c.track_code) || { total: 0, by_channel: {} };
    if (JSON.stringify(st) === JSON.stringify(c.lead_stats || null)) continue;
    await db.from('contents').update({ lead_stats: st, leads_synced_at: now }).eq('id', c.id);
    updated++;
  }
  return { ok: true, map, updated, total: r.total ?? null, untracked: r.untracked ?? null };
}

/** 공장 랜딩 신청 → 홈페이지 관리자 상담 목록 */
export async function forwardLead(row: { id?: string; name: string; phone: string; company?: string | null; memo?: string | null; content_slug?: string | null; utm?: any; track_code?: string | null }) {
  const s = await getSettings();
  if (s.tpf_forward_leads === false || !tpfConfig(s).api) return null;
  const r = await call(s, '/api/integration/leads', {
    method: 'POST',
    body: {
      name: row.name, phone: row.phone, company: row.company, memo: row.memo,
      code: row.track_code || (row.content_slug ? trackCode(row.content_slug) : null), utm: row.utm || {},
      channel: /youtube/i.test(String(row.utm?.utm_source || '')) ? 'youtube' : /instagram/i.test(String(row.utm?.utm_source || '')) ? 'instagram' : /blog|post/i.test(String(row.utm?.utm_source || '')) ? 'blog' : 'factory',
      request_id: row.id || undefined,  // 같은 신청을 두 번 보내도 홈페이지에서 한 건만
    },
  });
  if (row.id) await sbAdmin().from('leads').update({ forwarded_at: new Date().toISOString() }).eq('id', row.id);
  return r;
}
