'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import UsagePanel from '../UsagePanel';
import Link from 'next/link';
import { api } from '@/lib/api';
import { applyChanges, lineDiff, type SopChange } from '@/lib/sop-merge';

const OP: Record<string, string> = { add: '추가', modify: '수정', remove: '삭제' };
const defaultOn = (c: SopChange) => c.op !== 'remove' && c.section.replace(/\s/g, '') !== '금지';
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-');

export default function LearnPanel({ step, current, mode, onChanged }: { step: string; current: string; mode?: string; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [ex, setEx] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [final, setFinal] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [instr, setInstr] = useState('');
  const [force, setForce] = useState(false);

  const load = useCallback(async () => {
    const [dd, e] = await Promise.all([api(`/api/learn?step=${step}`), api(`/api/exemplars?step=${step}`)]);
    setData(dd); setEx(e.items);
    const p = dd.proposals.find((x: any) => x.status === 'pending');
    setSel(p?.kind === 'patch' ? Object.fromEntries((p.changes as SopChange[]).map((c, i) => [i, defaultOn(c)])) : {});
    setEdits({}); setFinal(p?.kind === 'rewrite' ? p.proposed_content : null); setForce(false);
  }, [step]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const pending = data?.proposals?.find((x: any) => x.status === 'pending');
  const history = (data?.proposals || []).filter((x: any) => x.status !== 'pending');
  const changes: SopChange[] = pending?.kind === 'patch' ? pending.changes || [] : [];
  const selected = changes.map((_, i) => i).filter((i) => sel[i]);
  const preview = useMemo(() => (pending?.kind === 'patch' ? applyChanges(current, changes, selected, edits) : null), [pending, current, changes, selected, edits]);
  const diff = useMemo(() => (pending?.kind === 'rewrite' ? lineDiff(pending.base_content, final ?? pending.proposed_content) : null), [pending, final]);
  const conflict = (i: number) => preview?.results.find((r) => r.i === i && !r.ok)?.conflict;
  const baseChanged = pending && pending.base_content !== current;

  const act = async (name: string, fn: () => Promise<any>, ok?: (r: any) => string) => {
    setBusy(name);
    try { const r = await fn(); if (ok) alert(ok(r)); await load(); onChanged(); }
    catch (e: any) { alert(e.message); }
    setBusy(null);
  };

  if (!data) return <div className="card">학습 정보를 불러오는 중…</div>;
  const c = data.counts;
  const L = data.summary?.data;
  const maxN = Math.max(1, ...(L?.dist || []).map((x: any) => x.n));
  const up = (L?.lift || []).filter((x: any) => x.lift > 0).slice(0, 6);
  const down = (L?.lift || []).filter((x: any) => x.lift < 0).slice(-6).reverse();

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>🧠 점수로 SOP 최적화</h2>
          <span className="mute">학습 방식: <b>{mode === 'auto' ? '안전한 변경 자동 반영' : mode === 'off' ? '꺼짐' : '제안만'}</b> · <Link href="/admin/settings">설정</Link></span>
        </div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div>
            <p style={{ margin: '0 0 6px' }}>평가 <b>{c.rated}</b>건 · 평균 <b>★{c.avg ?? '-'}</b> · 수정 예 {c.edit} · 미반영 학습 재료 {c.unused_signal}/{data.learn_min}</p>
            {(L?.dist || []).map((x: any) => (
              <div key={x.score} className="row" style={{ gap: 6, fontSize: 12 }}><span style={{ width: 24 }}>★{x.score}</span><span className="scorebar" style={{ width: `${(x.n / maxN) * 160}px` }} /><span className="mute">{x.n}</span></div>
            ))}
            {L?.sopTrend?.length > 0 && (
              <table style={{ marginTop: 8 }}><thead><tr><th>SOP 버전</th><th>사용 시작</th><th>평가</th><th>평균</th></tr></thead><tbody>
                {L.sopTrend.slice(-5).map((v: any) => <tr key={v.hash}><td><code>{v.hash}</code></td><td className="mute">{d(v.since)}</td><td>{v.n}</td><td><b>★{v.avg}</b></td></tr>)}
              </tbody></table>
            )}
          </div>
          <div>
            <b>점수를 올린 조건 / 내린 조건</b> <span className="mute">(평균 대비, 2건 이상)</span>
            <table style={{ marginTop: 4 }}><tbody>
              {up.map((x: any) => <tr key={x.tag}><td className="up">▲ {x.tag}</td><td>★{x.avg}</td><td className="mute">+{x.lift} · n={x.n}</td></tr>)}
              {down.map((x: any) => <tr key={x.tag}><td className="down">▼ {x.tag}</td><td>★{x.avg}</td><td className="mute">{x.lift} · n={x.n}</td></tr>)}
              {!up.length && !down.length && <tr><td className="mute">평가가 더 쌓이면 표시됩니다</td></tr>}
            </tbody></table>
          </div>
        </div>
        <details style={{ marginTop: 8 }}><summary><b>지금까지의 학습 노트</b> <span className="mute">— SOP 를 정리할 때 AI 가 이 내용을 읽습니다 (GitHub data/learnings 에도 저장)</span></summary>
          <pre className="md" style={{ marginTop: 8 }}>{data.summary?.md}</pre>
        </details>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="pri" disabled={!!busy || !c.unused_signal} onClick={() => act('propose', () => api('/api/learn', { action: 'propose', step, force: !!pending }), (r) => r.auto_applied?.length ? `자동 반영 ${r.auto_applied.length}건` : `보완 제안 ${r.proposal.changes.length}건 생성`)}
            title="미반영 고득점 예시·수정 예로 줄 단위 추가·수정·삭제 제안">
            {busy === 'propose' ? '분석 중… (20~60초)' : '보완 제안 (줄 단위)'}
          </button>
          <input style={{ flex: 1 }} placeholder="재정리 지시 (선택) — 예: 집중 포인트를 7줄 이내로" value={instr} onChange={(e) => setInstr(e.target.value)} />
          <button disabled={!!busy || !c.rated} onClick={() => act('consolidate', () => api('/api/learn', { action: 'consolidate', step, force: !!pending, instruction: instr }), (r) => `재정리안 생성${r.warnings?.length ? ` · 확인할 것 ${r.warnings.length}건` : ''}`)}
            title="지금까지의 학습 전체로 SOP 를 다시 정리 (전후 비교 후 반영)">
            {busy === 'consolidate' ? '정리 중… (30~90초)' : '🧹 SOP 재정리 (누적 학습)'}
          </button>
        </div>
      </div>

      {pending && (
        <div className="card" style={{ borderColor: '#c4b5fd' }}>
          <h2>검토 대기 #{pending.id} · {pending.kind === 'rewrite' ? '전체 재정리안' : '보완 제안'} <span className="mute">{new Date(pending.created_at).toLocaleString('ko-KR')} · {pending.provider}</span></h2>
          <p>{pending.summary}</p>
          <UsagePanel query={`ref_table=sop_proposals&ref_id=${pending.id}`} title="이 제안 만들 때 API 사용" compact />
          {pending.stats && <p className="mute">제안 당시: 평가 {pending.stats.rated}건 · 평균 ★{pending.stats.avg ?? '-'}{pending.stats.applied != null ? ` · 반영된 학습 ${pending.stats.applied}회` : ''}</p>}
          {baseChanged && <p className="warnline">이 제안을 만든 뒤 SOP 가 바뀌었습니다. {pending.kind === 'rewrite' ? '다시 정리하거나 아래에서 강제 반영을 선택하세요.' : '충돌 표시된 변경은 건너뜁니다.'}</p>}

          {pending.kind === 'patch' && (
            <>
              {pending.patterns?.length > 0 && (
                <details style={{ marginBottom: 10 }}><summary className="mute">점수 높은 예에서 찾은 공통점 {pending.patterns.length}개</summary>
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
            </>
          )}

          {pending.kind === 'rewrite' && (
            <>
              <ul style={{ marginTop: 0 }}>{(pending.changelog || []).map((x: any, i: number) => <li key={i}><span className={`op ${x.type === 'remove' ? 'remove' : x.type === 'add' ? 'add' : 'modify'}`}>{x.type === 'check' ? '검사' : x.type}</span>{x.detail}</li>)}</ul>
              <b>전후 비교</b> <span className="mute">(빨강 = 빠지는 줄 · 초록 = 들어오는 줄)</span>
              <div className="diff" style={{ margin: '6px 0 10px' }}>{(diff || []).filter((x, i, a) => x.t !== 'same' || a[i - 1]?.t !== 'same' || a[i + 1]?.t !== 'same' || /^#/.test(x.line)).map((x, i) => <div key={i} className={x.t}>{x.t === 'add' ? '+ ' : x.t === 'del' ? '− ' : '  '}{x.line || ' '}</div>)}</div>
              <details><summary><b>재정리안 직접 다듬기</b></summary>
                <textarea style={{ minHeight: 360, fontSize: 13, lineHeight: 1.6, marginTop: 8 }} value={final ?? ''} onChange={(e) => setFinal(e.target.value)} />
                <button onClick={() => setFinal(pending.proposed_content)}>AI 재정리안으로 되돌리기</button>
              </details>
              {baseChanged && <label className="mute" style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> 그 사이 바뀐 SOP 를 덮어쓰고 반영 (강제)</label>}
            </>
          )}

          <div className="row" style={{ marginTop: 10 }}>
            <input style={{ flex: 1 }} placeholder="메모 (선택) — 반영/거절 이유 (거절 이유는 다음 제안 때 AI 가 읽습니다)" value={note} onChange={(e) => setNote(e.target.value)} />
            {pending.kind === 'patch' ? (
              <button className="ok" disabled={!!busy || (!selected.length && final == null)} onClick={() => act('apply', () => api('/api/learn', { action: 'apply', id: pending.id, selected, edits, content: final ?? undefined, note }), (r) => `반영 ${r.applied.length}건${r.conflicts.length ? ` · 충돌로 건너뜀 ${r.conflicts.length}건` : ''}`)}>
                {busy === 'apply' ? '반영 중…' : `선택한 ${selected.length}건 반영`}
              </button>
            ) : (
              <button className="ok" disabled={!!busy || (baseChanged && !force)} onClick={() => act('apply', () => api('/api/learn', { action: 'apply', id: pending.id, content: final ?? undefined, note, force }), () => 'SOP 재정리를 반영했습니다')}>
                {busy === 'apply' ? '반영 중…' : '재정리안 반영'}
              </button>
            )}
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
                <td className="mute">#{h.id} {d(h.created_at)}</td>
                <td>{h.kind === 'rewrite' ? '재정리' : '보완'}</td>
                <td><span className={`tag ${h.status === 'applied' ? 'approved' : 'pending'}`}>{h.status === 'applied' ? `반영${h.kind === 'patch' ? ` ${h.applied_changes?.length ?? ''}건` : ''}${h.decided_by === 'auto' ? ' (자동)' : ''}` : h.status === 'superseded' ? '대체됨' : '거절'}</span></td>
                <td>{String(h.summary || '').slice(0, 110)}{h.decided_note ? <span className="mute"> — {h.decided_note}</span> : ''}</td>
                <td>{h.status === 'applied' && <button disabled={!!busy} onClick={() => confirm('이 반영을 되돌릴까요? (반영 전 SOP 로 복원)') && act('revert', () => api('/api/learn', { action: 'revert', id: h.id }), () => '되돌렸습니다')}>되돌리기</button>}</td>
              </tr>
            ))}
          </tbody></table>
        </details>
      )}

      <details className="card">
        <summary><b>평가·학습 재료 ({ex.length})</b> <span className="mute">— 잘못 매긴 것은 지우면 학습·데이터셋에서 빠집니다</span></summary>
        <table><tbody>
          {ex.map((x) => (
            <tr key={x.id}>
              <td className="mute">#{x.id}</td>
              <td>{x.kind === 'edit' ? '✍️ 수정 예' : <b>★{x.score}</b>}</td>
              <td>{x.content_id ? <Link href={`/admin/contents/${x.content_id}`}>{x.topic || '(주제 없음)'}</Link> : x.topic}</td>
              <td className="mute">{(x.tags || []).join(', ')}</td>
              <td className="mute">{x.note}</td>
              <td className="mute">{x.provider || ''}</td>
              <td className="mute">{x.used_in ? `제안 #${x.used_in}` : '미반영'}</td>
              <td><button onClick={() => confirm('이 평가를 지울까요?') && act('del', () => api(`/api/exemplars?id=${x.id}`, undefined, 'DELETE'))}>삭제</button></td>
            </tr>
          ))}
        </tbody></table>
      </details>
    </>
  );
}
