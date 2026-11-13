'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type K = { key: string; label: string; group: string; secret?: boolean; auto?: boolean; multiline?: boolean; help?: string; placeholder?: string; source: 'admin' | 'env' | 'none'; preview: string; updated_at: string | null };

const SRC = { admin: '관리자 입력', env: 'Vercel 환경변수', none: '비어 있음' };

export default function Keys() {
  const [d, setD] = useState<any>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const load = () => api('/api/keys').then(setD).catch((e) => setNote(e.message));
  useEffect(() => { load(); setQ(new URLSearchParams(location.search)); }, []);

  const dirty = Object.keys(vals).filter((k) => vals[k] !== undefined);
  const save = async () => {
    setBusy('save');
    try { const r = await api('/api/keys', { action: 'save', values: vals }); setNote(`저장됨: ${r.saved.join(', ') || '-'}${r.removed.length ? ` · 지움: ${r.removed.join(', ')}` : ''} — 바로 적용됩니다 (재배포 필요 없음)`); setVals({}); load(); }
    catch (e: any) { alert(e.message); }
    setBusy('');
  };
  const act = async (action: string, extra: any = {}) => {
    setBusy(action);
    try {
      const r = await api('/api/keys', { action, ...extra });
      if (action === 'sync_github') setNote(`GitHub Secrets 등록 완료: ${r.done.join(', ')} — 이제 워커가 나머지 키를 여기서 읽습니다`);
      if (action === 'test_github') setNote(r.ok ? `저장소 연결 OK · ${r.private ? '비공개' : '공개'} · 워크플로 ${r.workflows?.join(', ') || '없음'}` : `연결 실패: ${r.error}`);
      if (action === 'regen') { if (r.value) prompt('새 MCP 토큰 (지금만 보입니다)', r.value); else setNote('새 워커 비밀값 발급 — 워커는 다음 실행부터 자동으로 새 값을 씁니다'); load(); }
      if (action === 'reveal_mcp') prompt('MCP 토큰', r.value || '(없음)');
    } catch (e: any) { alert(e.message); }
    setBusy('');
  };

  if (!d) return <p>{note || '불러오는 중…'}</p>;
  const keys: K[] = d.keys;
  const welcome = q?.get('welcome');
  const yt = q?.get('yt');
  const aiReady = d.providers && (d.providers.claude.ready || d.providers.openai.ready || d.providers.oss.ready);

  return (
    <>
      <h1>연결 · 키</h1>
      {welcome && (
        <div className="card welcome">
          <b>대표 계정이 만들어졌습니다 🎉</b>
          <ol style={{ margin: '6px 0 0', lineHeight: 1.7 }}>
            <li><b>AI</b> 키를 하나 이상 입력 (Claude·OpenAI·오픈소스 중)</li>
            <li><b>워커(GitHub)</b> 저장소·토큰 입력 → 저장 → <b>[워커에 적용]</b> (GitHub Secrets 를 자동 등록)</li>
            <li>목소리·유튜브·인스타·이메일은 쓸 때 입력 — 저장하면 재배포 없이 바로 적용됩니다</li>
            <li>직원은 [직원 · 권한]에서 추가</li>
          </ol>
        </div>
      )}
      {yt === 'ok' && <div className="card ok">유튜브 계정 연결 완료 — 리프레시 토큰이 저장되었습니다.</div>}
      {yt === 'norefresh' && <div className="card bad">리프레시 토큰이 오지 않았습니다. Google 계정 → 보안 → 타사 앱 연결에서 이 앱을 해제한 뒤 다시 연결하세요.</div>}
      {yt === 'noclient' && <div className="card bad">유튜브 OAuth 클라이언트 ID·보안 비밀을 먼저 저장하세요.</div>}
      {yt === 'fail' && <div className="card bad">유튜브 연결 실패: {q?.get('msg')}</div>}
      {note && <div className="card">{note}</div>}

      <div className="card">
        <h2>상태</h2>
        <div className="row">
          <span className={`tag ${d.supabase.service ? 'approved' : 'rejected'}`}>Supabase {d.supabase.service ? '연결됨' : '키 없음'}</span>
          <span className={`tag ${aiReady ? 'approved' : 'rejected'}`}>AI {aiReady ? ['claude', 'openai', 'oss'].filter((p) => d.providers[p].ready).join(' → ') : '키 없음'}</span>
          <span className="mute">사이트 주소 {d.site}</span>
        </div>
        <p className="mute" style={{ marginBottom: 0 }}>
          Vercel 환경변수에는 <b>Supabase 3개만</b> 있으면 됩니다(NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY).
          나머지는 전부 여기서 입력합니다. 같은 키가 Vercel 에도 있으면 <b>여기 입력한 값이 우선</b>입니다. 비밀값은 Supabase 에만 저장되고 브라우저로는 끝 4자리만 보입니다.
        </p>
      </div>

      {d.groups.map((g: any) => (
        <div className="card" key={g.group}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{g.group} <span className="mute" style={{ fontWeight: 400, fontSize: 13 }}>{g.desc}</span></h2>
            <div className="row">
              {g.group === '워커(GitHub)' && <>
                <button disabled={!!busy} onClick={() => act('test_github')}>{busy === 'test_github' ? '확인 중…' : '연결 확인'}</button>
                <button className="acc" disabled={!!busy} onClick={() => act('sync_github')}>{busy === 'sync_github' ? '등록 중…' : '워커에 적용 (GitHub Secrets 자동 등록)'}</button>
              </>}
              {g.group === '유튜브' && <a href="/api/oauth/youtube"><button>유튜브 계정 연결</button></a>}
              {g.group === '이메일 알림' && <a href="/admin/settings"><button>알림 받을 주소·테스트 메일 →</button></a>}
              {g.group === '자동 생성' && <>
                <button disabled={!!busy} onClick={() => act('reveal_mcp')}>MCP 토큰 보기</button>
                <button disabled={!!busy} onClick={() => confirm('MCP 토큰을 새로 발급하면 기존 Claude Code·Codex 연결이 끊깁니다') && act('regen', { key: 'MCP_TOKEN' })}>MCP 토큰 재발급</button>
                <button disabled={!!busy} onClick={() => confirm('워커 비밀값을 새로 발급할까요? (워커는 자동으로 새 값을 씀)') && act('regen', { key: 'WORKER_SECRET' })}>워커 비밀값 재발급</button>
              </>}
            </div>
          </div>
          {keys.filter((k) => k.group === g.group).map((k) => {
            const editingVal = vals[k.key];
            const Input: any = k.multiline ? 'textarea' : 'input';
            return (
              <div className="keyrow" key={k.key}>
                <div>
                  <b style={{ fontSize: 14 }}>{k.label}</b><br />
                  <code className="mute" style={{ fontSize: 11 }}>{k.key}</code>
                </div>
                <div>
                  <Input
                    type={k.secret && !show[k.key] && !k.multiline ? 'password' : 'text'}
                    placeholder={k.preview ? `${k.preview}  (바꾸려면 새 값 입력)` : k.placeholder || ''}
                    value={editingVal ?? ''}
                    rows={k.multiline ? 3 : undefined}
                    onChange={(e: any) => setVals({ ...vals, [k.key]: e.target.value })}
                    autoComplete="off"
                  />
                  {k.help && <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>{k.help}</div>}
                </div>
                <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
                  <span className={`src ${k.source}`}>{SRC[k.source]}</span>
                  <div className="row" style={{ gap: 4 }}>
                    {k.secret && !k.multiline && <a href="#" className="mute" style={{ fontSize: 12 }} onClick={(e) => { e.preventDefault(); setShow({ ...show, [k.key]: !show[k.key] }); }}>{show[k.key] ? '가리기' : '보이기'}</a>}
                    {k.source === 'admin' && !k.auto && <a href="#" className="mute" style={{ fontSize: 12 }} onClick={(e) => { e.preventDefault(); if (confirm(`${k.label} 값을 지울까요?`)) setVals({ ...vals, [k.key]: '' }); }}>지우기</a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ position: 'sticky', bottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="pri" disabled={!dirty.length || busy === 'save'} onClick={save} style={{ boxShadow: '0 6px 20px rgba(0,0,0,.15)' }}>
          {busy === 'save' ? '저장 중…' : `저장 (${dirty.length}개 변경)`}
        </button>
      </div>
    </>
  );
}
