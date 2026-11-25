'use client';
import { Fragment, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { GATE_KO } from '@/lib/steps';

const OUT: Record<string, [string, string]> = {
  approved: ['바로 승인', 'approved'], review: ['검수 대기', 'review'], failed: ['실패', 'rejected'], stopped: ['중지', 'rejected'],
};
const dt = (s: string) => new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * SOP 버전 · 사용 이력 — 버전마다 언제 저장됐고, 어떤 결과물(콘텐츠)에 몇 번 쓰였고, 결과·평균 점수가 어땠는지.
 * 작업대 결과물의 'SOP abc123' 링크로 들어오면 그 버전이 펼쳐짐 (?v=해시)
 */
export default function SopUsage({ step, refreshKey, onLoad }: { step: string; refreshKey?: any; onLoad: (v: { content: string; freedom: number; gate: string }) => void }) {
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setD(null);
    api('/api/sop', { action: 'usage', step }).then((r) => {
      setD(r);
      const v = new URLSearchParams(location.search).get('v');
      if (v) { setOpen(v); setTimeout(() => document.getElementById(`sopv-${v}`)?.scrollIntoView({ block: 'center' }), 200); }
    }).catch((e) => setD({ error: e.message }));
  }, [step, refreshKey]);
  if (!d) return <div className="card mute">SOP 이력 불러오는 중…</div>;
  if (d.error) return <div className="card bad">{d.error}</div>;
  const usesOf = (h: string) => (d.usage || []).filter((u: any) => u.sop_hash === h);

  const Uses = ({ h }: { h: string }) => (
    <table style={{ fontSize: 12, margin: '6px 0 4px', width: '100%' }}><tbody>
      {usesOf(h).map((u: any) => (
        <tr key={u.id}>
          <td className="mute" style={{ whiteSpace: 'nowrap' }}>{dt(u.created_at)}</td>
          <td>{u.content_id ? <a href={`/admin/contents/${u.content_id}`}>{u.contents?.topic || u.contents?.slug || u.content_id.slice(0, 8)}</a> : '-'}</td>
          <td><span className={`tag ${OUT[u.outcome]?.[1] || ''}`}>{OUT[u.outcome]?.[0] || u.outcome}</span>{u.decided_by === 'ai' ? ' (AI 승인)' : ''}{u.feedback ? ' · 수정 지시' : ''}</td>
          <td className="mute">{u.model || u.provider || ''}</td>
        </tr>
      ))}
      {!usesOf(h).length && <tr><td className="mute">아직 이 버전으로 만든 결과물이 없습니다</td></tr>}
    </tbody></table>
  );

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>🗂 SOP 버전 · 사용 이력 <span className="mute" style={{ fontWeight: 400, fontSize: 13 }}>버전마다 어떤 결과물에 쓰였는지 · 결과물 {d.usage.length}건 기록</span></h2>
      <p className="mute" style={{ marginTop: -6, fontSize: 13 }}>결과물이 만들어질 때마다 그때 쓰인 SOP 내용(해시)이 기록됩니다. 한 번도 저장하지 않은 저장소 기본 SOP 도 처음 쓰일 때 전문이 남습니다. 작업대 각 단계의 &lsquo;SOP 버전&rsquo; 링크로도 들어올 수 있습니다.</p>
      <table className="sopv"><thead><tr><th>버전</th><th>저장·기록</th><th>사용</th><th>결과</th><th>평균 점수</th><th></th></tr></thead><tbody>
        {d.versions.map((v: any) => (
          <Fragment key={v.id}>
            <tr id={`sopv-${v.hash}`} className={open === v.hash ? 'on' : ''}>
              <td><code>{v.hash}</code>{v.current && <span className="tag approved" style={{ marginLeft: 4 }}>현재</span>}</td>
              <td style={{ fontSize: 12 }}>{dt(v.created_at)} · 자유 {v.freedom} · {GATE_KO[v.gate] || v.gate}<div className="mute">{v.note}</div></td>
              <td><b>{v.uses}</b>회{v.last_used && <div className="mute" style={{ fontSize: 11 }}>마지막 {dt(v.last_used)}</div>}</td>
              <td style={{ fontSize: 12 }}>{v.uses ? <>승인 {v.approved} · 검수 {v.review}{v.failed ? <> · <span style={{ color: '#c62828' }}>실패 {v.failed}</span></> : null}</> : '-'}</td>
              <td>{v.avg_score != null ? <>{v.avg_score}<span className="mute" style={{ fontSize: 11 }}> ({v.scored}건)</span></> : <span className="mute">-</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button onClick={() => setOpen(open === v.hash ? null : v.hash)}>{open === v.hash ? '접기' : '쓰인 결과물'}</button>
                <button onClick={() => onLoad(v)}>이 버전 불러오기</button>
              </td>
            </tr>
            {open === v.hash && <tr key={`${v.id}-u`}><td colSpan={6} style={{ background: '#f8fafc' }}><Uses h={v.hash} /><details><summary className="mute" style={{ fontSize: 12 }}>이 버전 SOP 전문 보기</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 320, overflow: 'auto' }}>{v.content}</pre></details></td></tr>}
          </Fragment>
        ))}
        {(d.orphan || []).map((h: string) => (
          <Fragment key={h}>
            <tr id={`sopv-${h}`}><td><code>{h}</code></td><td className="mute" style={{ fontSize: 12 }}>기록 이전 버전 (전문 없음)</td><td><b>{usesOf(h).length}</b>회</td><td /><td /><td><button onClick={() => setOpen(open === h ? null : h)}>{open === h ? '접기' : '쓰인 결과물'}</button></td></tr>
            {open === h && <tr key={`${h}-u`}><td colSpan={6}><Uses h={h} /></td></tr>}
          </Fragment>
        ))}
      </tbody></table>
      <style>{`.sopv{width:100%;border-collapse:collapse}.sopv th{text-align:left;font-size:12px;color:var(--mute);font-weight:600;padding:6px}.sopv td{padding:6px;border-top:1px solid var(--line);vertical-align:top}.sopv tr.on>td{background:#eef2ff}`}</style>
    </div>
  );
}
