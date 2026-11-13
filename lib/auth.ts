import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin, sbServer } from './supabase/server';
import { hydrateEnv } from './secrets';
import { can, type Level, type Me } from './perms';

/** 로그인한 계정 (대표·직원). 워커 비밀값이면 worker. 없으면 null */
export async function getMe(req?: NextRequest): Promise<Me | null> {
  await hydrateEnv();
  const secret = req?.headers.get('x-worker-secret');
  if (secret && process.env.WORKER_SECRET && secret === process.env.WORKER_SECRET) return { email: 'worker', name: '워커', role: 'worker', perms: {} };

  const { data } = await sbServer().auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: row } = await sbAdmin().from('admins').select('email, role, name, perms, active').eq('email', email).maybeSingle();
  if (!row || row.active === false) return null;
  return { email, name: row.name ?? null, role: row.role === 'staff' ? 'staff' : 'owner', perms: row.perms || {} };
}

/**
 * 권한 확인. block 을 안 주면 대표 전용.
 *   const { me, deny } = await guard(req, 'step:script', 'work'); if (deny) return deny;
 */
export async function guard(req: NextRequest, block?: string, level: Level = 'view'): Promise<{ me: Me; deny?: undefined } | { me?: undefined; deny: NextResponse }> {
  const me = await getMe(req);
  if (!me) {
    const logged = req.headers.get('x-worker-secret') ? false : !!(await sbServer().auth.getUser()).data.user;
    return { deny: NextResponse.json({ error: logged ? '등록된 계정이 아니거나 비활성 상태입니다' : '로그인이 필요합니다' }, { status: logged ? 403 : 401 }) };
  }
  const ok = block ? can(me, block, level) : me.role !== 'staff';
  if (!ok) return { deny: NextResponse.json({ error: '이 작업 권한이 없습니다 — 대표에게 권한 블록을 요청하세요' }, { status: 403 }) };
  return { me };
}

/** 예전 호출부 호환: 대표(또는 워커)만 통과 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const g = await guard(req);
  return g.deny ?? null;
}
