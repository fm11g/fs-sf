import { YT_QUOTA, counter, logUsage } from './usage.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { google } from 'googleapis';
import { db, env, getStep, log, notifySite, setStep, syncCurrent } from './env.js';

const clean = (t: string, max: number) => [...(t || '').replace(/[<>]/g, '')].slice(0, max).join('');

async function download(url: string) {
  const file = path.join(os.tmpdir(), `short-${Date.now()}.mp4`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`영상 다운로드 실패 ${res.status}`);
  await fsp.writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

const calls = counter();

async function youtube(c: any) {
  const auth = new google.auth.OAuth2(env('YT_CLIENT_ID'), env('YT_CLIENT_SECRET'));
  auth.setCredentials({ refresh_token: env('YT_REFRESH_TOKEN') });
  const yt = google.youtube({ version: 'v3', auth });
  const file = await download(c.video_url);
  const y = c.copy.youtube;
  let title = clean(y.title, 100);
  if (!/#shorts/i.test(title) && title.length < 92) title += ' #shorts';

  calls.add('yt:videos.insert');
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description: clean(y.description, 5000), tags: (y.tags || []).slice(0, 15), categoryId: '22', defaultLanguage: 'ko', defaultAudioLanguage: 'ko' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(file) },
  });
  const videoId = res.data.id!;
  // 카피 + 랜딩 링크 댓글 (API로는 '고정'이 불가 → 스튜디오에서 1회 고정 클릭 필요)
  if (y.comment) {
    calls.add('yt:commentThreads.insert');
    await yt.commentThreads.insert({
      part: ['snippet'],
      requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: y.comment } } } },
    });
  }
  return videoId;
}

async function instagram(c: any) {
  const G = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v21.0'}`;
  const user = env('IG_USER_ID');
  const token = env('IG_ACCESS_TOKEN');
  const post = async (p: string, params: Record<string, string>) => {
    calls.add('ig');
    const r = await fetch(`${G}/${p}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: token }) });
    const j: any = await r.json();
    if (!r.ok || j.error) throw new Error(`IG ${p}: ${j.error?.message || r.status}`);
    return j;
  };
  const ig = c.copy.instagram;
  const container = await post(`${user}/media`, {
    media_type: 'REELS', video_url: c.video_url, caption: clean(ig.caption, 2200), share_to_feed: 'true',
    ...(c.thumbnail_url ? { cover_url: c.thumbnail_url } : {}),
  });
  // 인코딩 대기 (최대 ~6분)
  for (let i = 0; i < 72; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    calls.add('ig');
    const s: any = await (await fetch(`${G}/${container.id}?fields=status_code,status&access_token=${token}`)).json();
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`IG 인코딩 실패: ${s.status}`);
    if (i === 71) throw new Error('IG 인코딩 시간 초과');
  }
  const media = await post(`${user}/media_publish`, { creation_id: container.id });
  if (ig.first_comment) await post(`${media.id}/comments`, { message: ig.first_comment }).catch((e) => console.warn(e.message));
  return media.id as string;
}

export async function publish(contentId: string, targets: string[] = ['youtube', 'instagram']) {
  const { data: c } = await db.from('contents').select('*').eq('id', contentId).single();
  if (!c?.video_url || !c.copy) throw new Error('영상·카피가 필요합니다');
  await db.from('contents').update({ status: 'publishing', error: null }).eq('id', contentId);
  const prev = await getStep(contentId, 'publish');
  const t0 = Date.now();
  await setStep(contentId, 'publish', { state: 'running', started_at: new Date().toISOString(), attempts: (prev.attempts || 0) + 1 });

  const patch: any = {};
  const errors: string[] = [];
  if (targets.includes('youtube') && !c.youtube_id) {
    await log(contentId, 'youtube', 'running');
    try { patch.youtube_id = await youtube(c); await log(contentId, 'youtube', 'done', patch.youtube_id); }
    catch (e: any) { errors.push(`YouTube: ${e.message}`); await log(contentId, 'youtube', 'failed', e.message); }
  }
  if (targets.includes('instagram') && !c.instagram_id) {
    await log(contentId, 'instagram', 'running');
    try { patch.instagram_id = await instagram(c); await log(contentId, 'instagram', 'done', patch.instagram_id); }
    catch (e: any) { errors.push(`Instagram: ${e.message}`); await log(contentId, 'instagram', 'failed', e.message); }
  }

  // 업로드 API 사용량 (유튜브 = 쿼터 단위, 인스타 = 호출 수)
  const n = calls.get();
  const quota = Object.entries(n).filter(([k]) => k.startsWith('yt:')).reduce((q, [k, v]) => q + (YT_QUOTA[k.slice(3)] || 1) * v, 0);
  await logUsage([
    ...(quota ? [{ kind: 'upload', platform: 'youtube', model: 'data-api-v3', price_key: 'api', units: quota, unit: '쿼터', ok: !errors.some((e) => e.startsWith('YouTube')) }] : []),
    ...(n.ig ? [{ kind: 'upload', platform: 'instagram', model: 'graph-api', price_key: 'api', units: n.ig, unit: '호출', ok: !errors.some((e) => e.startsWith('Instagram')) }] : []),
  ], { contentId, step: 'publish', task: 'publish' });
  const anyOk = patch.youtube_id || patch.instagram_id || c.youtube_id || c.instagram_id;
  if (anyOk) {
    patch.status = 'published';
    patch.published_at = c.published_at || new Date().toISOString();
    // 랜딩 공개 (/l/today 는 가장 최근 공개 랜딩)
    await db.from('landing_variants').update({ is_live: true }).eq('content_id', contentId);
  } else {
    patch.status = 'failed';
  }
  patch.error = errors.length ? errors.join(' / ') : null;
  await db.from('contents').update(patch).eq('id', contentId);
  const t = new Date().toISOString();
  await setStep(contentId, 'publish', {
    state: anyOk ? 'approved' : 'failed', decided_by: anyOk ? 'auto' : null, decided_at: anyOk ? t : null, finished_at: t,
    work_ms: Number(prev.work_ms || 0) + (Date.now() - t0),
    checks: [
      ...errors.map((msg) => ({ level: 'error', msg })),
      ...(patch.youtube_id ? [{ level: 'warn', msg: '유튜브 스튜디오에서 방금 단 댓글을 "고정"하세요 (API 미지원)' }] : []),
    ],
  });
  await syncCurrent(contentId);
  await notifySite(anyOk ? 'published' : 'step_failed', contentId, 'publish', errors.length ? errors.join(' / ') : undefined);
  if (!anyOk) throw new Error(patch.error);
}
