import { YT_QUOTA, counter, logUsage } from './usage.js';
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { db, settings } from './env.js';

/**
 * 내 채널에 올라간 영상의 지표·댓글을 매일 수집 (조사 시작 전에 실행)
 *  - 유튜브: Data API (업로드 목록·조회·좋아요·댓글 수·댓글 본문) + Analytics API (공유·시청 지속률·구독 증가, 권한 있을 때)
 *  - 인스타: Graph API (릴스 목록·좋아요·댓글 수 + insights: views·reach·saved·shares·평균 시청 시간 + 댓글 본문)
 * 결과는 channel_posts(최신값) + post_snapshots(일별 기록)에 저장. 공장에서 만든 콘텐츠면 content_id 로 연결.
 */

type Post = {
  platform: 'youtube' | 'instagram'; external_id: string; url: string; title: string; caption: string; thumbnail_url?: string | null;
  published_at: string; duration_sec?: number | null; metrics: Record<string, number | null>; comments: { text: string; likes: number; at: string }[];
};

const iso8601 = (d?: string | null) => {
  const m = String(d || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0)) : null;
};
const num = (v: any) => (v == null || v === '' ? null : Number(v));
const clean = (t: string) => String(t || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);

export function parseYoutube(link: string) {
  const s = String(link || '').trim();
  if (!s) return {};
  const id = s.match(/(UC[\w-]{20,})/)?.[1];
  if (id) return { id };
  const h = s.match(/@([\w.\-가-힣]+)/)?.[1];
  if (h) return { handle: `@${h}` };
  return { handle: s.startsWith('@') ? s : `@${s}` };
}
export const parseInstagram = (link: string) => String(link || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@/, '').split(/[/?#]/)[0] || '';

async function youtube(link: string, sinceIso: string, warnings: string[]): Promise<Post[]> {
  const hasOAuth = !!(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN);
  const key = process.env.YT_API_KEY;
  if (!hasOAuth && !key) { warnings.push('유튜브: YT_API_KEY 또는 OAuth(YT_REFRESH_TOKEN)가 없어 건너뜀'); return []; }
  let auth: any = key;
  if (hasOAuth) { const o = new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET); o.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN }); auth = o; }
  const rootUrl = process.env.YT_API_ROOT; // 테스트용
  const yt = google.youtube({ version: 'v3', auth, ...(rootUrl ? { rootUrl } : {}) });
  const ref = parseYoutube(link);
  calls.add('yt:channels.list');
  const ch = await yt.channels.list({ part: ['contentDetails', 'snippet'], ...(ref.id ? { id: [ref.id] } : ref.handle ? { forHandle: ref.handle } : hasOAuth ? { mine: true } : {}) } as any);
  const channel = ch.data.items?.[0];
  if (!channel) { warnings.push(`유튜브: 채널을 찾지 못함 (${link || '링크 없음'})`); return []; }
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return [];

  // 업로드 목록 (기간 안, 최대 150편)
  const ids: string[] = [];
  let pageToken: string | undefined;
  outer: for (let i = 0; i < 3; i++) {
    calls.add('yt:playlistItems.list');
    const pl = await yt.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 50, pageToken });
    for (const it of pl.data.items || []) {
      if ((it.contentDetails?.videoPublishedAt || '') < sinceIso) break outer;
      ids.push(it.contentDetails!.videoId!);
    }
    pageToken = pl.data.nextPageToken || undefined;
    if (!pageToken) break;
  }
  if (!ids.length) return [];

  const vids: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    calls.add('yt:videos.list');
    const v = await yt.videos.list({ part: ['snippet', 'statistics', 'contentDetails'], id: ids.slice(i, i + 50) });
    vids.push(...(v.data.items || []));
  }
  const shorts = vids.filter((v) => (iso8601(v.contentDetails?.duration) ?? 999) <= 180);

  // Analytics (공유·시청 지속률·구독 증가) — OAuth 에 yt-analytics.readonly 권한이 있을 때
  const extra: Record<string, any> = {};
  if (!hasOAuth) warnings.push('유튜브: API 키만으로는 공유수·시청 지속률을 볼 수 없습니다 (유튜브 채널 연결 시 포함)');
  if (hasOAuth && shorts.length) {
    const ya = google.youtubeAnalytics({ version: 'v2', auth, ...(rootUrl ? { rootUrl } : {}) });
    const start = shorts.map((v) => v.snippet.publishedAt).sort()[0].slice(0, 10);
    const end = new Date().toISOString().slice(0, 10);
    for (const metrics of ['views,likes,comments,shares,averageViewPercentage,averageViewDuration,subscribersGained', 'views,likes,comments,shares']) {
      try {
        calls.add('yt:analytics.query');
        const r = await ya.reports.query({ ids: 'channel==MINE', startDate: start, endDate: end, metrics, dimensions: 'video', filters: `video==${shorts.map((v) => v.id).join(',')}`, sort: '-views', maxResults: 200 });
        const cols = (r.data.columnHeaders || []).map((c: any) => c.name);
        for (const row of r.data.rows || []) extra[row[0]] = Object.fromEntries(cols.map((c: string, i: number) => [c, row[i]]));
        break;
      } catch (e: any) {
        if (metrics.includes('average')) continue;
        warnings.push(`유튜브 Analytics 없음 (공유·시청 지속률 제외): ${String(e.message).slice(0, 120)} — 유튜브 재연결로 권한 추가`);
      }
    }
  }

  const out: Post[] = [];
  for (const v of shorts) {
    const a = extra[v.id] || {};
    const comments: Post['comments'] = [];
    if (Number(v.statistics?.commentCount || 0) > 0) {
      try {
        calls.add('yt:commentThreads.list');
        const c = await yt.commentThreads.list({ part: ['snippet'], videoId: v.id, maxResults: 20, order: 'relevance', textFormat: 'plainText' });
        for (const t of c.data.items || []) { const s = t.snippet?.topLevelComment?.snippet; if (s?.textDisplay) comments.push({ text: clean(s.textDisplay), likes: Number(s.likeCount || 0), at: s.publishedAt || '' }); }
      } catch { /* 댓글 사용 안 함 */ }
    }
    out.push({
      platform: 'youtube', external_id: v.id, url: `https://youtube.com/shorts/${v.id}`, title: v.snippet?.title || '', caption: clean(v.snippet?.description || ''),
      thumbnail_url: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || null, published_at: v.snippet?.publishedAt, duration_sec: iso8601(v.contentDetails?.duration),
      metrics: {
        views: num(v.statistics?.viewCount), likes: num(v.statistics?.likeCount), comments: num(v.statistics?.commentCount),
        shares: num(a.shares), avg_view_pct: num(a.averageViewPercentage), avg_watch_sec: num(a.averageViewDuration), subs_gained: num(a.subscribersGained), saves: null, reach: null,
      },
      comments,
    });
  }
  return out;
}

