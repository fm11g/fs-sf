import { NextRequest, NextResponse } from 'next/server';
import { oauthClient } from '@/lib/youtube';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';


/** 유튜브 채널 연결 → 리프레시 토큰 발급 (GitHub Secret YT_REFRESH_TOKEN 에 저장) */
export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const url = oauthClient(req.nextUrl.origin).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly', // 공유수·시청 지속률·구독 증가 (채널 성과 점수)
    ],
  });
  return NextResponse.redirect(url);
}
