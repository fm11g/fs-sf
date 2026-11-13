import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase/server';
import { checkPassword, isEmail, normEmail, setupNeeded, upsertAuthUser } from '@/lib/setup';
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
  const email = normEmail(b.email);
  const name = String(b.name || '').trim() || null;
  if (!isEmail(email)) return NextResponse.json({ error: '이메일 형식을 확인하세요' }, { status: 400 });
  const pwErr = checkPassword(String(b.password || ''));
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
  try {
    if (!(await setupNeeded())) return NextResponse.json({ error: '이미 대표 계정이 있습니다. 로그인하세요.' }, { status: 409 });
    await upsertAuthUser(email, String(b.password), name);
    const db = sbAdmin();
    const { error } = await db.from('admins').upsert({ email, role: 'owner', name, perms: {}, active: true, created_by: 'setup' });
    if (error) throw new Error(error.message);
    const created = await ensureAutoSecrets(req.nextUrl.origin, email);
    // 알림 메일 받을 주소가 비어 있으면 대표 이메일로
    const { data: st } = await db.from('settings').select('value').eq('id', 1).maybeSingle();
    if (st && !(st.value?.notify_emails || []).length) await db.from('settings').update({ value: { ...st.value, notify_emails: [email] } }).eq('id', 1);
    return NextResponse.json({ ok: true, auto_keys: created });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
