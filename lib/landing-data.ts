import { sbAdmin } from './supabase/server';

/** slug 또는 'today'(가장 최근 공개 랜딩)로 랜딩 변형 + 템플릿 조회 */
export async function getVariant(slug: string) {
  const db = sbAdmin();
  const q = db.from('landing_variants').select('*, landing_templates(*)');
  const { data } = slug === 'today'
    ? await q.eq('is_live', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
    : await q.eq('slug', slug).maybeSingle();
  if (data) return data as any;
  // 변형이 없으면 활성 템플릿 원문
  const { data: tpl } = await db.from('landing_templates').select('*').eq('is_active', true).maybeSingle();
  return tpl ? { slug, values: {}, landing_templates: tpl } : null;
}
