import Link from 'next/link';
import { listPosts } from '@/lib/posts';

export const revalidate = 600;

export default async function Home() {
  const posts = await listPosts();
  return (
    <>
      <h1 style={{ fontSize: 26 }}>오늘의 정책자금 정보</h1>
      <p className="meta">매일 업데이트되는 중소기업·소상공인 정책자금 공고 핵심 정리</p>
      {posts.map((p: any) => (
        <Link key={p.slug} href={`/policy/${p.slug}`} className="card">
          {p.thumbnail_url ? <img src={p.thumbnail_url} alt={p.post?.title} /> : <div />}
          <div>
            <span className="meta">{p.published_at?.slice(0, 10)}</span>
            <h2>{p.post?.title || p.topic}</h2>
            <p>{p.post?.meta_description}</p>
          </div>
        </Link>
      ))}
      {!posts.length && <p className="meta">아직 게시된 글이 없습니다.</p>}
    </>
  );
}
