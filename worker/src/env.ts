import { createClient } from '@supabase/supabase-js';

export const env = (k: string, required = true) => {
  const v = process.env[k];
  if (required && !v) throw new Error(`환경변수 ${k} 가 없습니다`);
  return v || '';
};

export const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

export async function settings(): Promise<any> {
  const { data } = await db.from('settings').select('value').eq('id', 1).single();
  return data!.value;
}

export async function log(contentId: string, step: string, status: string, message?: string) {
  console.log(`[${step}] ${status}${message ? ' — ' + message : ''}`);
  await db.from('jobs').insert({ content_id: contentId, step, status, message });
}

export async function uploadPublic(path: string, body: Buffer, contentType: string) {
  const { error } = await db.storage.from('media').upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`스토리지 업로드 실패 ${path}: ${error.message}`);
  return db.storage.from('media').getPublicUrl(path).data.publicUrl;
}

/** 단계 상태 기록 (관리자 현황판·효율 지표와 공유) */
export async function setStep(contentId: string, step: string, patch: Record<string, any>) {
  await db.from('steps').upsert({ content_id: contentId, step, ...patch }, { onConflict: 'content_id,step' });
}
export async function getStep(contentId: string, step: string): Promise<any> {
  const { data } = await db.from('steps').select('*').eq('content_id', contentId).eq('step', step).maybeSingle();
  return data || { attempts: 0, work_ms: 0 };
}
/** 결정 방식: manual | ai | auto (SOP·AI 제어에서 설정, 기본 manual) */
export async function gateOf(step: string): Promise<string> {
  const { data } = await db.from('sops').select('gate').eq('step', step).maybeSingle();
  return data?.gate || 'manual';
}
export async function syncCurrent(contentId: string) {
  const order = ['research', 'plan', 'script', 'offer', 'landing', 'design', 'copy', 'post', 'render', 'publish'];
  const { data } = await db.from('steps').select('step, state').eq('content_id', contentId);
  const cur = order.find((k) => (data || []).find((r: any) => r.step === k)?.state !== 'approved') || 'done';
  await db.from('contents').update({ current_step: cur }).eq('id', contentId);
}

/** 사이트의 알림 API 호출 (메일 발송은 사이트 한 곳에서). 실패해도 워커는 계속 */
export async function notifySite(event: string, contentId: string, step?: string, message?: string) {
  try {
    const site = (process.env.SITE_URL || '').replace(/\/$/, '');
    if (!site || !process.env.WORKER_SECRET) return;
    await fetch(`${site}/api/notify`, {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'content-type': 'application/json', 'x-worker-secret': process.env.WORKER_SECRET },
      body: JSON.stringify({ event, contentId, step, message }),
    });
  } catch (e: any) { console.warn('알림 실패:', e.message); }
}
