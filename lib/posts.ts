import { sbAdmin } from './supabase/server';

export async function listPosts(limit = 30) {
  const { data } = await sbAdmin()
    .from('contents')
    .select('slug, topic, post, thumbnail_url, published_at')
    .eq('status', 'published')
    .not('post', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getPost(slug: string) {
  const { data } = await sbAdmin()
    .from('contents')
    .select('slug, topic, post, images, thumbnail_url, youtube_id, research, published_at, updated_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  return data;
}
