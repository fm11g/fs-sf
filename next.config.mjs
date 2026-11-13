import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }] },
  experimental: {
    serverComponentsExternalPackages: ['cheerio'],
    // sop/*.md 를 서버 함수 번들에 포함 (기본 SOP 읽기용)
    outputFileTracingIncludes: { '/api/**/*': ['./sop/**/*'], '/admin/**/*': ['./sop/**/*'] },
  },
  // 영상 편집기가 worker/video/Short.tsx 를 그대로 씀 → remotion 은 루트 것 하나만 쓰도록 (중복 인스턴스 방지)
  webpack(config) {
    config.resolve.alias = { ...(config.resolve.alias || {}), remotion: path.resolve('node_modules/remotion') };
    return config;
  },
};
export default nextConfig;
