import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { db, gateOf, getStep, log, notifySite, setStep, settings, syncCurrent, uploadPublic } from './env.js';
import { logUsage } from './usage.js';
import { tts } from './tts.js';
import { buildProps, narrationOf } from '../video/props.js';
import { sceneStarts } from '../video/common.js';
import { getCurrent, Progress, setCurrent } from './progress.js';
import { Watchdog } from './watchdog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const PAD = 0.25; // 장면 사이 호흡(초)

/**
 * 렌더 — 감시견과 경주: [중지]·전체 시간 초과·진행 멈춤이면 기다리지 않고 바로 빠져나감 (StopError).
 * 기준은 설정의 render_timeout_min · render_stall_sec (worker/video/limits.ts)
 */
export async function render(contentId: string) {
  const s = await settings();
  const wd = new Watchdog(contentId, s, getCurrent);
  try {
    return await Promise.race([renderInner(contentId, s, wd), wd.promise]);
  } finally {
    wd.stop();
  }
}

async function renderInner(contentId: string, s: any, wd: Watchdog) {
  const { data: c, error } = await db.from('contents').select('*').eq('id', contentId).single();
  if (error || !c) throw new Error('콘텐츠 없음');
  if (!c.script || !c.design) throw new Error('대사·디자인 단계가 필요합니다');
  const pr = await Progress.start(contentId); // 이미 중지된 요청이면 여기서 멈춤
  setCurrent(pr);
  pr.log(`자동 정지 기준: 전체 ${wd.limits.render_timeout_min}분 · 진행 없음 ${wd.limits.render_stall_sec}초`, 'setup');
  await db.from('contents').update({ status: 'rendering', error: null }).eq('id', contentId);
  const prev = await getStep(contentId, 'render');
  const t0 = Date.now();
  await setStep(contentId, 'render', { state: 'running', started_at: new Date().toISOString(), attempts: (prev.attempts || 0) + 1 });
  await fs.mkdir(OUT, { recursive: true });
  const dScenes: any[] = c.design?.scenes || [];
  pr.set({ scenes: c.script.scenes.map((sc: any) => { const g = dScenes.find((x: any) => x.id === sc.id) || {}; return { id: sc.id, layout: g.layout, headline: String(g.headline || sc.captions?.[0] || '').replace(/\n/g, ' ').slice(0, 40), voice: 'wait' }; }) });

  // 1) AI 목소리: 장면별 TTS → 실제 길이로 타이밍 확정
  await log(contentId, 'voice', 'running');
  const n = c.script.scenes.length;
  await pr.begin('voice', `${n}개 장면 · ${s.tts_model || 's1'} · 속도 ${s.tts_speed || 1}`);
  const audio: any[] = [];
  const ttsRows: any[] = [];
  for (const [i, sc] of c.script.scenes.entries()) {
    // 영상 편집기에서 바꾼 내레이션이 있으면 그 문장으로 읽음
    const g = dScenes.find((x: any) => x.id === sc.id);
    const text = narrationOf(sc, g);
    wd.guard();
    const row = pr.p.scenes?.[i];
    if (row) row.voice = 'running';
    pr.step('voice', (i / n) * 100, `장면 ${i + 1}/${n} 읽는 중 — "${text.slice(0, 24)}${text.length > 24 ? '…' : ''}"`);
    const tt = Date.now();
    const { buf, duration } = await tts(text, s);
    ttsRows.push({ kind: 'tts', platform: 'fish', model: s.tts_model || 's1', price_key: 'tts', units: text.length, unit: '글자', ms: Date.now() - tt });
    const url = await uploadPublic(`contents/${c.slug}/voice-${sc.id}.mp3`, buf, 'audio/mpeg');
    audio.push({ id: sc.id, url, duration: Number((duration + PAD).toFixed(2)), text }); // text: 편집기에서 대사가 바뀌었는지 판단용
    if (row) Object.assign(row, { voice: 'done', voice_url: url, sec: Number((duration + PAD).toFixed(2)) });
    pr.log(`장면 ${i + 1} ${sc.id} 목소리 ${duration.toFixed(1)}초 · ${text.length}자 (${((Date.now() - tt) / 1000).toFixed(1)}초 걸림)`, 'voice');
    pr.step('voice', ((i + 1) / n) * 100);
  }
  await logUsage(ttsRows, { contentId, step: 'render', task: 'tts' });
  await log(contentId, 'voice', 'done', `총 ${audio.reduce((n, a) => n + a.duration, 0).toFixed(1)}초`);
  await pr.done('voice', `총 ${audio.reduce((n, a) => n + a.duration, 0).toFixed(1)}초`);

  // 2) BGM 선택
  await pr.begin('bgm');
  let bgmUrl: string | null = null;
  let bgmName = '';
  if (c.bgm_id) {
    const t = (await db.from('bgm_tracks').select('url, title').eq('id', c.bgm_id).single()).data;
    bgmUrl = t?.url ?? null; bgmName = t ? `지정 음원 "${t.title}"` : '';
  } else {
    const { data: tracks } = await db.from('bgm_tracks').select('url, mood, title').eq('active', true);
    const pool = (tracks || []).filter((t) => t.mood === c.plan?.mood);
    const pick = (pool.length ? pool : tracks || [])[Math.floor(Math.random() * ((pool.length || tracks?.length) || 1))];
    bgmUrl = pick?.url ?? null; bgmName = pick ? `"${pick.title}" (${pool.length ? `무드 ${c.plan?.mood}` : '무드 맞는 음원 없어 무작위'})` : '';
  }
  await pr.done('bgm', bgmName || 'BGM 없음');

  // 3) 모션그래픽 + 자막 + 음성 + BGM 합성
  const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date());
  const inputProps = buildProps(c, { brand: c.design?.brand_text || s.brand, dateLabel, audio, bgmUrl });
  const scenes = inputProps.scenes;
  const totalSec = scenes.reduce((n, x) => n + x.durationSec, 0); // 편집기의 장면 여백(hold) 포함

  await log(contentId, 'render', 'running', `${scenes.length}개 장면 · ${inputProps.size?.w}x${inputProps.size?.h}`);
  wd.guard();
  await pr.begin('bundle', `${inputProps.template === 'news' ? '언론사' : '기본'} 템플릿 · ${inputProps.size?.w}x${inputProps.size?.h}`);
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'video/index.ts'), onProgress: (x: number) => pr.step('bundle', x * 0.9) });
  const composition = await selectComposition({ serveUrl, id: 'Short', inputProps });
  const total = composition.durationInFrames;
  const starts = sceneStarts(inputProps);
  pr.set({
    size: `${composition.width}x${composition.height}`,
    frames: { done: 0, encoded: 0, total },
    scenes: scenes.map((x: any, i: number) => ({ ...(pr.p.scenes?.find((r) => r.id === x.id) || { id: x.id }), sec: Number(x.durationSec.toFixed(2)), from: starts[i], to: i + 1 < starts.length ? starts[i + 1] : total })),
  });
  await pr.done('bundle', `${total}프레임 · ${(total / 30).toFixed(1)}초 · 30fps`);
  const mp4 = path.join(OUT, `${c.slug}.mp4`);
  wd.guard();
  const { cancelSignal, cancel } = makeCancelSignal();
  wd.whenStop(cancel); // 중지·자동 정지 → Remotion 렌더 즉시 취소
  await pr.begin('frames', `${total}프레임`);
  const tf = Date.now();
  let encStarted = false;
  await renderMedia({
    composition, serveUrl, inputProps, codec: 'h264', audioCodec: 'aac', crf: 20, outputLocation: mp4, cancelSignal,
    onProgress: ({ renderedFrames, encodedFrames, stitchStage }) => {
      const el = (Date.now() - tf) / 1000;
      const fps = el > 0 ? renderedFrames / el : 0;
      const si = Math.max(0, starts.findIndex((f, i) => renderedFrames >= f && renderedFrames < (starts[i + 1] ?? Infinity)));
      const sc = scenes[si] as any;
      pr.p.frames = { done: renderedFrames, encoded: encodedFrames, total, fps: Math.round(fps * 10) / 10 };
      if (renderedFrames < total) {
        pr.step('frames', (renderedFrames / total) * 100, `${renderedFrames}/${total} 프레임 · 장면 ${si + 1}/${scenes.length}${sc?.layout ? ` (${sc.layout})` : ''} · ${fps.toFixed(1)}fps`);
      } else if (pr.p.stages.frames.state !== 'done') {
        pr.done('frames', `${total}프레임 · 평균 ${fps.toFixed(1)}fps`);
      }
      if (!encStarted && encodedFrames > 0) { encStarted = true; pr.p.stages.encode = { state: 'running', pct: 0, started_at: new Date().toISOString() }; pr.log('인코딩 시작 (그리면서 동시에 압축)', 'encode'); }
      if (encStarted && pr.p.stages.encode.state !== 'done') {
        pr.step('encode', stitchStage === 'muxing' ? 95 : (encodedFrames / total) * 90, stitchStage === 'muxing' ? '목소리·BGM 합치는 중' : `${encodedFrames}/${total} 프레임 압축`);
      }
    },
  });
  if (pr.p.stages.frames.state !== 'done') await pr.done('frames');
  const mp4Size = (await fs.stat(mp4)).size;
  await pr.done('encode', `H.264 · ${(mp4Size / 1048576).toFixed(1)}MB`);

  // 4) 썸네일 + 정보글용 이미지 (장면별 정지 화면)
  let from = 0;
  const marks = scenes.map((x: any) => { const f = Math.round((from + Math.min(1.2, x.durationSec * 0.6)) * 30); from += x.durationSec; return { id: x.id, f, headline: x.headline }; });
  const pickIdx = [...new Set([0, Math.floor(marks.length / 3), Math.floor((marks.length * 2) / 3), marks.length - 1])];
  const images: { url: string; alt: string }[] = [];
  await pr.begin('stills', `${pickIdx.length}장`);
  for (const [k, i] of pickIdx.entries()) {
    wd.guard();
    pr.step('stills', (k / pickIdx.length) * 100, `장면 ${i + 1} 정지 화면`);
    const out = path.join(OUT, `${c.slug}-${marks[i].id}.jpg`);
    await renderStill({ composition, serveUrl, inputProps, frame: marks[i].f, output: out, imageFormat: 'jpeg', jpegQuality: 88 });
    const url = await uploadPublic(`contents/${c.slug}/still-${marks[i].id}.jpg`, await fs.readFile(out), 'image/jpeg');
    images.push({ url, alt: `${c.topic || s.brand} - ${marks[i].headline}` });
    pr.set({ stills: images.map((x) => x.url) });
  }
  await pr.done('stills', `${images.length}장`);

  wd.guard();
  await pr.begin('upload', `${(mp4Size / 1048576).toFixed(1)}MB`);
  const videoUrl = await uploadPublic(`contents/${c.slug}/short.mp4`, await fs.readFile(mp4), 'video/mp4');
  await pr.done('upload');
  await pr.begin('check');
  await db.from('contents').update({
    status: 'rendered', video_url: videoUrl, thumbnail_url: images[0]?.url ?? null, images, audio: { scenes: audio, bgmUrl, totalSec },
  }).eq('id', contentId);
  // 규칙 검사 + 결정 방식 적용 (영상 내용은 사람이 확인하는 것이 기본)
  const checks = [
    totalSec < 35 || totalSec > 45
      ? { level: totalSec < 30 || totalSec > 50 ? 'error' : 'warn', msg: `영상 길이 ${totalSec.toFixed(1)}초 (35~45초 권장) → 대사 글자수나 말 속도를 조정` }
      : { level: 'ok', msg: `영상 길이 ${totalSec.toFixed(1)}초` },
    bgmUrl ? { level: 'ok', msg: 'BGM 적용' } : { level: 'warn', msg: 'BGM 없음 (설정에서 음원 업로드)' },
  ];
  // 렌더 서버 사용 시간 (GitHub Actions 분 단위 과금 기준)
  await logUsage([{ kind: 'render', platform: process.env.GITHUB_ACTIONS ? 'github' : 'local', model: 'remotion', price_key: 'actions', units: (Date.now() - t0) / 60000, unit: '분', ms: Date.now() - t0 }], { contentId, step: 'render', task: 'render' });
  const { data: costRows } = await db.from('usage_log').select('cost_usd').eq('content_id', contentId).eq('step', 'render');
  const renderCost = (costRows || []).reduce((n: number, r: any) => n + Number(r.cost_usd || 0), 0);
  const gate = await gateOf('render');
  const pass = gate !== 'manual' && !checks.some((k) => k.level === 'error');
  const t = new Date().toISOString();
  await setStep(contentId, 'render', {
    state: pass ? 'approved' : 'review', decided_by: pass ? (gate === 'ai' ? 'ai' : 'auto') : null, decided_at: pass ? t : null,
    checks, finished_at: t, work_ms: Number(prev.work_ms || 0) + (Date.now() - t0), cost_usd: Math.round(renderCost * 1e6) / 1e6,
  });
  await syncCurrent(contentId);
  await log(contentId, 'render', 'done', `${totalSec.toFixed(1)}초 영상 · ${pass ? '자동 승인' : '검수 대기'}`);
  for (const k of checks) if (k.level !== 'ok') pr.log(k.msg, 'check', k.level === 'error' ? 'error' : 'warn');
  await pr.done('check', `${totalSec.toFixed(1)}초 · ${pass ? '자동 승인' : '검수 대기'}`);
  await pr.finish({ video_url: videoUrl, total_sec: Number(totalSec.toFixed(1)), approved: pass });
  setCurrent(null);
  await notifySite('render_done', contentId, 'render');
  return { videoUrl, mp4, approved: pass };
}
