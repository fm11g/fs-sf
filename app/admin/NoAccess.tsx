'use client';
import { sbBrowser } from '@/lib/supabase/client';

/** 로그인은 됐지만 등록된 계정(대표·직원)이 아니거나 꺼진 계정 */
export default function NoAccess() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0B1B3F', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 22 }}>접근 권한이 없는 계정입니다</h1>
        <p style={{ opacity: 0.8 }}>대표가 [직원 · 권한]에서 추가하거나 다시 켜야 들어올 수 있습니다.</p>
        <button onClick={async () => { await sbBrowser().auth.signOut(); location.href = '/login'; }} style={{ padding: '10px 18px', borderRadius: 8, border: 0, cursor: 'pointer' }}>다른 계정으로 로그인</button>
      </div>
    </main>
  );
}
