import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { can, canStep } from '@/lib/perms';
import { STEP_DEFS } from '@/lib/steps';

export const dynamic = 'force-dynamic';

const IMG = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const VID = ['mp4', 'mov', 'webm', 'm4v'];
const MAX = 200 * 1024 * 1024;
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

/** 콘텐츠 첨부 목록 (피드백 첨부·장면 자료화면) */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, 'board', 'view');
  if (g.deny) return g.deny;
  const { data, error } = await sbAdmin().from('content_assets').select('*').eq('content_id', params.id).order('created_at', { ascending: false });
  if (error) return bad(/relation|does not exist/i.test(error.message) ? 'DB 업데이트 필요 — setup/supabase-all-in-one.sql 을 다시 실행하세요 (content_assets 없음)' : error.message, 500);
  return NextResponse.json({ assets: data || [] });
}

/**
 * { action: 'upload_url' | 'add' | 'update' | 'delete' }
 * 브라우저 → 스토리지 직접 업로드(서명 URL, Vercel 요청 크기 제한 회피) → add 로 등록
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, 'board', 'view');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  // 단계 작업 권한이 하나라도 있어야 올리고 지울 수 있음 (피드백 단계가 정해져 있으면 그 단계)
  const okWork = b.step ? canStep(g.me, b.step, 'work') : can(g.me, 'board', 'work') || STEP_DEFS.some((d) => canStep(g.me, d.key, 'work'));
  if (!okWork) return bad('첨부 권한이 없습니다', 403);
  const db = sbAdmin();
  const { data: c } = await db.from('contents').select('id, slug').eq('id', params.id).single();
  if (!c) return bad('콘텐츠 없음', 404);
  try {
    switch (b.action) {
      case 'upload_url': {
        const ext = String(b.filename || '').split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (![...IMG, ...VID].includes(ext)) return bad('이미지(jpg·png·webp·gif) 또는 영상(mp4·mov·webm)만 올릴 수 있습니다');
        if (Number(b.size) > MAX) return bad('200MB 이하만 올릴 수 있습니다');
        const path = `contents/${c.slug}/assets/${Date.now().toString(36)}-${randomUUID().slice(0, 6)}.${ext}`;
        const { data, error } = await db.storage.from('media').createSignedUploadUrl(path);
        if (error) throw new Error(`업로드 주소 발급 실패: ${error.message}`);
        return NextResponse.json({ path, token: data.token, kind: VID.includes(ext) ? 'video' : 'image' });
      }
      case 'add': {
        const path = String(b.path || '');
        if (!path.startsWith(`contents/${c.slug}/assets/`)) return bad('잘못된 경로');
        const ext = path.split('.').pop()!.toLowerCase();
        const url = db.storage.from('media').getPublicUrl(path).data.publicUrl;
        const row = {
          content_id: c.id, kind: VID.includes(ext) ? 'video' : 'image', path, url,
          name: String(b.name || '').slice(0, 200) || null, mime: b.mime || null, size: Number(b.size) || null,
          width: Number(b.width) || null, height: Number(b.height) || null, duration: Number(b.duration) || null,
          note: String(b.note || '').slice(0, 500) || null, step: b.step || null, created_by: g.me.email,
        };
        const { data, error } = await db.from('content_assets').insert(row).select('*').single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ asset: data });
      }
      case 'update': {
        const { data, error } = await db.from('content_assets').update({ note: String(b.note || '').slice(0, 500) || null }).eq('id', b.id).eq('content_id', c.id).select('*').single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ asset: data });
      }
      case 'delete': {
        const { data: a } = await db.from('content_assets').select('path').eq('id', b.id).eq('content_id', c.id).single();
        if (!a) return bad('첨부 없음', 404);
        await db.storage.from('media').remove([a.path]);
        await db.from('content_assets').delete().eq('id', b.id);
        return NextResponse.json({ ok: true });
      }
      default: return bad('action?');
    }
  } catch (e: any) {
    return bad(e.message, 500);
  }
}
