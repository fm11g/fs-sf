'use client';
import { useEffect, useState } from 'react';

export default function Login() {
  const [login, setLogin] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // 대표 계정이 아직 없으면 첫 가입 화면으로
  useEffect(() => { fetch('/api/setup').then((r) => r.json()).then((d) => { if (d.needed) location.replace('/setup'); }).catch(() => {}); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password: pw }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); return setMsg(d.error || '로그인 실패'); }
    location.href = '/admin';
  };
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0B1B3F' }}>
      <form onSubmit={submit} style={{ background: '#fff', padding: 32, borderRadius: 16, width: 320, display: 'grid', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>오늘의 정책자금 · 웹 공장</h1>
        <input placeholder="아이디 또는 이메일" autoComplete="username" autoCapitalize="none" value={login} onChange={(e) => setLogin(e.target.value)} style={inp} />
        <input placeholder="비밀번호" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} style={inp} />
        <button disabled={busy} style={{ ...inp, background: '#0B1B3F', color: '#fff', border: 0, cursor: 'pointer' }}>{busy ? '확인 중…' : '로그인'}</button>
        {msg && <p style={{ color: 'crimson', margin: 0, fontSize: 13 }}>{msg}</p>}
        <p style={{ margin: 0, fontSize: 12, color: '#889' }}>비밀번호를 잊었으면 대표에게 재설정을 요청하세요.</p>
      </form>
    </main>
  );
}
const inp: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid #ccd', fontSize: 15 };
