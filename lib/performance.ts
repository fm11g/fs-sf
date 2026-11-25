/**
 * 콘텐츠별 성과 한눈에 (서버): DB(홈페이지 신청) · 조회 · 좋아요 · 댓글 · 공유 · 구독 · 성과 점수 · 링크
 *  - 공장 [성과 한눈에] 화면(/admin/performance)
 *  - 홈페이지 관리자 [유입 분석]으로 보내는 지표(pushMetrics → /api/integration/metrics)
 */
import { sbAdmin } from './supabase/server';
import { getSettings } from './settings';
import { call as tpfCall, siteLinks, tpfConfig } from './tpf-site';
import { hydrateEnv } from './secrets';

export type PlatformStat = { url: string | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; subs: number | null; score: number | null; leads: number | null; maturity?: string | null };
export type PerfRow = {
  id: string; slug: string; code: string | null; title: string; topic: string | null; published_at: string | null;
  links: { youtube: string | null; instagram: string | null; post: string | null; landing: string | null; tracked_yt: string | null; tracked_ig: string | null; admin: string };
  db: { total: number | null; by_channel: Record<string, number>; synced_at: string | null };
  youtube: PlatformStat | null; instagram: PlatformStat | null;
  total: { views: number; likes: number; comments: number; shares: number; subs: number };
  score: number | null; db_per_1k: number | null;
};

const num = (v: any) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export async function buildPerformance(o: { days?: number; limit?: number } = {}) {
  const s = await getSettings();
  const db = sbAdmin();
  const since = new Date(Date.now() - (o.days ?? 90) * 864e5).toISOString();
  const { data: cs, error } = await db.from('contents')
    .select('id, slug, track_code, topic, post, copy, youtube_id, instagram_id, instagram_url, published_at, site_post, lead_stats, leads_synced_at')
    .not('published_at', 'is', null).gte('published_at', since).order('published_at', { ascending: false }).limit(o.limit ?? 300);
  if (error) throw new Error(error.message);
  const ids = (cs || []).map((c: any) => c.id);
  const { data: ps } = ids.length
    ? await db.from('channel_posts').select('content_id, platform, url, metrics, perf, perf_score, leads').in('content_id', ids)
    : { data: [] as any[] };
  const byContent = new Map<string, any[]>();
  for (const p of ps || []) byContent.set(p.content_id, [...(byContent.get(p.content_id) || []), p]);
  const factory = String(s.site_url || '').replace(/\/+$/, '');

  const stat = (p: any): PlatformStat | null => p ? ({
    url: p.url || null, views: num(p.metrics?.views), likes: num(p.metrics?.likes), comments: num(p.metrics?.comments),
    shares: num(p.metrics?.shares), saves: num(p.metrics?.saves), subs: num(p.metrics?.subs_gained ?? p.metrics?.follows),
    score: num(p.perf_score), leads: num(p.leads), maturity: p.perf?.maturity ?? null,
  }) : null;

  const rows: PerfRow[] = (cs || []).map((c: any) => {
    const list = byContent.get(c.id) || [];
    const yt = stat(list.find((p) => p.platform === 'youtube'));
    const ig = stat(list.find((p) => p.platform === 'instagram'));
    const sum = (k: keyof PlatformStat) => [yt, ig].reduce((a, x) => a + (Number(x?.[k]) || 0), 0);
    const total = { views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), subs: sum('subs') };
    const scored = [yt, ig].filter((x) => x?.score != null) as PlatformStat[];
    const wsum = scored.reduce((a, x) => a + (x.views || 1), 0);
    const score = scored.length ? Math.round((scored.reduce((a, x) => a + (x.score as number) * (x.views || 1), 0) / wsum) * 10) / 10 : null;
    const t = siteLinks(s, c);
    const dbTotal = c.lead_stats ? Number(c.lead_stats.total || 0) : null;
    return {
      id: c.id, slug: c.slug, code: c.track_code || t?.code || null, title: c.post?.title || c.topic || c.slug, topic: c.topic, published_at: c.published_at,
      links: {
        youtube: c.youtube_id ? `https://youtube.com/shorts/${c.youtube_id}` : yt?.url ?? null,
        instagram: c.instagram_url || ig?.url || null,
        post: c.site_post?.url || null,
        landing: factory ? `${factory}/l/${c.slug}` : null,
        tracked_yt: c.copy?.youtube?.link || t?.yt || null, tracked_ig: c.copy?.instagram?.link || t?.ig || null,
        admin: `${factory}/admin/contents/${c.id}`,
      },
      db: { total: dbTotal, by_channel: c.lead_stats?.by_channel || {}, synced_at: c.leads_synced_at || null },
      youtube: yt, instagram: ig, total, score,
      db_per_1k: dbTotal != null && total.views > 0 ? Math.round((dbTotal / total.views) * 1000 * 100) / 100 : null,
    };
  });

  const sumAll = (f: (r: PerfRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  return {
    days: o.days ?? 90,
    linked: rows.some((r) => r.db.total != null),
    totals: {
      contents: rows.length, db: sumAll((r) => r.db.total || 0), views: sumAll((r) => r.total.views), likes: sumAll((r) => r.total.likes),
      comments: sumAll((r) => r.total.comments), shares: sumAll((r) => r.total.shares), subs: sumAll((r) => r.total.subs),
      with_db: rows.filter((r) => (r.db.total || 0) > 0).length,
    },
    rows,
  };
}

/** 홈페이지 관리자 [유입 분석]에 콘텐츠별 조회 · 좋아요 · 댓글 · 공유 · 구독 · 점수 보내기 (채널 분석 끝에 자동) */
export async function pushMetrics(o: { days?: number } = {}) {
  await hydrateEnv();
  const s = await getSettings();
  if (!tpfConfig(s).api) return { ok: false, sent: 0, warning: '홈페이지 연동 미설정' };
  const perf = await buildPerformance({ days: o.days ?? 120, limit: 400 });
  const items = perf.rows.filter((r) => r.code).map((r) => ({
    code: r.code, title: r.title, published_at: r.published_at,
    youtube: r.youtube && { url: r.links.youtube, views: r.youtube.views, likes: r.youtube.likes, comments: r.youtube.comments, shares: r.youtube.shares, subs: r.youtube.subs, score: r.youtube.score },
    instagram: r.instagram && { url: r.links.instagram, views: r.instagram.views, likes: r.instagram.likes, comments: r.instagram.comments, shares: r.instagram.shares, subs: r.instagram.subs, score: r.instagram.score },
    total: r.total, score: r.score, factory_url: r.links.admin,
  }));
  let sent = 0;
  for (let i = 0; i < items.length; i += 100) {
    const res = await tpfCall(s, '/api/integration/metrics', { method: 'POST', body: { items: items.slice(i, i + 100) } });
    sent += Number(res.updated || 0);
  }
  return { ok: true, sent, total: items.length };
}
