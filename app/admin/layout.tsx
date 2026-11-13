import './admin.css';
import { getMe } from '@/lib/auth';
import Shell from './Shell';
import NoAccess from './NoAccess';

export const metadata = { title: '관리자', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) return <NoAccess />;
  return <Shell me={me}>{children}</Shell>;
}
