import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin, sbServer } from '@/lib/supabase/server';
import { resolveLogin } from '@/lib/setup';

export const dynamic = 'force-dynamic';

// 무차별 대입 방지: 같은 IP+아이디로 10분에 8번 실패하면 잠시 막음 (함수 인스턴스 단위)
const fails = new Map<string, { n: number; at: number }>();

/** 아이디 또는 이메일 + 비밀번호 → 세션 쿠키 발급 (아이디→이메일 변환은 서버에서만, 브라우저엔 노출 안 함) */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const login = String(b.login || '').trim();
  const password = String(b.password || '');
  if (!login || !password) return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요' }, { status: 400 });
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  const k = `${ip}|${login.toLowerCase()}`;
  const f = fails.get(k);
  if (f && f.n >= 8 && Date.now() - f.at < 10 * 60e3) return NextResponse.json({ error: '로그인 실패가 많습니다. 10분 뒤 다시 시도하세요.' }, { status: 429 });

  const email = await resolveLogin(login);
  const sb = sbServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    fails.set(k, { n: (f && Date.now() - f.at < 10 * 60e3 ? f.n : 0) + 1, at: Date.now() });
    return NextResponse.json({ error: '아이디(이메일) 또는 비밀번호가 맞지 않습니다' }, { status: 401 });
  }
  fails.delete(k);
  const { data: row } = await sbAdmin().from('admins').select('active').eq('email', email).maybeSingle();
  if (!row || row.active === false) {
    await sb.auth.signOut();
    return NextResponse.json({ error: '등록된 계정이 아니거나 비활성 상태입니다. 대표에게 문의하세요.' }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
