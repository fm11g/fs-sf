import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')),
  title: { default: '오늘의 정책자금', template: '%s | 오늘의 정책자금' },
  description: '매일 업데이트되는 중소기업·소상공인 정책자금 공고 핵심 정리',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
      </head>
      <body style={{ margin: 0, fontFamily: 'Pretendard, sans-serif' }}>{children}</body>
    </html>
  );
}
