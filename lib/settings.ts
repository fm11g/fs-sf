import { sbAdmin } from './supabase/server';
import { stepDef, type StepKey } from './steps';
import type { Settings } from './types';

export async function getSettings(): Promise<Settings> {
  const { data } = await sbAdmin().from('settings').select('value').eq('id', 1).single();
  return data!.value as Settings;
}

/** 단계 산출물 (landing 은 landing_variants.values) */
export async function getOutput(step: StepKey, c: any) {
  if (step === 'landing') {
    const { data } = await sbAdmin().from('landing_variants').select('values').eq('content_id', c.id).maybeSingle();
    return data?.values ?? null;
  }
  const f = stepDef(step).field;
  return f ? c[f] ?? null : null;
}
