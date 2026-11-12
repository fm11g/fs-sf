/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }] },
  experimental: {
    serverComponentsExternalPackages: ['cheerio'],
    // sop/*.md 를 서버 함수 번들에 포함 (기본 SOP 읽기용)
    outputFileTracingIncludes: { '/api/**/*': ['./sop/**/*'], '/admin/**/*': ['./sop/**/*'] },
  },
};
export default nextConfig;
