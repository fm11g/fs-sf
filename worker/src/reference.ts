import { logUsage } from './usage.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { db, env, uploadPublic } from './env.js';

/**
 * 참고 영상 추출: 영상 받기 → 길이·컷 전환·대표 프레임·대사(자막 또는 음성 인식) → DB 저장 → 사이트에 AI 분석 요청
 *  - 유튜브: yt-dlp (데이터센터 IP 차단으로 실패하면 → 정보만 YouTube Data API, 화면 분석은 "영상 파일 업로드" 권장)
 *  - 업로드: Supabase 스토리지 공개 URL
 */
const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_FRAMES = 14;

async function sh(cmd: string, args: string[], timeout = 240_000) {
  const { stdout, stderr } = await run(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 });
  return { stdout: String(stdout), stderr: String(stderr) };
}
const has = async (cmd: string) => sh('bash', ['-lc', `command -v ${cmd}`]).then(() => true, () => false);

/** VTT → [초] 문장 (자동 자막의 겹치는 줄 제거) */
export function parseVtt(vtt: string) {
  const out: { t: number; text: string }[] = [];
  const seen = new Set<string>();
  const toSec = (x: string) => { const p = x.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  for (const block of vtt.replace(/\r/g, '').split('\n\n')) {
    const m = block.match(/(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})\s+-->/);
    if (!m) continue;
    const lines = block.split('\n').filter((l) => !l.includes('-->') && !/^(WEBVTT|Kind:|Language:|NOTE)/.test(l) && !/^\d+$/.test(l.trim()));
    for (const l of lines) {
      const text = l.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push({ t: toSec(m[1]), text });
    }
  }
  return out;
}
const fmtLines = (xs: { t: number; text: string }[]) => xs.map((x) => `[${x.t.toFixed(1)}] ${x.text}`).join('\n');

async function ytdlp(url: string, dir: string) {
  const meta: any = {};
  let video: string | null = null;
  let subs: string | null = null;
  const warn: string[] = [];
  if (!(await has('yt-dlp'))) { warn.push('yt-dlp 없음'); return { meta, video, subs, warn }; }
  const common = ['--no-playlist', '--no-warnings', '--extractor-args', 'youtube:player_client=default,web_safari,android_vr'];
  try {
    const { stdout } = await sh('yt-dlp', [...common, '-J', url], 90_000);
    const j = JSON.parse(stdout);
    Object.assign(meta, { title: j.title, channel: j.channel || j.uploader, duration: j.duration, view_count: j.view_count, like_count: j.like_count, comment_count: j.comment_count, upload_date: j.upload_date, description: j.description, width: j.width, height: j.height, tags: (j.tags || []).slice(0, 15) });
  } catch (e: any) { warn.push(`정보 조회 실패: ${String(e.stderr || e.message).slice(-200)}`); }
  try {
    await sh('yt-dlp', [...common, '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b', '--merge-output-format', 'mp4',
      '--write-subs', '--write-auto-subs', '--sub-langs', 'ko.*,ko,en.*', '--sub-format', 'vtt', '-o', path.join(dir, 'v.%(ext)s'), url], 300_000);
  } catch (e: any) { warn.push(`영상 받기 실패: ${String(e.stderr || e.message).slice(-200)}`); }
  const files = await fs.readdir(dir);
  const v = files.find((f) => /^v\.(mp4|mkv|webm)$/.test(f));
  if (v) video = path.join(dir, v);
  const s = files.filter((f) => f.endsWith('.vtt')).sort((a, b) => Number(/\.ko/.test(b)) - Number(/\.ko/.test(a)))[0];
  if (s) subs = await fs.readFile(path.join(dir, s), 'utf8');
  return { meta, video, subs, warn };
}

