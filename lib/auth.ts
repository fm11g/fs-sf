import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin, sbServer } from './supabase/server';

/** 관리자 세션 또는 워커 비밀값 확인. 실패 시 NextResponse 반환 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const secret = req.headers.get('x-worker-secret');
  if (secret && process.env.WORKER_SECRET && secret === process.env.WORKER_SECRET) return null;

  const { data } = await sbServer().auth.getUser();
  const email = data.user?.email;
  if (!email) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { data: row } = await sbAdmin().from('admins').select('email').eq('email', email).maybeSingle();
  if (!row) return NextResponse.json({ error: '관리자 권한이 없습니다' }, { status: 403 });
  return null;
}
