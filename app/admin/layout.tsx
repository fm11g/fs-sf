import './admin.css';
import Link from 'next/link';

export const metadata = { title: '관리자', robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="tpf-admin">
      <nav>
        <b>오늘의 정책자금 공장</b>
        <Link href="/admin">현황판</Link>
        <Link href="/admin/editorial">편성표</Link>
        <Link href="/admin/channels">채널 성과</Link>
        <Link href="/admin/metrics">작업 효율</Link>
        <Link href="/admin/sop">SOP · AI 제어</Link>
        <Link href="/admin/landing">랜딩 템플릿</Link>
        <Link href="/admin/leads">신청 내역</Link>
        <Link href="/admin/settings">설정 · BGM · 채널</Link>
        <Link href="/policy" target="_blank">정보글 사이트 ↗</Link>
        <Link href="/l/today" target="_blank">오늘 랜딩 ↗</Link>
      </nav>
      <main>{children}</main>
    </div>
  );
}
