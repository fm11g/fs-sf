import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 작업대·편집기의 BGM 목록 (업로드·관리는 설정 화면 = 대표) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  const { data } = await sbAdmin().from('bgm_tracks').select('id, title, mood, url').eq('active', true).order('created_at', { ascending: false });
  return NextResponse.json({ tracks: data || [] });
}
