import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { getPost } from '@/lib/posts';

export const revalidate = 600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || '';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await getPost(params.slug);
  if (!p?.post) return {};
  return {
    title: p.post.title,
    description: p.post.meta_description,
    keywords: p.post.keywords,
    alternates: { canonical: `/policy/${p.slug}` },
    openGraph: { type: 'article', title: p.post.title, description: p.post.meta_description, images: p.thumbnail_url ? [p.thumbnail_url] : [], publishedTime: p.published_at || undefined },
  };
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const p = await getPost(params.slug);
  if (!p?.post) notFound();
  const images: { url: string; alt?: string }[] = p.images || [];
  let md: string = p.post.body_markdown || '';
  images.forEach((img, i) => { md = md.split(`IMAGE_${i + 1}`).join(img.url); });
  md = md.replace(/!\[[^\]]*\]\(IMAGE_\d+\)/g, ''); // 남은 자리 제거
  const html = await marked.parse(md);
  const landing = `/l/${p.slug}?utm_source=blog&utm_medium=post&utm_campaign=${p.slug}`;

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Article', headline: p.post.title, description: p.post.meta_description,
      image: images.map((i) => i.url), datePublished: p.published_at, dateModified: p.updated_at,
      author: { '@type': 'Organization', name: '오늘의 정책자금' }, mainEntityOfPage: `${SITE}/policy/${p.slug}`,
    },
    p.post.faq?.length && {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: p.post.faq.map((f: any) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    p.youtube_id && {
      '@context': 'https://schema.org', '@type': 'VideoObject', name: p.post.title, description: p.post.meta_description,
      thumbnailUrl: p.thumbnail_url, uploadDate: p.published_at, embedUrl: `https://www.youtube.com/embed/${p.youtube_id}`,
    },
  ].filter(Boolean);

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1>{p.post.title}</h1>
      <p className="meta">{p.published_at?.slice(0, 10)} · 오늘의 정책자금</p>
      {p.youtube_id && (
        <div style={{ maxWidth: 340, margin: '20px auto', aspectRatio: '9/16' }}>
          <iframe src={`https://www.youtube.com/embed/${p.youtube_id}`} title={p.post.title} style={{ width: '100%', height: '100%', border: 0, borderRadius: 12 }} allowFullScreen />
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <a className="cta" href={landing}>내 사업장 조건으로 가능한 정책자금 확인하기 →</a>
      {p.post.faq?.length > 0 && (
        <>
          <h2>자주 묻는 질문</h2>
          {p.post.faq.map((f: any) => (<details key={f.q}><summary><b>{f.q}</b></summary><p>{f.a}</p></details>))}
        </>
      )}
    </article>
  );
}
