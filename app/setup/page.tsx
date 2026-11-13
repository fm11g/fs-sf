'use client';
import { useEffect, useState } from 'react';

/** 첫 가입: 대표 계정이 없을 때만 열림 → 만들고 바로 로그인 → 연결·키 입력으로 이동 */
export default function Setup() {
  const [st, setSt] = useState<{ needed: boolean; ready: boolean; error?: string } | null>(null);
  const [f, setF] = useState({ name: '', username: '', email: '', password: '', password2: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/setup').then((r) => r.json()).then((d) => { if (d.ready && !d.needed) location.replace('/login'); else setSt(d); }); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.password2) return setMsg('비밀번호가 서로 다릅니다');
    setBusy(true); setMsg('');
    const r = await fetch('/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); return setMsg(d.error || '실패'); }
    const lr = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: f.username, password: f.password }) });
    if (!lr.ok) { setBusy(false); return setMsg('계정은 만들어졌습니다. 로그인 화면에서 아이디로 로그인하세요.'); }
    location.href = '/admin/keys?welcome=1';
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <main style={wrap}>
      <form onSubmit={submit} style={box}>
        <h1 style={{ margin: 0, fontSize: 20 }}>웹 공장 시작하기</h1>
        <p style={{ margin: 0, color: '#556', fontSize: 14, lineHeight: 1.5 }}>
          아직 대표 계정이 없습니다. 여기서 만든 계정이 <b>대표(전체 권한)</b>가 되고, 이 화면은 다시 열리지 않습니다.
          직원 계정은 로그인 후 [직원·권한]에서 추가합니다.
        </p>
        {st && !st.ready && <p style={{ color: 'crimson', margin: 0, fontSize: 13 }}>⚠ {st.error}</p>}
        <input placeholder="이름 (예: 최지웅)" value={f.name} onChange={set('name')} style={inp} />
        <input placeholder="아이디 (영문 소문자·숫자 3~20자)" required autoCapitalize="none" autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} style={inp} />
        <input placeholder="이메일 (선택 · 작업 알림 받을 주소)" type="email" value={f.email} onChange={set('email')} style={inp} />
        <input placeholder="비밀번호 (영문+숫자 8자 이상)" type="password" required value={f.password} onChange={set('password')} style={inp} />
        <input placeholder="비밀번호 확인" type="password" required value={f.password2} onChange={set('password2')} style={inp} />
        <button disabled={busy || !st?.ready} style={{ ...inp, background: '#0B1B3F', color: '#fff', border: 0, cursor: 'pointer' }}>{busy ? '만드는 중…' : '대표 계정 만들기'}</button>
        {msg && <p style={{ color: 'crimson', margin: 0, fontSize: 13 }}>{msg}</p>}
      </form>
    </main>
  );
}
const wrap: React.CSSProperties = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0B1B3F', padding: 16 };
const box: React.CSSProperties = { background: '#fff', padding: 32, borderRadius: 16, width: 380, maxWidth: '100%', display: 'grid', gap: 12 };
const inp: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid #ccd', fontSize: 15 };
