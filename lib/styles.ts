/** 영상 스타일 저장소 (서버 전용) — 기본 프리셋 + 사용자 프리셋(video_styles) */
import { sbAdmin } from './supabase/server';
import { BUILTIN_STYLES, DEFAULT_STYLE_KEY, cleanStyle, type StyleSpec } from './video-style';

export type StyleRow = { key: string; name: string; desc?: string | null; style: StyleSpec; builtin: boolean; images?: string[]; source?: any; created_at?: string };

export async function listStyles(): Promise<{ styles: StyleRow[]; defaultKey: string }> {
  const db = sbAdmin();
  const [{ data }, { data: st }] = await Promise.all([
    db.from('video_styles').select('*').order('id', { ascending: false }),
    db.from('settings').select('value').eq('id', 1).single(),
  ]);
  const styles: StyleRow[] = [
    ...(data || []).map((r: any) => ({ key: String(r.id), name: r.name, desc: r.description, style: cleanStyle(r.style), builtin: false, images: r.images, source: r.source, created_at: r.created_at })),
    ...BUILTIN_STYLES.map((b) => ({ key: b.key, name: b.name, desc: b.desc, style: b.style, builtin: true })),
  ];
  const defaultKey = (st?.value as any)?.video_style_default || DEFAULT_STYLE_KEY;
  return { styles, defaultKey: styles.some((s) => s.key === defaultKey) ? defaultKey : DEFAULT_STYLE_KEY };
}

/** 콘텐츠에 쓸 스타일: 콘텐츠 지정 > 설정 기본 > 언론사 네이비 */
export async function styleFor(c: { style_key?: string | null }): Promise<StyleRow> {
  const { styles, defaultKey } = await listStyles();
  return styles.find((s) => s.key === c.style_key) || styles.find((s) => s.key === defaultKey) || styles.find((s) => s.key === DEFAULT_STYLE_KEY)!;
}
