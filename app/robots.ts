import { hydrateEnv, siteUrl } from '@/lib/secrets';
import type { MetadataRoute } from 'next';

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  await hydrateEnv();
  const site = siteUrl();
  return { rules: [{ userAgent: '*', allow: ['/policy', '/l/'], disallow: ['/admin', '/api', '/login'] }], sitemap: `${site}/sitemap.xml` };
}
