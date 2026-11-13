'use client';
import { Fragment, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BLOCKS, type Perms } from '@/lib/perms';
import PermEditor from './PermEditor';

const genPw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'; const d = '23456789'; let s = ''; for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)]; for (let i = 0; i < 4; i++) s += d[Math.floor(Math.random() * d.length)]; return s; };
const label = (p: Perms) => Object.entries(p || {}).map(([k, v]) => `${BLOCKS.find((b) => b.key === k)?.label || k}${v === 'work' ? '✎' : ''}`).join(' · ') || '권한 없음';

export default function Members() {
  const [list, setList] = useState<any[]>([]);
  const [meEmail, setMeEmail] = useState('');
  const [form, setForm] = useState({ email: '', name: '', password: genPw(), role: 'staff', perms: {} as Perms });
  const [editing, setEditing] = useState<string | null>(null);
  const [perms, setPerms] = useState<Perms>({});
  const [created, setCreated] = useState<string | null>(null);
  const load = () => api('/api/members').then((d) => { setList(d.members); setMeEmail(d.me); });
  useEffect(() => { load(); }, []);

  const add = async () => {
    try {
      await api('/api/members', form);
      setCreated(`아이디: ${form.email}\n임시 비밀번호: ${form.password}\n접속: ${location.origin}/login\n(로그인 후 왼쪽 아래 [비밀번호 변경]으로 바꾸세요)`);
      setForm({ email: '', name: '', password: genPw(), role: 'staff', perms: {} });
      load();
    } catch (e: any) { alert(e.message); }
  };
  const patch = async (email: string, p: any, msg?: string) => { try { await api('/api/members', { email, ...p }, 'PATCH'); if (msg) alert(msg); load(); } catch (e: any) { alert(e.message); } };
  const resetPw = (email: string) => { const pw = genPw(); if (confirm(`${email} 비밀번호를 ${pw} 로 바꿀까요?`)) patch(email, { password: pw }, `새 임시 비밀번호: ${pw}`); };
  const del = async (email: string) => { if (!confirm(`${email} 계정을 삭제할까요? (로그인 계정도 삭제)`)) return; try { await api(`/api/members?email=${encodeURIComponent(email)}`, undefined, 'DELETE'); load(); } catch (e: any) { alert(e.message); } };

  return (
    <>
      <h1>직원 · 권한</h1>
      <p className="mute">직원은 받은 <b>권한 블록</b>만 보입니다. 메뉴·현황판·작업대에서 권한 밖의 단계와 데이터는 서버에서 아예 내려보내지 않아 전체 구조를 볼 수 없습니다.</p>

      <div className="card">
        <h2>계정 목록</h2>
        <table><thead><tr><th>이름</th><th>이메일</th><th>역할</th><th>권한 블록</th><th>최근 접속</th><th></th></tr></thead>
          <tbody>{list.map((m) => (
            <Fragment key={m.email}>
              <tr style={{ opacity: m.active ? 1 : 0.5 }}>
                <td>{m.name || '-'}</td><td>{m.email}{m.email === meEmail && <span className="mute"> (나)</span>}</td>
                <td><span className={`role ${m.role}`}>{m.role === 'owner' ? '대표' : '직원'}</span>{!m.active && <span className="mute"> 꺼짐</span>}</td>
                <td className="mute" style={{ maxWidth: 380 }}>{m.role === 'owner' ? '전체' : label(m.perms)}</td>
                <td className="mute">{m.last_login_at ? new Date(m.last_login_at).toLocaleString('ko-KR') : '-'}</td>
                <td className="row" style={{ gap: 4 }}>
                  {m.role === 'staff' && <button onClick={() => { setEditing(editing === m.email ? null : m.email); setPerms(m.perms || {}); }}>{editing === m.email ? '닫기' : '권한 수정'}</button>}
                  <button onClick={() => resetPw(m.email)}>비밀번호 재설정</button>
                  {m.email !== meEmail && <button onClick={() => patch(m.email, { active: !m.active })}>{m.active ? '끄기' : '켜기'}</button>}
                  {m.email !== meEmail && <button onClick={() => patch(m.email, { role: m.role === 'owner' ? 'staff' : 'owner' })}>{m.role === 'owner' ? '직원으로' : '대표로'}</button>}
                  {m.email !== meEmail && <button onClick={() => del(m.email)}>삭제</button>}
                </td>
              </tr>
              {editing === m.email && (
                <tr><td colSpan={6}>
                  <PermEditor value={perms} onChange={setPerms} />
                  <button className="pri" style={{ marginTop: 8 }} onClick={() => { patch(m.email, { perms }); setEditing(null); }}>권한 저장</button>
                </td></tr>
              )}
            </Fragment>
          ))}</tbody>
        </table>
      </div>

      <div className="card">
        <h2>직원 추가</h2>
        <div className="row">
          <input placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="이메일 (로그인 아이디)" style={{ minWidth: 260 }} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="임시 비밀번호" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="staff">직원</option><option value="owner">대표(전체 권한)</option></select>
        </div>
        {form.role === 'staff' && <div style={{ marginTop: 12 }}><PermEditor value={form.perms} onChange={(p) => setForm({ ...form, perms: p })} /></div>}
        <button className="pri" style={{ marginTop: 10 }} onClick={add}>추가</button>
        {created && <div className="card welcome" style={{ marginTop: 10 }}><b>직원에게 전달하세요</b><pre style={{ margin: '6px 0' }}>{created}</pre><button onClick={() => { navigator.clipboard.writeText(created); }}>복사</button></div>}
      </div>
    </>
  );
}
