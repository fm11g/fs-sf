import { NextRequest, NextResponse } from 'next/server';
import { oauthClient, oauthOrigin } from '@/lib/youtube';
import { getSettings } from '@/lib/settings';
import { hydrateEnv } from '@/lib/secrets';
import { guard } from '@/lib/auth';

export const dynamic = 'force-dynamic';


/** 유튜브 채널 연결 → 리프레시 토큰 발급 (콜백에서 연결·키에 자동 저장) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'keys');
  if (g.deny) return g.deny;
  await hydrateEnv(true); // 방금 저장한 값도 바로 읽도록 강제 갱신
  const missing = ['YT_CLIENT_ID', 'YT_CLIENT_SECRET'].filter((k) => !process.env[k]);
  if (missing.length) {
    // 어느 사이트(DB)에서 무엇이 빠졌는지 알려 줌 — 키를 저장한 주소와 다른 주소(다른 Supabase)로 옮겨 왔을 때 구분용
    const db = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https:\/\//, '').split('.')[0];
    return NextResponse.redirect(new URL(`/admin/keys?yt=noclient&missing=${missing.join(',')}&host=${encodeURIComponent(req.nextUrl.host)}&db=${encodeURIComponent(db)}`, req.nextUrl.origin));
  }
  // 구글에 등록한 리디렉션 URI 와 같아야 함 → 항상 고정 주소로. 미리보기 주소로 접속했으면 고정 주소로 옮겨서 다시 시작
  const origin = oauthOrigin(req.nextUrl.origin, (await getSettings().catch(() => ({} as any)))?.site_url);
  if (origin !== req.nextUrl.origin) return NextResponse.redirect(`${origin}/api/oauth/youtube`);
  const url = oauthClient(origin).generateAuthUrl({
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
