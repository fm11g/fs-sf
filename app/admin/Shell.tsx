'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { can, pathBlock, type Me } from '@/lib/perms';
import { sbBrowser } from '@/lib/supabase/client';
import { MeCtx } from './MeContext';

const NAV: { href: string; label: string; block: string; ext?: boolean }[] = [
  { href: '/admin', label: '현황판', block: 'board' },
  { href: '/admin/editorial', label: '편성표', block: 'editorial' },
  { href: '/admin/references', label: '참고 영상', block: 'references' },
  { href: '/admin/channels', label: '채널 성과', block: 'channels' },
  { href: '/admin/metrics', label: '작업 효율', block: 'metrics' },
  { href: '/admin/sop', label: 'SOP · AI 제어', block: 'sop' },
  { href: '/admin/models', label: 'AI 모델', block: 'settings' },
  { href: '/admin/landing', label: '랜딩 템플릿', block: 'landing_tpl' },
  { href: '/admin/leads', label: '신청 내역', block: 'leads' },
  { href: '/admin/settings', label: '설정 · BGM', block: 'settings' },
  { href: '/admin/keys', label: '연결 · 키', block: 'keys' },
  { href: '/admin/members', label: '직원 · 권한', block: 'members' },
];

export default function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const path = usePathname() || '/admin';
  const block = pathBlock(path);
  const allowed = !block || can(me, block);
  const changePw = async () => {
    const pw = prompt('새 비밀번호 (영문+숫자 8자 이상)');
    if (!pw) return;
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return alert('영문과 숫자를 섞어 8자 이상으로 입력하세요');
    const { error } = await sbBrowser().auth.updateUser({ password: pw });
    alert(error ? error.message : '비밀번호를 바꿨습니다');
  };
  const logout = async () => { await sbBrowser().auth.signOut(); location.href = '/login'; };

  return (
    <MeCtx.Provider value={me}>
      <div id="tpf-admin">
        <nav>
          <b>오늘의 정책자금 공장</b>
          {NAV.filter((n) => can(me, n.block)).map((n) => (
            <Link key={n.href} href={n.href} className={(n.href === '/admin' ? path === '/admin' || path.startsWith('/admin/contents') : path.startsWith(n.href)) ? 'on' : ''}>{n.label}</Link>
          ))}
          {me.role === 'owner' && <>
            <Link href="/policy" target="_blank">정보글 사이트 ↗</Link>
            <Link href="/l/today" target="_blank">오늘 랜딩 ↗</Link>
          </>}
          <div className="acct">
            <span title={me.username || me.email}>{me.name || me.username || me.email.split('@')[0]} <small className={`role ${me.role}`}>{me.role === 'owner' ? '대표' : '직원'}</small></span>
            <a href="#" onClick={(e) => { e.preventDefault(); changePw(); }}>비밀번호 변경</a>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>로그아웃</a>
          </div>
        </nav>
        <main>
          {allowed ? children : (
            <div className="card locked">
              <h1>🔒 이 화면 권한이 없습니다</h1>
              <p className="mute">대표에게 필요한 권한 블록을 요청하세요. 왼쪽 메뉴에는 받은 권한만 보입니다.</p>
            </div>
          )}
        </main>
      </div>
    </MeCtx.Provider>
  );
}
