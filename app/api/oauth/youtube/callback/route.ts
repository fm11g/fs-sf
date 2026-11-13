import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { oauthClient } from '@/lib/youtube';
import { setSecrets } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

/** 구글 동의 후 돌아오는 곳 → 리프레시 토큰을 연결·키에 바로 저장 (워커도 같은 값을 읽음) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'keys');
  if (g.deny) return g.deny;
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code 없음' }, { status: 400 });
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/keys?${q}`, req.nextUrl.origin));
  try {
    const { tokens } = await oauthClient(req.nextUrl.origin).getToken(code);
    if (!tokens.refresh_token) return back('yt=norefresh');
    await setSecrets({ YT_REFRESH_TOKEN: tokens.refresh_token }, g.me.email);
    return back('yt=ok');
  } catch (e: any) {
    return back(`yt=fail&msg=${encodeURIComponent(String(e.message).slice(0, 120))}`);
  }
}