async function youtubeApiMeta(url: string) {
  const id = url.match(/[?&]v=([\w-]{11})/)?.[1];
  const key = process.env.YT_API_KEY;
  if (!id || !key) return {};
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${id}&key=${key}`);
  const it = (await r.json() as any).items?.[0];
  if (!it) return {};
  const iso = it.contentDetails?.duration || '';
  const m = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?/) || [];
  return {
    title: it.snippet?.title, channel: it.snippet?.channelTitle, description: it.snippet?.description, upload_date: it.snippet?.publishedAt?.slice(0, 10),
    duration: Number(m[1] || 0) * 60 + Number(m[2] || 0), view_count: Number(it.statistics?.viewCount || 0), like_count: Number(it.statistics?.likeCount || 0), comment_count: Number(it.statistics?.commentCount || 0),
    thumbnail: it.snippet?.thumbnails?.maxres?.url || it.snippet?.thumbnails?.high?.url,
  };
}

async function probe(file: string) {
  const { stdout } = await sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]);
  const j = JSON.parse(stdout);
  return { duration: Number(j.format?.duration || 0), width: j.streams?.[0]?.width, height: j.streams?.[0]?.height };
}

/** 장면 전환 시각 (ffmpeg scene 점수 0.3 이상) */
async function sceneCuts(file: string) {
  const { stderr } = await sh('ffmpeg', ['-hide_banner', '-i', file, '-filter:v', "select='gt(scene,0.3)',showinfo", '-an', '-f', 'null', '-'], 300_000).catch((e) => ({ stderr: String(e.stderr || '') }));
  const cuts = [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  return cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > 0.25);
}

/** 대표 프레임: 훅(0.3·1·2초) + 각 컷의 가운데 (최대 14장) */
export function pickFrameTimes(duration: number, cuts: number[], max = MAX_FRAMES) {
  const hook = [0.3, 1, 2].filter((t) => t < duration);
  const bounds = [0, ...cuts, duration];
  let mids = bounds.slice(0, -1).map((b, i) => (b + bounds[i + 1]) / 2).filter((t) => t > 2.3 && t < duration - 0.2);
  const room = max - hook.length;
  if (mids.length > room) mids = Array.from({ length: room }, (_, i) => mids[Math.floor((i * mids.length) / room)]);
  if (mids.length < Math.min(room, 6) && duration > 3) mids = Array.from({ length: Math.min(room, 8) }, (_, i) => 2.5 + ((duration - 3) * (i + 0.5)) / Math.min(room, 8));
  return [...new Set([...hook, ...mids].map((t) => Math.round(t * 10) / 10))].sort((a, b) => a - b);
}

async function transcribe(audio: string): Promise<{ lines: { t: number; text: string }[]; via: string } | null> {
  const buf = await fs.readFile(audio);
  if (process.env.OPENAI_API_KEY) {
    try {
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'a.mp3');
      fd.append('model', 'whisper-1');
      fd.append('language', 'ko');
      fd.append('response_format', 'verbose_json');
      const r = await fetch(`${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd });
      const j: any = await r.json();
      if (r.ok) return { via: 'openai', lines: (j.segments || [{ start: 0, text: j.text }]).map((s: any) => ({ t: Number(s.start || 0), text: String(s.text || '').trim() })) };
      console.warn('OpenAI 음성 인식 실패', j.error?.message);
    } catch (e: any) { console.warn('OpenAI 음성 인식 실패', e.message); }
  }
  if (process.env.FISH_AUDIO_API_KEY) {
    try {
      const fd = new FormData();
      fd.append('audio', new Blob([buf], { type: 'audio/mpeg' }), 'a.mp3');
      fd.append('language', 'ko');
      fd.append('ignore_timestamps', 'false');
      const r = await fetch('https://api.fish.audio/v1/asr', { method: 'POST', headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}` }, body: fd });
      const j: any = await r.json();
      if (r.ok) return { via: 'fish', lines: (j.segments?.length ? j.segments : [{ start: 0, text: j.text }]).map((s: any) => ({ t: Number(s.start || 0), text: String(s.text || '').trim() })) };
      console.warn('Fish 음성 인식 실패', JSON.stringify(j).slice(0, 200));
    } catch (e: any) { console.warn('Fish 음성 인식 실패', e.message); }
  }
  return null;
}

async function callSite(p: string, body: any) {
  const res = await fetch(`${env('SITE_URL').replace(/\/$/, '')}${p}`, {
    method: 'POST', signal: AbortSignal.timeout(290_000),
    headers: { 'content-type': 'application/json', 'x-worker-secret': env('WORKER_SECRET') },
    body: JSON.stringify(body),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p}: ${j.error || res.status}`);
  return j;
}

export async function analyzeReference(refId: number) {
  const { data: r, error } = await db.from('ref_videos').select('*').eq('id', refId).single();
  if (error || !r) throw new Error(`참고 영상 #${refId} 없음`);
  await db.from('ref_videos').update({ status: 'analyzing', error: null }).eq('id', refId);
  const dir = path.join(ROOT, 'out', `ref-${refId}`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const warn: string[] = [];

  try {
    let meta: any = { ...(r.meta || {}) };
    let video: string | null = null;
    let subs: string | null = null;
    if (r.kind === 'upload') {
      const res = await fetch(r.url);
      if (!res.ok) throw new Error(`업로드 영상 받기 실패 ${res.status}`);
      video = path.join(dir, 'v.mp4');
      await fs.writeFile(video, Buffer.from(await res.arrayBuffer()));
    } else {
      const y = await ytdlp(r.url, dir);
      Object.assign(meta, y.meta);
      video = y.video; subs = y.subs; warn.push(...y.warn);
      if (!meta.title && r.kind === 'youtube') Object.assign(meta, await youtubeApiMeta(r.url).catch(() => ({})));
    }

    let cuts: number[] = [];
    let frames: { t: number; url: string; path: string }[] = [];
    let lines: { t: number; text: string }[] = [];
    let via = '';
    if (video) {
      const p = await probe(video);
      meta = { ...meta, duration: meta.duration || Math.round(p.duration * 10) / 10, width: p.width, height: p.height };
      cuts = await sceneCuts(video);
      const times = pickFrameTimes(p.duration, cuts);
      for (const [i, t] of times.entries()) {
        const out = path.join(dir, `f${String(i).padStart(2, '0')}.jpg`);
        await sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', '-y', out]);
        const sp = `refs/${refId}/f${String(i).padStart(2, '0')}.jpg`;
        frames.push({ t, path: sp, url: await uploadPublic(sp, await fs.readFile(out), 'image/jpeg') });
      }
      if (subs) { lines = parseVtt(subs); via = 'subtitles'; }
      if (!lines.length) {
        const audio = path.join(dir, 'a.mp3');
        await sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', '-y', audio]).catch(() => null);
        const ts = Date.now();
        const tr = await transcribe(audio).catch(() => null);
        if (tr) {
          // 음성 인식 사용량 (분 단위)
          await logUsage([{ kind: 'stt', platform: tr.via === 'openai' ? 'openai' : 'fish', model: tr.via === 'openai' ? 'whisper-1' : 'asr', price_key: tr.via === 'openai' ? 'whisper-1' : 'asr', units: Number(meta.duration || 0) / 60, unit: '분', ms: Date.now() - ts }], { task: 'reference', refTable: 'ref_videos', refId: String(refId) });
        }
        if (tr) { lines = tr.lines; via = tr.via; } else warn.push('대사 추출 실패 (자막 없음 · OpenAI/Fish 음성 인식 키 없음)');
      }
    } else {
      if (subs) { lines = parseVtt(subs); via = 'subtitles'; }
      if (meta.thumbnail) frames = [{ t: 0, path: '', url: meta.thumbnail }];
      warn.push('영상 화면을 받지 못해 정보·자막 위주로 분석합니다 — 화면(자막 위치·색·컷)까지 배우려면 영상 파일을 직접 올리세요');
    }

    const transcript = lines.length ? fmtLines(lines) : null;
    const chars = lines.reduce((n, x) => n + x.text.replace(/\s/g, '').length, 0);
    meta = { ...meta, transcript_via: via || null, cuts: cuts.length, chars_per_sec: meta.duration ? Math.round((chars / meta.duration) * 10) / 10 : null, warnings: warn };
    await db.from('ref_videos').update({ meta, cuts, frames, transcript, title: r.title || meta.title || null, channel: r.channel || meta.channel || null }).eq('id', refId);
    console.log(`참고 영상 #${refId}: ${meta.duration}s · 컷 ${cuts.length} · 프레임 ${frames.length} · 대사 ${lines.length}줄(${via || '-'})`);
    if (warn.length) console.warn(warn.join('\n'));

    const res = await callSite('/api/references/analyze', { ref_id: refId });
    console.log('AI 분석:', JSON.stringify(res).slice(0, 300));
    if (warn.length) await db.from('ref_videos').update({ error: warn.join(' · ').slice(0, 500) }).eq('id', refId);
    return res;
  } catch (e: any) {
    await db.from('ref_videos').update({ status: 'failed', error: String(e.message).slice(0, 500) }).eq('id', refId);
    throw e;
  }
}
