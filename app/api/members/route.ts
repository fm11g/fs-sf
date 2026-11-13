import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { cleanPerms } from '@/lib/perms';
import { checkPassword, checkUsername, idEmail, isEmail, normEmail, normId, upsertAuthUser } from '@/lib/setup';

export const dynamic = 'force-dynamic';
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function findAuthId(email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data } = await sbAdmin().auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u.id;
    if (!data || data.users.length < 200) return null;
  }
  return null;
}
async function ownerCount() {
  const { count } = await sbAdmin().from('admins').select('email', { count: 'exact', head: true }).eq('role', 'owner').eq('active', true);
  return count || 0;
}

export async function GET(req: NextRequest) {
  const g = await guard(req, 'members');
  if (g.deny) return g.deny;
  const { data } = await sbAdmin().from('admins').select('email, username, role, name, perms, active, last_login_at, created_at, created_by').order('created_at');
  return NextResponse.json({ members: data || [], me: g.me.email });
}

/** 직원 추가: 아이디(필수)·이메일(선택)·임시 비밀번호·권한 블록 */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'members');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  const username = normId(b.username);
  const idErr = checkUsername(username);
  if (idErr) return bad(idErr);
  const real = normEmail(b.email);
  if (real && !isEmail(real)) return bad('이메일 형식을 확인하세요 (비워 둬도 됩니다)');
  const email = real || idEmail(username);
  const pwErr = checkPassword(String(b.password || ''));
  if (pwErr) return bad(pwErr);
  const role = b.role === 'owner' ? 'owner' : 'staff';
  const db = sbAdmin();
  const { data: exists } = await db.from('admins').select('email').eq('email', email).maybeSingle();
  if (exists) return bad('이미 등록된 이메일입니다');
  const { data: taken } = await db.from('admins').select('email').eq('username', username).maybeSingle();
  if (taken) return bad('이미 쓰는 아이디입니다');
  try { await upsertAuthUser(email, String(b.password), b.name); } catch (e: any) { return bad(e.message, 500); }
  const { error } = await db.from('admins').insert({ email, username, role, name: String(b.name || '').trim() || null, perms: role === 'owner' ? {} : cleanPerms(b.perms), active: true, created_by: g.me.email });
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}

/** 권한·이름·활성·역할 변경, 비밀번호 재설정 */
export async function PATCH(req: NextRequest) {
  const g = await guard(req, 'members');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  const email = normEmail(b.email);
  const db = sbAdmin();
  const { data: cur } = await db.from('admins').select('*').eq('email', email).maybeSingle();
  if (!cur) return bad('없는 계정', 404);
  const patch: any = {};
  if (b.perms !== undefined) patch.perms = cleanPerms(b.perms);
  if (b.name !== undefined) patch.name = String(b.name || '').trim() || null;
  if (b.active !== undefined) patch.active = !!b.active;
  if (b.role !== undefined) patch.role = b.role === 'owner' ? 'owner' : 'staff';
  if (b.username !== undefined) {
    const u = normId(b.username);
    const e = checkUsername(u);
    if (e) return bad(e);
    const { data: taken } = await db.from('admins').select('email').eq('username', u).neq('email', email).maybeSingle();
    if (taken) return bad('이미 쓰는 아이디입니다');
    patch.username = u;
  }
  const losingOwner = cur.role === 'owner' && cur.active && (patch.active === false || patch.role === 'staff');
  if (losingOwner && (await ownerCount()) <= 1) return bad('마지막 대표 계정은 직원으로 바꾸거나 끌 수 없습니다');
  if (b.password) {
    const pwErr = checkPassword(String(b.password));
    if (pwErr) return bad(pwErr);
    try { await upsertAuthUser(email, String(b.password), cur.name); } catch (e: any) { return bad(e.message, 500); }
  }
  if (Object.keys(patch).length) {
    const { error } = await db.from('admins').update(patch).eq('email', email);
    if (error) return bad(error.message, 500);
  }
  // 끈 계정은 다음 요청부터 모든 API·화면이 막힘 (getMe 가 active 확인)
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req, 'members');
  if (g.deny) return g.deny;
  const email = normEmail(req.nextUrl.searchParams.get('email'));
  if (email === g.me.email) return bad('본인 계정은 삭제할 수 없습니다');
  const db = sbAdmin();
  const { data: cur } = await db.from('admins').select('role, active').eq('email', email).maybeSingle();
  if (!cur) return bad('없는 계정', 404);
  if (cur.role === 'owner' && cur.active && (await ownerCount()) <= 1) return bad('마지막 대표 계정은 삭제할 수 없습니다');
  await db.from('admins').delete().eq('email', email);
  const id = await findAuthId(email);
  if (id) await db.auth.admin.deleteUser(id);
  return NextResponse.json({ ok: true });
}