async function instagram(link: string, sinceIso: string, warnings: string[]): Promise<Post[]> {
  const user = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!user || !token) { warnings.push('인스타: IG_USER_ID / IG_ACCESS_TOKEN 이 없어 건너뜀'); return []; }
  const G = process.env.IG_GRAPH_BASE || `https://${process.env.IG_GRAPH_HOST || 'graph.facebook.com'}/${process.env.GRAPH_VERSION || 'v21.0'}`;
  const get = async (path: string, params: Record<string, string> = {}) => {
    calls.add('ig');
    const u = path.startsWith('http') ? path : `${G}/${path}?${new URLSearchParams({ ...params, access_token: token })}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
    const j: any = await r.json();
    if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`);
    return j;
  };
  const me = await get(user, { fields: 'username' });
  const want = parseInstagram(link);
  if (want && me.username && want.toLowerCase() !== String(me.username).toLowerCase()) warnings.push(`인스타: 설정한 계정(${want})과 토큰의 계정(${me.username})이 다릅니다 — 토큰 계정 기준으로 수집`);

  const media: any[] = [];
  let page: any = await get(`${user}/media`, { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url', limit: '50' });
  for (let i = 0; i < 4 && page; i++) {
    for (const m of page.data || []) { if (m.timestamp < sinceIso) { page = null; break; } media.push(m); }
    page = page?.paging?.next ? await get(page.paging.next) : null;
  }
  const reels = media.filter((m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO');
  const out: Post[] = [];
  for (const m of reels) {
    let ins: Record<string, number> = {};
    for (const metric of ['views,reach,saved,shares,total_interactions,ig_reels_avg_watch_time', 'views,reach,saved,shares']) {
      try { const r = await get(`${m.id}/insights`, { metric }); ins = Object.fromEntries((r.data || []).map((x: any) => [x.name, x.values?.[0]?.value ?? x.total_value?.value ?? null])); break; }
      catch (e: any) { if (!metric.includes('avg')) warnings.push(`인스타 insights 실패 (${m.id}): ${String(e.message).slice(0, 100)} — instagram_manage_insights 권한 확인`); }
    }
    const comments: Post['comments'] = [];
    if (Number(m.comments_count || 0) > 0) {
      try { const c = await get(`${m.id}/comments`, { fields: 'text,like_count,timestamp', limit: '20' }); for (const x of c.data || []) comments.push({ text: clean(x.text), likes: Number(x.like_count || 0), at: x.timestamp }); }
      catch { /* 권한 없음 */ }
    }
    out.push({
      platform: 'instagram', external_id: m.id, url: m.permalink, title: clean(m.caption || '').split(/[.!?\n]/)[0].slice(0, 80), caption: clean(m.caption || ''),
      thumbnail_url: m.thumbnail_url || null, published_at: m.timestamp, duration_sec: null,
      metrics: {
        views: num(ins.views), likes: num(m.like_count), comments: num(m.comments_count), shares: num(ins.shares), saves: num(ins.saved), reach: num(ins.reach),
        avg_watch_sec: ins.ig_reels_avg_watch_time != null ? Math.round(Number(ins.ig_reels_avg_watch_time) / 100) / 10 : null, // ms → 초
        avg_view_pct: null, subs_gained: null,
      },
      comments,
    });
  }
  return out;
}

const calls = counter();

export async function collectChannels() {
  const s = await settings();
  const since = new Date(Date.now() - Number(s.channel_lookback_days || 60) * 864e5).toISOString();
  const warnings: string[] = [];
  const posts: Post[] = [];
  if (s.youtube_channel || process.env.YT_REFRESH_TOKEN) { try { posts.push(...(await youtube(s.youtube_channel, since, warnings))); } catch (e: any) { warnings.push(`유튜브 수집 실패: ${e.message}`); } }
  if (s.instagram_account || process.env.IG_USER_ID) { try { posts.push(...(await instagram(s.instagram_account, since, warnings))); } catch (e: any) { warnings.push(`인스타 수집 실패: ${e.message}`); } }

  // 공장 콘텐츠와 연결
  const { data: cs } = await db.from('contents').select('id, youtube_id, instagram_id').or('youtube_id.not.is.null,instagram_id.not.is.null');
  const byYt = new Map((cs || []).filter((c: any) => c.youtube_id).map((c: any) => [c.youtube_id, c.id]));
  const byIg = new Map((cs || []).filter((c: any) => c.instagram_id).map((c: any) => [c.instagram_id, c.id]));
  const now = new Date().toISOString();
  let saved = 0;
  for (const p of posts) {
    const content_id = (p.platform === 'youtube' ? byYt : byIg).get(p.external_id) || null;
    const comments_hash = crypto.createHash('sha1').update(JSON.stringify(p.comments.map((c) => c.text))).digest('hex').slice(0, 12);
    const { data: row, error } = await db.from('channel_posts')
      .upsert({ ...p, content_id, comments_hash, collected_at: now }, { onConflict: 'platform,external_id' })
      .select('id, published_at').single();
    if (error) { warnings.push(`저장 실패 ${p.external_id}: ${error.message}`); continue; }
    await db.from('post_snapshots').insert({ post_id: row.id, metrics: p.metrics, age_hours: Math.round((Date.now() - +new Date(row.published_at)) / 36e5) });
    saved++;
  }
  // 채널 통계 API 사용량 (유튜브 쿼터 · 인스타 호출 수)
  const n = calls.get();
  const quota = Object.entries(n).filter(([k]) => k.startsWith('yt:')).reduce((q, [k, v]) => q + (YT_QUOTA[k.slice(3)] || 1) * v, 0);
  await logUsage([
    ...(quota ? [{ kind: 'analytics', platform: 'youtube', model: 'data-api-v3', price_key: 'api', units: quota, unit: '쿼터' }] : []),
    ...(n.ig ? [{ kind: 'analytics', platform: 'instagram', model: 'graph-api', price_key: 'api', units: n.ig, unit: '호출' }] : []),
  ], { task: 'channels', refTable: 'channel_posts', refId: now.slice(0, 10) });
  console.log(`채널 수집: 유튜브 ${posts.filter((p) => p.platform === 'youtube').length} · 인스타 ${posts.filter((p) => p.platform === 'instagram').length} · 저장 ${saved}`);
  for (const w of warnings) console.warn('⚠', w);
  return { collected: posts.length, saved, warnings };
}
