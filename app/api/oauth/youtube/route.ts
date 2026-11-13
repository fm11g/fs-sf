import { NextRequest, NextResponse } from 'next/server';
import { oauthClient } from '@/lib/youtube';
import { guard } from '@/lib/auth';

export const dynamic = 'force-dynamic';


/** 유튜브 채널 연결 → 리프레시 토큰 발급 (콜백에서 연결·키에 자동 저장) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'keys');
  if (g.deny) return g.deny;
  if (!process.env.YT_CLIENT_ID || !process.env.YT_CLIENT_SECRET) return NextResponse.redirect(new URL('/admin/keys?yt=noclient', req.nextUrl.origin));
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
