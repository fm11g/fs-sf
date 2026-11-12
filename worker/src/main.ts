import { db, env, log, setStep, settings } from './env.js';
import { render } from './render.js';
import { publish } from './publish.js';

const SITE = () => env('SITE_URL').replace(/\/$/, '');

async function call(path: string, body: any) {
  const res = await fetch(`${SITE()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-worker-secret': env('WORKER_SECRET') },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${json.error || res.status}`);
  return json;
}

/**
 * 공장 가동: 승인 가능한 곳까지 자동 진행.
 * - AI 단계는 사이트 API(/api/pipeline/advance)가 실행하고 결정 방식(사람/AI/자동)을 적용
 * - "사람이 결정" 단계에서 검수 대기로 멈춤 → 관리자가 승인 후 다시 진행
 */
async function factory(contentId: string | undefined, topic: string) {
  const s = await settings();
  if (!contentId) contentId = (await call('/api/contents', { topic })).id as string;
  console.log('content', contentId);

  for (let i = 0; i < 20; i++) {
    const r = await call('/api/pipeline/advance', { contentId });
    console.log(`▶ ${r.step ?? '-'}: ${r.action} — ${r.message}`);
    if (r.action === 'continue') continue;
    if (r.action === 'worker' && r.step === 'render') { await render(contentId); continue; }
    if (r.action === 'worker' && r.step === 'publish') {
      if (s.auto_publish) await publish(contentId);
      else await log(contentId, 'factory', 'done', '모든 단계 승인됨 — 관리자에서 게시하세요');
      return;
    }
    await log(contentId, 'factory', 'paused', r.message); // wait_review | running | done
    return;
  }
}

async function main() {
  const mode = process.env.MODE || 'factory';
  const contentId = process.env.CONTENT_ID || undefined;
  const topic = process.env.TOPIC || '';
  let targets: string[] | undefined;
  try { targets = JSON.parse(process.env.TARGETS_JSON || 'null') || undefined; } catch { /* 기본값 */ }

  try {
    if (mode === 'daily') {
      const s = await settings();
      if (!s.daily_enabled) return console.log('매일 자동 생산 꺼짐 — 종료');
      await factory(undefined, '');
    } else if (mode === 'factory') {
      await factory(contentId, topic);
    } else if (mode === 'render') {
      await render(contentId!);
    } else if (mode === 'publish') {
      await publish(contentId!, targets);
    } else {
      throw new Error(`알 수 없는 MODE: ${mode}`);
    }
  } catch (e: any) {
    console.error(e);
    if (contentId) {
      await db.from('contents').update({ status: 'failed', error: `[worker:${mode}] ${e.message}` }).eq('id', contentId);
      if (mode === 'render' || mode === 'publish') await setStep(contentId, mode, { state: 'failed', finished_at: new Date().toISOString() });
      await log(contentId, mode, 'failed', e.message);
    }
    process.exit(1);
  }
}

main();
