'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { applyChanges, type SopChange } from '@/lib/sop-merge';

const OP: Record<string, string> = { add: '추가', modify: '수정', remove: '삭제' };
const KIND: Record<string, string> = { good: '👍 좋은 예', edit: '✍️ 수정 예', bad: '👎 아쉬운 예' };
const defaultOn = (c: SopChange) => c.op !== 'remove' && c.section.replace(/\s/g, '') !== '금지';

export default function LearnPanel({ step, current, mode, onChanged }: { step: string; current: string; mode?: string; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [ex, setEx] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [final, setFinal] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const [d, e] = await Promise.all([api(`/api/learn?step=${step}`), api(`/api/exemplars?step=${step}`)]);
    setData(d); setEx(e.items);
    const p = d.proposals.find((x: any) => x.status === 'pending');
    setSel(p ? Object.fromEntries((p.changes as SopChange[]).map((c, i) => [i, defaultOn(c)])) : {});
    setEdits({}); setFinal(null);
  }, [step]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const pending = data?.proposals?.find((x: any) => x.status === 'pending');
  const history = (data?.proposals || []).filter((x: any) => x.status !== 'pending');
  const changes: SopChange[] = pending?.changes || [];
  const selected = changes.map((_, i) => i).filter((i) => sel[i]);
  const preview = useMemo(() => (pending ? applyChanges(current, changes, selected, edits) : null), [pending, current, changes, selected, edits]);
  const conflict = (i: number) => preview?.results.find((r) => r.i === i && !r.ok)?.conflict;

  const act = async (name: string, fn: () => Promise<any>, ok?: (r: any) => string) => {
    setBusy(name);
    try { const r = await fn(); if (ok) alert(ok(r)); await load(); onChanged(); }
    catch (e: any) { alert(e.message); }
    setBusy(null);
  };

  if (!data) return <div className="card">학습 정보를 불러오는 중…</div>;
  const c = data.counts;

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>🧠 좋은 결과물로 SOP 보완</h2>
          <span className="mute">모드: <b>{mode === 'auto' ? '안전한 변경 자동 반영' : mode === 'off' ? '꺼짐' : '제안만 (사람이 반영)'}</b> · <Link href="/admin/settings">설정</Link></span>
        </div>
        <p className="mute" style={{ margin: '8px 0' }}>
          작업대에서 👍 좋은 예 · 👎 아쉬운 예로 고르거나, 산출물을 직접 고친 뒤 승인하면(✍️ 수정 예) 학습 재료가 쌓입니다.
          미반영 좋은/수정 예가 <b>{data.learn_min}개</b> 모이면 AI 가 기존 SOP 를 유지한 채 추가·수정·삭제할 줄만 제안합니다.
        </p>
        <div className="row">
          <span className="tag approved">👍 {c.good}</span><span className="tag approved">✍️ {c.edit}</span><span className="tag rejected">👎 {c.bad}</span>
          <span className="mute">미반영 학습 재료 {c.unused_signal}/{data.learn_min}</span>
          <button className="pri" disabled={!!busy || !c.unused_signal} onClick={() => act('propose', () => api('/api/learn', { action: 'propose', step, force: !!pending }), (r) => r.auto_applied?.length ? `자동 반영 ${r.auto_applied.length}건` : `제안 ${r.proposal.changes.length}건 생성`)}>
            {busy === 'propose' ? '분석 중… (20~60초)' : pending ? '새 제안 만들기 (대기 제안 대체)' : '지금 SOP 제안 만들기'}
          </button>
        </div>
      </div>

      {pending && (
        <div className="card" style={{ borderColor: '#c4b5fd' }}>
          <h2>검토 대기 제안 #{pending.id} <span className="mute">{new Date(pending.created_at).toLocaleString('ko-KR')} · {pending.provider} · 근거 예시 {pending.exemplar_ids.length}개</span></h2>
          <p>{pending.summary}</p>
          {pending.patterns?.length > 0 && (
            <details style={{ marginBottom: 10 }}><summary className="mute">좋은 예에서 찾은 공통점 {pending.patterns.length}개</summary>
              <ul>{pending.patterns.map((x: any, i: number) => <li key={i}>{x.pattern} <span className="mute">— {x.in_sop === 'already' ? '이미 SOP 에 있음' : x.in_sop === 'different' ? 'SOP 와 다름' : 'SOP 에 없음'} · #{(x.evidence || []).join(', #')}</span></li>)}</ul>
            </details>
          )}
          {!changes.length && <p className="mute">바꿀 근거가 부족해 변경 제안이 없습니다. 거절해서 닫으면 됩니다.</p>}
          {changes.map((ch, i) => (
            <div key={i} className={`chg ${sel[i] ? '' : 'off'}`}>
              <input type="checkbox" checked={!!sel[i]} onChange={(e) => setSel({ ...sel, [i]: e.target.checked })} />
              <div>
                <div><span className={`op ${ch.op}`}>{OP[ch.op]}</span><b>{ch.section}</b> {ch.warn && <span className="warnchip">⚠ {ch.warn}</span>} {sel[i] && conflict(i) && <span className="warnchip" style={{ background: '#fdecea', color: '#c0392b' }}>충돌: {conflict(i)}</span>}</div>
                {ch.target && <div className="before">{ch.target}</div>}
                {ch.op !== 'remove' && <input type="text" value={edits[i] ?? ch.text ?? ''} onChange={(e) => setEdits({ ...edits, [i]: e.target.value })} style={{ marginTop: 4 }} />}
                <div className="why">{ch.reason} {ch.evidence?.length ? `· 근거 예시 #${ch.evidence.join(', #')}` : ''}</div>
              </div>
            </div>
          ))}
          {changes.length > 0 && (
            <details style={{ margin: '10px 0' }} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && final == null) setFinal(preview?.content || current); }}>
              <summary><b>반영 후 SOP 미리보기 · 직접 다듬기</b> <span className="mute">(여기서 고치면 이 내용 그대로 저장)</span></summary>
              <textarea style={{ minHeight: 360, fontSize: 13, lineHeight: 1.6, marginTop: 8 }} value={final ?? preview?.content ?? ''} onChange={(e) => setFinal(e.target.value)} />
              <button onClick={() => setFinal(preview?.content || current)}>선택한 변경으로 다시 만들기</button>
            </details>
          )}
          <div className="row">
            <input style={{ flex: 1 }} placeholder="메모 (선택) — 반영/거절 이유" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="ok" disabled={!!busy || (!selected.length && final == null)} onClick={() => act('apply', () => api('/api/learn', { action: 'apply', id: pending.id, selected, edits, content: final ?? undefined, note }), (r) => `반영 ${r.applied.length}건${r.conflicts.length ? ` · 충돌로 건너뜀 ${r.conflicts.length}건` : ''}`)}>
              {busy === 'apply' ? '반영 중…' : `선택한 ${selected.length}건 반영`}
            </button>
            <button disabled={!!busy} onClick={() => act('reject', () => api('/api/learn', { action: 'reject', id: pending.id, note }))}>거절 (SOP 유지)</button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <details className="card">
          <summary><b>학습 이력 ({history.length})</b></summary>
          <table><tbody>
            {history.map((h: any) => (
              <tr key={h.id}>
                <td className="mute">#{h.id} {new Date(h.created_at).toLocaleDateString('ko-KR')}</td>
                <td><span className={`tag ${h.status === 'applied' ? 'approved' : 'pending'}`}>{h.status === 'applied' ? `반영 ${h.applied_changes?.length ?? ''}건${h.decided_by === 'auto' ? ' (자동)' : ''}` : h.status === 'superseded' ? '대체됨' : '거절'}</span></td>
                <td>{String(h.summary || '').slice(0, 120)}</td>
                <td>{h.status === 'applied' && <button disabled={!!busy} onClick={() => confirm('이 반영을 되돌릴까요? (반영 전 SOP 로 복원)') && act('revert', () => api('/api/learn', { action: 'revert', id: h.id }), () => '되돌렸습니다')}>되돌리기</button>}</td>
              </tr>
            ))}
          </tbody></table>
        </details>
      )}

      <details className="card">
        <summary><b>학습 재료 ({ex.length})</b> <span className="mute">— 잘못 고른 것은 지우면 다음 제안에서 빠집니다</span></summary>
        <table><tbody>
          {ex.map((x) => (
            <tr key={x.id}>
              <td className="mute">#{x.id}</td>
              <td>{KIND[x.kind]}</td>
              <td>{x.content_id ? <Link href={`/admin/contents/${x.content_id}`}>{x.topic || '(주제 없음)'}</Link> : x.topic}</td>
              <td className="mute">{x.note}</td>
              <td className="mute">{x.used_in ? `제안 #${x.used_in}에 사용` : '미반영'}</td>
              <td className="mute">{new Date(x.created_at).toLocaleDateString('ko-KR')}</td>
              <td><button onClick={() => confirm('이 학습 재료를 지울까요?') && act('del', () => api(`/api/exemplars?id=${x.id}`, undefined, 'DELETE'))}>삭제</button></td>
            </tr>
          ))}
        </tbody></table>
      </details>
    </>
  );
}
