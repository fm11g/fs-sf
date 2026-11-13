import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { clearModelCache, providersStatus } from '@/lib/llm';
import { TASKS, cleanModels, resolveTask, type ModelSettings } from '@/lib/models';
import { canStep } from '@/lib/perms';

export const dynamic = 'force-dynamic';

async function load(): Promise<{ value: any; models: ModelSettings }> {
  const { data } = await sbAdmin().from('settings').select('value').eq('id', 1).single();
  return { value: data?.value || {}, models: cleanModels(data?.value?.models || {}) };
}

/** 작업별 적용 모델 (직원은 볼 수 있는 단계만) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  const { models } = await load();
  const visible = TASKS.filter((t) => g.me.role !== 'staff' || (t.group === '공정 단계' && canStep(g.me, t.key)));
  const applied = Object.fromEntries(visible.map((t) => [t.key, resolveTask(models, t.key)]));
  return NextResponse.json({
    applied,
    ...(g.me.role === 'staff' ? {} : { saved: models, providers: providersStatus() }),
  });
}

/** 저장 (대표만): { task, model } 한 작업 · { models } 전체 · { reset: task } 기본값으로 */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'settings');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  const { value, models } = await load();
  let next: ModelSettings = models;
  if (b.models) next = cleanModels(b.models);
  else if (b.reset) { const tasks = { ...(models.tasks || {}) }; delete tasks[b.reset]; next = { ...models, tasks }; }
  else if (b.task) next = cleanModels({ ...models, tasks: { ...(models.tasks || {}), [b.task]: b.model } });
  else if (b.default) next = cleanModels({ ...models, default: b.default });
  const { error } = await sbAdmin().from('settings').update({ value: { ...value, models: next } }).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  clearModelCache();
  return NextResponse.json({ ok: true, saved: next, applied: Object.fromEntries(TASKS.map((t) => [t.key, resolveTask(next, t.key)])) });
}
