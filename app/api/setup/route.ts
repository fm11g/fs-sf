import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase/server';
import { checkPassword, checkUsername, idEmail, isEmail, normEmail, normId, setupNeeded, upsertAuthUser } from '@/lib/setup';
import { ensureAutoSecrets } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

/** 첫 가입 필요 여부 + 필수 환경변수 점검 */
export async function GET() {
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k]);
  if (missing.length) return NextResponse.json({ needed: true, ready: false, error: `Vercel 환경변수 없음: ${missing.join(', ')}` });
  try { return NextResponse.json({ needed: await setupNeeded(), ready: true }); }
  catch (e: any) { return NextResponse.json({ needed: true, ready: false, error: e.message }); }
}

/** 대표 계정 만들기 — 대표가 아무도 없을 때 한 번만 가능 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  // 아이디 필수, 이메일은 선택(알림 메일 받을 주소). 이메일이 없으면 아이디 전용 계정
  const username = normId(b.username);
  const real = normEmail(b.email);
  const name = String(b.name || '').trim() || null;
  const idErr = checkUsername(username);
  if (idErr) return NextResponse.json({ error: idErr }, { status: 400 });
  if (real && !isEmail(real)) return NextResponse.json({ error: '이메일 형식을 확인하세요 (비워 둬도 됩니다)' }, { status: 400 });
  const email = real || idEmail(username);
  const pwErr = checkPassword(String(b.password || ''));
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
  try {
    if (!(await setupNeeded())) return NextResponse.json({ error: '이미 대표 계정이 있습니다. 로그인하세요.' }, { status: 409 });
    await upsertAuthUser(email, String(b.password), name);
    const db = sbAdmin();
    const { error } = await db.from('admins').upsert({ email, username, role: 'owner', name, perms: {}, active: true, created_by: 'setup' });
    if (error) throw new Error(error.message);
    const created = await ensureAutoSecrets(req.nextUrl.origin, username);
    // 알림 메일 받을 주소가 비어 있으면 대표 이메일로
    const { data: st } = await db.from('settings').select('value').eq('id', 1).maybeSingle();
    if (real && st && !(st.value?.notify_emails || []).length) await db.from('settings').update({ value: { ...st.value, notify_emails: [real] } }).eq('id', 1);
    return NextResponse.json({ ok: true, auto_keys: created });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
