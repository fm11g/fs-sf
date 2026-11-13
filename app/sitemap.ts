import { hydrateEnv, siteUrl } from '@/lib/secrets';
import type { MetadataRoute } from 'next';
import { listPosts } from '@/lib/posts';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await hydrateEnv();
  const site = siteUrl();
  const posts = await listPosts(1000);
  return [
    { url: `${site}/policy`, changeFrequency: 'daily', priority: 1 },
    ...posts.map((p: any) => ({ url: `${site}/policy/${p.slug}`, lastModified: p.published_at, changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
