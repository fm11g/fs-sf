import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { oauthClient } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code 없음' }, { status: 400 });
  const { tokens } = await oauthClient(req.nextUrl.origin).getToken(code);
  const html = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">
<h2>유튜브 연결 완료</h2><p>아래 값을 GitHub 저장소 Settings → Secrets → <b>YT_REFRESH_TOKEN</b> 에 저장하세요. 이 화면은 다시 표시되지 않습니다.</p>
<textarea style="width:100%;height:120px">${tokens.refresh_token ?? '(refresh_token 없음 — Google 계정 보안에서 앱 연결 해제 후 재시도)'}</textarea></body>`;
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
