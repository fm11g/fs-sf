'use client';
import { useState } from 'react';
import { sbBrowser } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await sbBrowser().auth.signInWithPassword({ email, password: pw });
    if (error) return setMsg(error.message);
    location.href = '/admin';
  };
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0B1B3F' }}>
      <form onSubmit={submit} style={{ background: '#fff', padding: 32, borderRadius: 16, width: 320, display: 'grid', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>오늘의 정책자금 · 관리자</h1>
        <input placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />
        <input placeholder="비밀번호" type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={inp} />
        <button style={{ ...inp, background: '#0B1B3F', color: '#fff', border: 0, cursor: 'pointer' }}>로그인</button>
        {msg && <p style={{ color: 'crimson', margin: 0, fontSize: 13 }}>{msg}</p>}
      </form>
    </main>
  );
}
const inp: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid #ccd', fontSize: 15 };
