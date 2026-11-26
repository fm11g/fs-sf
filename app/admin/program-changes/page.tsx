'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const ST_COLOR: Record<string, string> = { 접수중: '#14845b', 접수예정: '#1739a6', 마감: '#c0392b', 조기마감: '#c0392b', 취소: '#c0392b', 확인불가: '#8a6100' };
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** 공고 변경 확인 — 다룬 공고의 일정 · 내용 변경을 감지하면 근거 링크와 함께 보여 주고, 반영할지 사람이 결정 */
export default function ProgramChanges() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<string>('');
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const load = () => api('/api/program-changes').then(setD).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const act = async (key: string, body: any, ok: (r: any) => string) => {
    setBusy(key); setMsg('');
    try { const r = await api('/api/program-changes', body, 'POST'); setMsg(ok(r)); await load(); }
    catch (e: any) { setMsg(e.message); }
    setBusy('');
  };

  if (!d) return <p>{msg || '불러오는 중…'}</p>;
  const pending = d.changes.filter((x: any) => x.status === 'pending');
  const done = d.changes.filter((x: any) => x.status !== 'pending');
  return (
    <>
      <h1>공고 변경 확인</h1>
      <p className="mute" style={{ marginTop: -12 }}>
        숏폼으로 다룬 정책자금 공고를 매일 다시 확인합니다(마감 연장 · 조기 마감 · 취소 · 금액/금리/대상/기간 정정). 변경이 근거 링크와 함께 확인되면 여기에 올라오고,
        <b> [반영]</b>하면 조사 산출물의 공고 값과 이벤트 마감을 고치고 홈페이지 오늘의 랜딩 · 진행 중인 정책자금을 새 일정으로 바꿉니다. 정보글 본문은 바뀌지 않으니 필요하면 홈페이지 관리자에서 고치세요.
      </p>
      <div className="row" style={{ margin: '6px 0 14px' }}>
        <button disabled={!!busy} onClick={() => act('all', { action: 'check_all' }, (r) => `확인 ${r.checked}건 · 변경 ${r.changed}건`)}>{busy === 'all' ? '확인 중… (1~3분)' : '진행 중 공고 지금 확인'}</button>
        <span className="mute">{msg}</span>
      </div>

      <h2 style={{ fontSize: 17 }}>결정 대기 {pending.length}건</h2>
      {pending.length === 0 && <div className="card mute">결정할 변경이 없습니다.</div>}
      {pending.map((x: any) => {
        const c = x.contents || {};
        return (
          <div className="card" key={x.id} style={{ borderLeft: `4px solid ${ST_COLOR[x.program_status] || '#c0392b'}` }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <b style={{ fontSize: 16 }}>{c.research?.program?.name || c.topic}</b>{' '}
                <span className="pill" style={{ background: ST_COLOR[x.program_status] || '#999', color: '#fff' }}>{x.program_status}</span>{' '}
                <span className="mute">확신도 {x.confidence} · {fmt(x.detected_at)} 감지</span>
                <div className="mute"><Link href={`/admin/contents/${c.id}`}>{c.post?.title || c.slug}</Link>
                  {c.site_landing?.url && <> · <a href={c.site_landing.url} target="_blank" rel="noreferrer">홈페이지 랜딩</a></>}
                  {c.site_post?.url && <> · <a href={c.site_post.url} target="_blank" rel="noreferrer">정보글</a></>}
                </div>
              </div>
            </div>
            <p style={{ margin: '10px 0' }}>{x.summary}</p>
            <table>
              <thead><tr><th style={{ width: 120 }}>항목</th><th>지금 (홈페이지 · 숏폼)</th><th>확인된 새 내용</th></tr></thead>
              <tbody>
                {(x.changes || []).map((ch: any, i: number) => (
                  <tr key={i}><td><b>{ch.label}</b></td><td className="mute" style={{ textDecoration: 'line-through' }}>{ch.before || '—'}</td><td><b style={{ color: '#c0392b' }}>{ch.after}</b></td></tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10 }}>
              <b>근거 — 실제 변경 공고</b>
              <ul style={{ margin: '6px 0', paddingLeft: 18, lineHeight: 1.7 }}>
                {(x.evidence || []).map((e: any, i: number) => (
                  <li key={i}><a href={e.url} target="_blank" rel="noreferrer">{e.title || e.url}</a>{e.date && <span className="mute"> · {e.date}</span>}{e.quote && <div className="mute">“{e.quote}”</div>}</li>
                ))}
              </ul>
              {c.research?.program?.url && <p className="mute" style={{ margin: 0 }}>처음 조사한 원문: <a href={c.research.program.url} target="_blank" rel="noreferrer">{c.research.program.url}</a></p>}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <input placeholder="메모 (선택)" value={notes[x.id] || ''} onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
              <button className="pri" disabled={!!busy} onClick={() => confirm('이 변경을 반영할까요? 홈페이지 오늘의 랜딩 · 진행 중인 정책자금의 일정 · 내용이 바뀝니다.') && act(`a${x.id}`, { action: 'apply', id: x.id, note: notes[x.id] }, (r) => r.site_error ? `반영했지만 홈페이지 갱신 실패: ${r.site_error}` : '반영했습니다 — 1~2분 뒤 홈페이지에 보입니다')}>{busy === `a${x.id}` ? '반영 중…' : '반영 (홈페이지 갱신)'}</button>
              <button disabled={!!busy} onClick={() => act(`d${x.id}`, { action: 'dismiss', id: x.id, note: notes[x.id] }, () => '무시했습니다')}>무시</button>
            </div>
          </div>
        );
      })}

      <h2 style={{ fontSize: 17, marginTop: 24 }}>최근 확인 결과</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>공고</th><th>상태</th><th>확인</th><th>요약</th><th></th></tr></thead>
          <tbody>
            {(d.checks || []).map((c: any) => (
              <tr key={c.id}>
                <td><Link href={`/admin/contents/${c.id}`}>{c.research?.program?.name || c.topic}</Link></td>
                <td><span className="pill" style={{ background: ST_COLOR[c.program_check?.status] || '#999', color: '#fff' }}>{c.program_check?.status}</span></td>
                <td className="mute" style={{ whiteSpace: 'nowrap' }}>{fmt(c.program_check?.at)}</td>
                <td className="mute">{c.program_check?.summary}</td>
                <td><button disabled={!!busy} onClick={() => act(`c${c.id}`, { action: 'check', contentId: c.id }, (r) => r.changed ? '변경 감지 — 위 결정 대기에 올렸습니다' : `변경 없음 · ${r.status}`)}>{busy === `c${c.id}` ? '확인 중…' : '다시 확인'}</button></td>
              </tr>
            ))}
            {!(d.checks || []).length && <tr><td colSpan={5} className="mute">아직 확인한 공고가 없습니다 (매일 18시 자동 · 위 버튼으로 지금 확인)</td></tr>}
          </tbody>
        </table>
      </div>

      {done.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, marginTop: 24 }}>결정한 변경</h2>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>결정</th><th>공고</th><th>바뀐 항목</th><th>근거</th><th>결정자 · 메모</th></tr></thead>
              <tbody>
                {done.map((x: any) => (
                  <tr key={x.id}>
                    <td><span className="pill">{x.status === 'applied' ? '반영' : '무시'}</span><div className="mute">{fmt(x.decided_at)}</div></td>
                    <td>{x.contents?.research?.program?.name || x.contents?.topic}</td>
                    <td className="mute">{(x.changes || []).map((ch: any) => `${ch.label}: ${ch.before || '—'} → ${ch.after}`).join(' / ')}</td>
                    <td>{(x.evidence || []).slice(0, 2).map((e: any, i: number) => <div key={i}><a href={e.url} target="_blank" rel="noreferrer">{(e.title || e.url).slice(0, 40)}</a></div>)}</td>
                    <td className="mute">{x.decided_by}{x.note ? ` · ${x.note}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
