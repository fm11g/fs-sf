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
import { isoKst, parseDeadline } from './deadline';
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

/** 주제 분류 · 공고 이름 → 홈페이지 자금 종류 키 (사례 · 진행 중인 정책자금 분류) */
export function fundKey(text: string) {
  if (/대환/.test(text)) return 'refinance';
  if (/수출|무역|해외/.test(text)) return 'export';
  if (/시설|설비|스마트공장|공장/.test(text)) return 'facility';
  if (/창업|R&D|기술|연구/.test(text)) return 'startup';
  if (/운전|인건비|고용|원자재|긴급|재해|소상공인|보증/.test(text)) return 'operating';
  return '';
}

/** 공고 마감(카운트다운 종료): 이벤트 deadline_iso → 조사 deadline_iso → 마감 글 해석 */
export function contentDeadline(c: any): string | null {
  const p = c.research?.program || {};
  return isoKst(c.offer?.deadline_iso) || isoKst(p.deadline_iso) || parseDeadline(p.deadline) || parseDeadline(c.offer?.deadline_label) || null;
}

/**
 * 오늘의 랜딩 → 홈페이지 today.html?c=코드 (+ 진행 중인 정책자금 공고 1건)
 * 글: 랜딩 단계 site 블록 → 없으면 랜딩 슬롯 · 이벤트 · 기획 훅. 사례: 홈페이지 사례 중 같은 자금 종류.
 */
export async function publishLanding(contentId: string) {
  const s = await getSettings();
  const db = sbAdmin();
  const { data: c } = await db.from('contents').select('id, slug, track_code, topic, research, plan, offer, post, youtube_id, published_at, site_post').eq('id', contentId).single();
  if (!c) throw new Error('콘텐츠 없음');
  if (!c.offer) throw new Error('이벤트(04) 산출물이 없습니다');
  const code = await ensureCode(c);
  if (!code) throw new Error('콘텐츠 코드를 만들 수 없습니다');
  const { data: lv } = await db.from('landing_variants').select('*').eq('content_id', contentId).maybeSingle();
  const v: Record<string, string> = (lv as any)?.values || {};
  const site: any = (lv as any)?.site || {};
  const r = c.research || {}, p = r.program || {}, o = c.offer || {};
  const fund = fundKey(`${r.topic_category || ''} ${p.name || ''} ${c.topic || ''}`);
  const deadline = contentDeadline(c);
  const strip = (x: unknown) => String(x ?? '').replace(/\\n/g, '\n').trim();
  const points = (site.points?.length ? site.points : [v.hero_point1, v.hero_point2, v.hero_point3].filter(Boolean).length ? [v.hero_point1, v.hero_point2, v.hero_point3] : (r.facts || []).slice(0, 3).map((f: any) => f.claim)).map(strip).filter(Boolean);
  const landing = {
    code, title: strip(o.event_name) || strip(c.post?.title) || c.topic, fund,
    badge: strip(site.badge) || [p.agency, o.event_name].filter(Boolean).join(' · ').slice(0, 30),
    headline: strip(site.headline) || strip(v.hero_hook) || strip(c.plan?.chosen_hook) || strip(o.event_name),
    sub: strip(site.sub) || strip(o.bridge) || strip(v.hero_q),
    program: {
      name: p.name, agency: p.agency, amount: p.amount, rate: p.rate, period: p.period,
      target: Array.isArray(p.eligibility) ? p.eligibility : [], apply: p.how_to_apply,
      url: /^https:\/\//.test(String(p.url || '')) ? p.url : (r.facts || []).map((f: any) => f.source_url).find((u: any) => /^https:\/\//.test(String(u || ''))) || '',
    },
    deadline, deadlineLabel: strip(o.deadline_label).slice(0, 40),
    benefit: strip(o.main_benefit), benefits: o.benefits || [], points, steps: o.steps || [], effort: strip(o.effort),
    faq: [...(o.objections || []), ...((c.post?.faq || []) as any[])].slice(0, 5),
    disclaimer: strip(o.disclaimer), cta: strip(o.cta), formTitle: strip(o.form_title),
    sources: (r.facts || []).filter((f: any) => /^https:\/\//.test(String(f.source_url || ''))).slice(0, 4).map((f: any) => ({ title: f.source_title || '공고 원문', url: f.source_url })),
    post: c.site_post?.slug ? `./${c.site_post.slug}.html` : null,
    youtubeId: c.youtube_id || null, publishedAt: c.published_at || new Date().toISOString(),
    defaultDays: 21,
  };
  const program = p.name ? {
    name: p.name, agency: p.agency, fund, amount: p.amount, rate: p.rate,
    target: Array.isArray(p.eligibility) ? p.eligibility.slice(0, 2).join(' · ') : '', period: p.period, apply: p.how_to_apply,
    url: landing.program.url, deadline,
  } : null;
  const res = await call(s, '/api/integration/landings', { method: 'POST', body: { landing, program } });
  const site_landing = { url: res.url, deadline: res.deadline ?? deadline, expiresAt: res.expiresAt ?? null, at: new Date().toISOString() };
  const up = await db.from('contents').update({ site_landing }).eq('id', contentId);
  if (up.error && !/site_landing/.test(up.error.message)) throw new Error(up.error.message);
  return site_landing;
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
  const out: { post?: any; landing?: any; short?: any; warnings: string[] } = { warnings: [] };
  if (!cfg.api) { out.warnings.push('홈페이지 연동 미설정'); return out; }
  if (s.tpf_post_on_publish !== false || o.force) {
    try { out.post = await publishPost(contentId, o); } catch (e: any) { out.warnings.push(`정보글: ${e.message}`); }
  }
  // 랜딩은 정보글 다음(정보글 주소를 넣으려고), 숏폼 등록 전(go.html 이 랜딩을 알게)
  try { out.landing = await publishLanding(contentId); } catch (e: any) { out.warnings.push(`오늘의 랜딩: ${e.message}`); }
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
