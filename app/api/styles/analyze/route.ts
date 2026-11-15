import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { ask } from '@/lib/llm';
import { getSettings } from '@/lib/settings';
import { STYLE_SYSTEM, stylePrompt } from '@/lib/motion-guide';
import { cleanStyle } from '@/lib/video-style';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ytId = (u: string) => u.match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1] || null;

/** 유튜브 링크 → 화면 이미지 (쇼츠 세로 썸네일 우선) */
async function ytImages(link: string): Promise<string[]> {
  const id = ytId(link);
  if (!id) return [];
  const out: string[] = [];
  for (const f of ['oar2.jpg', 'oardefault.jpg', 'maxresdefault.jpg', 'hq720.jpg', 'hqdefault.jpg']) {
    const u = `https://i.ytimg.com/vi/${id}/${f}`;
    try { const r = await fetch(u, { method: 'HEAD' }); if (r.ok) { out.push(u); if (out.length >= 2) break; } } catch { /* 다음 */ }
  }
  return out;
}

/**
 * 레퍼런스 → 스타일 규격 (저장은 하지 않음 — 화면에서 미리보고 저장)
 * { images?: dataURL[] (캡처, 최대 6장), links?: string[] (유튜브·인스타 링크 / 이미지 URL), ref_id?: 참고 영상 번호, hint?: string }
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'styles', 'work');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  const db = sbAdmin();
  const urls: string[] = [];
  const notes: string[] = [];
  // ① 캡처 업로드 → 스토리지
  for (const [i, d] of (Array.isArray(b.images) ? b.images.slice(0, 6) : []).entries()) {
    const m = String(d).match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) continue;
    const path = `styles/${Date.now()}-${i}.${m[2] === 'png' ? 'png' : m[2] === 'webp' ? 'webp' : 'jpg'}`;
    const { error } = await db.storage.from('media').upload(path, Buffer.from(m[3], 'base64'), { contentType: m[1], upsert: true });
    if (error) return NextResponse.json({ error: `이미지 저장 실패: ${error.message}` }, { status: 500 });
    urls.push(db.storage.from('media').getPublicUrl(path).data.publicUrl);
  }
  // ② 링크
  for (const l of (Array.isArray(b.links) ? b.links : []).map((x: any) => String(x).trim()).filter(Boolean).slice(0, 4)) {
    if (/\.(png|jpe?g|webp)(\?|$)/i.test(l)) { urls.push(l); continue; }
    if (ytId(l)) { const im = await ytImages(l); if (im.length) { urls.push(...im); notes.push(`유튜브 ${ytId(l)}: 썸네일로 분석 (영상 속 여러 장면은 [참고 영상]에 등록 후 프레임으로 분석하면 더 정확)`); } else notes.push(`유튜브 ${l}: 썸네일을 가져오지 못함`); continue; }
    notes.push(`${l}: 이 링크는 화면을 직접 가져올 수 없습니다 — 캡처를 올려 주세요 (인스타그램은 로그인 필요)`);
  }
  // ③ 참고 영상(워커가 뽑은 프레임)
  if (b.ref_id) {
    const { data: r } = await db.from('ref_videos').select('frames, title').eq('id', b.ref_id).maybeSingle();
    const fr = ((r?.frames || []) as any[]).map((x) => x.url).filter(Boolean);
    const pick = fr.length > 6 ? [0, 1, 2, 3, 4, 5].map((i) => fr[Math.floor((i * (fr.length - 1)) / 5)]) : fr;
    urls.push(...pick);
    if (!pick.length) notes.push('참고 영상의 프레임이 아직 없습니다 (분석이 끝난 뒤 다시)');
  }
  if (!urls.length) return NextResponse.json({ error: '분석할 화면이 없습니다', notes }, { status: 400 });
  const s = await getSettings();
  try {
    const res = await ask<any>({ system: STYLE_SYSTEM, prompt: stylePrompt(b.hint), images: urls.slice(0, 8), maxTokens: 4000, chain: s.llm_chain, task: 'style', meta: { refTable: 'video_styles', refId: 'analyze', by: g.me.email } });
    return NextResponse.json({ style: cleanStyle(res.data), name: String(res.data?.name || '').slice(0, 40), images: urls, notes, model: res.model, cost_usd: res.cost_usd });
  } catch (e: any) {
    return NextResponse.json({ error: `분석 실패: ${e.message}`, images: urls, notes }, { status: 500 });
  }
}
