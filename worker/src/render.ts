import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { db, gateOf, getStep, log, notifySite, setStep, settings, syncCurrent, uploadPublic } from './env.js';
import { logUsage } from './usage.js';
import { tts } from './tts.js';
import { buildProps, narrationOf } from '../video/props.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const PAD = 0.25; // 장면 사이 호흡(초)

export async function render(contentId: string) {
  const { data: c, error } = await db.from('contents').select('*').eq('id', contentId).single();
  if (error || !c) throw new Error('콘텐츠 없음');
  if (!c.script || !c.design) throw new Error('대사·디자인 단계가 필요합니다');
  const s = await settings();
  await db.from('contents').update({ status: 'rendering', error: null }).eq('id', contentId);
  const prev = await getStep(contentId, 'render');
  const t0 = Date.now();
  await setStep(contentId, 'render', { state: 'running', started_at: new Date().toISOString(), attempts: (prev.attempts || 0) + 1 });
  await fs.mkdir(OUT, { recursive: true });

  // 1) AI 목소리: 장면별 TTS → 실제 길이로 타이밍 확정
  await log(contentId, 'voice', 'running');
  const audio: any[] = [];
  const ttsRows: any[] = [];
  for (const sc of c.script.scenes) {
    // 영상 편집기에서 바꾼 내레이션이 있으면 그 문장으로 읽음
    const g = (c.design?.scenes || []).find((x: any) => x.id === sc.id);
    const text = narrationOf(sc, g);
    const tt = Date.now();
    const { buf, duration } = await tts(text, s);
    ttsRows.push({ kind: 'tts', platform: 'fish', model: s.tts_model || 's1', price_key: 'tts', units: text.length, unit: '글자', ms: Date.now() - tt });
    const url = await uploadPublic(`contents/${c.slug}/voice-${sc.id}.mp3`, buf, 'audio/mpeg');
    audio.push({ id: sc.id, url, duration: Number((duration + PAD).toFixed(2)), text }); // text: 편집기에서 대사가 바뀌었는지 판단용
  }
  await logUsage(ttsRows, { contentId, step: 'render', task: 'tts' });
  await log(contentId, 'voice', 'done', `총 ${audio.reduce((n, a) => n + a.duration, 0).toFixed(1)}초`);

  // 2) BGM 선택
  let bgmUrl: string | null = null;
  if (c.bgm_id) {
    bgmUrl = (await db.from('bgm_tracks').select('url').eq('id', c.bgm_id).single()).data?.url ?? null;
  } else {
    const { data: tracks } = await db.from('bgm_tracks').select('url, mood').eq('active', true);
    const pool = (tracks || []).filter((t) => t.mood === c.plan?.mood);
    const pick = (pool.length ? pool : tracks || [])[Math.floor(Math.random() * ((pool.length || tracks?.length) || 1))];
    bgmUrl = pick?.url ?? null;
  }

  // 3) 모션그래픽 + 자막 + 음성 + BGM 합성
  const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date());
  const inputProps = buildProps(c, { brand: c.design?.brand_text || s.brand, dateLabel, audio, bgmUrl });
  const scenes = inputProps.scenes;
  const totalSec = scenes.reduce((n, x) => n + x.durationSec, 0); // 편집기의 장면 여백(hold) 포함

  await log(contentId, 'render', 'running', `${scenes.length}개 장면 · ${inputProps.size?.w}x${inputProps.size?.h}`);
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'video/index.ts') });
  const composition = await selectComposition({ serveUrl, id: 'Short', inputProps });
  const mp4 = path.join(OUT, `${c.slug}.mp4`);
  await renderMedia({
    composition, serveUrl, inputProps, codec: 'h264', audioCodec: 'aac', crf: 20, outputLocation: mp4,
    onProgress: ({ progress }) => { if (Math.round(progress * 100) % 20 === 0) console.log(`render ${Math.round(progress * 100)}%`); },
  });

  // 4) 썸네일 + 정보글용 이미지 (장면별 정지 화면)
  let from = 0;
  const marks = scenes.map((x: any) => { const f = Math.round((from + Math.min(1.2, x.durationSec * 0.6)) * 30); from += x.durationSec; return { id: x.id, f, headline: x.headline }; });
  const pickIdx = [...new Set([0, Math.floor(marks.length / 3), Math.floor((marks.length * 2) / 3), marks.length - 1])];
  const images: { url: string; alt: string }[] = [];
  for (const i of pickIdx) {
    const out = path.join(OUT, `${c.slug}-${marks[i].id}.jpg`);
    await renderStill({ composition, serveUrl, inputProps, frame: marks[i].f, output: out, imageFormat: 'jpeg', jpegQuality: 88 });
    const url = await uploadPublic(`contents/${c.slug}/still-${marks[i].id}.jpg`, await fs.readFile(out), 'image/jpeg');
    images.push({ url, alt: `${c.topic || s.brand} - ${marks[i].headline}` });
  }

  const videoUrl = await uploadPublic(`contents/${c.slug}/short.mp4`, await fs.readFile(mp4), 'video/mp4');
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
  await notifySite('render_done', contentId, 'render');
  return { videoUrl, mp4, approved: pass };
}
