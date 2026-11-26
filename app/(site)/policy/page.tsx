import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listPosts } from '@/lib/posts';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // 홈페이지 연동이 있으면 정보글 목록은 홈페이지 「정책자금 정보」가 정본
  const site = String((await getSettings()).tpf_site_url || '').trim().replace(/\/+$/, '');
  if (site) redirect(`${site}/fund-info.html`);
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
