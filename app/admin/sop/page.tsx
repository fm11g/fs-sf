'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { FREEDOM_KO, GATE_KO, STEP_DEFS, type StepKey } from '@/lib/steps';
import LearnPanel from './LearnPanel';

export default function SopPage() {
  const [sops, setSops] = useState<any[]>([]);
  const [sel, setSel] = useState<StepKey>('research');
  const [draft, setDraft] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [lc, setLc] = useState<Record<string, any>>({});

  const load = async (step = sel) => {
    const d = await api('/api/sop');
    setSops(d.sops);
    setDraft({ ...d.sops.find((s: any) => s.step === step) });
    setVersions((await api('/api/sop', { action: 'versions', step })).versions);
    api('/api/learn').then((r) => setLc(r.counts)).catch(() => {});
  };
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('step') as StepKey | null;
    const step = q && STEP_DEFS.some((d) => d.key === q) ? q : 'research';
    setSel(step); load(step);
  }, []); // eslint-disable-line
  const pick = (k: StepKey) => { setSel(k); setDraft({ ...sops.find((s) => s.step === k) }); api('/api/sop', { action: 'versions', step: k }).then((d) => setVersions(d.versions)); };

  if (!draft) return <p>불러오는 중…</p>;
  const def = STEP_DEFS.find((d) => d.key === sel)!;
  const save = async () => {
    setBusy(true);
    try { await api('/api/sop', { action: 'save', step: sel, content: draft.content, freedom: draft.freedom, gate: draft.gate, provider: draft.provider || 'auto', note }); setNote(''); await load(sel); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const commit = async () => {
    if (!confirm('저장된 SOP를 GitHub 저장소 sop/ 폴더에 커밋합니다. (커밋 시 Vercel이 재배포될 수 있습니다)')) return;
    try { const r = await api('/api/sop', { action: 'commit', step: sel }); alert('커밋 완료\n' + r.url); } catch (e: any) { alert(e.message); }
  };
  const reset = async () => { const d = await api('/api/sop', { action: 'default', step: sel }); setDraft({ ...draft, content: d.content }); };

  return (
    <>
      <h1>SOP · AI 제어</h1>
      <p className="mute" style={{ marginTop: -12 }}>단계마다 AI가 무엇에 집중할지(md), 얼마나 자유롭게 일할지(자유도), 누가 결정할지(결정 방식)를 정합니다. 직접 고쳐도 되고, 아래 🧠 학습 제안으로 좋은 결과물의 패턴을 반영할 수도 있습니다. 모든 변경은 이력에 남습니다.</p>
      <div className="soplay">
        <div style={{ display: 'grid', gap: 4 }}>
          {STEP_DEFS.map((d) => {
            const s = sops.find((x) => x.step === d.key);
            return (
              <button key={d.key} className={`rail-item ${sel === d.key ? 'on' : ''}`} style={{ gridTemplateColumns: '1fr auto auto' }} onClick={() => pick(d.key)}>
                <span><b>{d.no}</b> {d.label}</span>
                <span className="mute">자유 {s?.freedom}{lc[d.key]?.pending_proposals ? <b style={{ color: '#6b21a8' }}> · 제안</b> : lc[d.key]?.counts?.unused_signal ? ` · 👍${lc[d.key].counts.unused_signal}` : ''}</span>
                <span title={GATE_KO[s?.gate]}>{s?.gate === 'ai' ? '🤖' : s?.gate === 'auto' ? '⏩' : '👤'}</span>
              </button>
            );
          })}
        </div>
        <div>
          <div className="card">
            <h2>{def.no}. {def.label} <span className="mute">산출물: {def.out} · 읽는 상위 단계: {def.deps.map((x) => STEP_DEFS.find((d) => d.key === x)!.label).join(', ') || '없음'}</span></h2>
            <div className="row" style={{ marginBottom: 10 }}>
              <span style={{ width: 80 }}>결정 방식</span>
              <div className="seg">
                {(['manual', 'ai', 'auto'] as const).map((g) => (
                  <button key={g} className={draft.gate === g ? 'on' : ''} disabled={def.kind === 'worker' && g === 'ai' && sel === 'publish'} onClick={() => setDraft({ ...draft, gate: g })}>{GATE_KO[g]}</button>
                ))}
              </div>
              <span className="mute">
                {draft.gate === 'manual' && '산출물이 검수 대기로 멈춥니다. 작업대에서 승인/반려/AI에게 맡기기.'}
                {draft.gate === 'ai' && (def.kind === 'worker' ? '길이 등 규칙 검사 통과 시 자동 승인 (영상 내용은 AI가 보지 못함).' : 'AI 검수자가 아래 체크리스트로 채점 → 통과 시 승인, 미달 시 1회 자동 수정 후에도 미달이면 사람에게.')}
                {draft.gate === 'auto' && '규칙 검사 오류만 없으면 바로 통과.'}
              </span>
            </div>
            {def.kind === 'ai' && (
              <div className="row" style={{ marginBottom: 10 }}>
                <span style={{ width: 80 }}>자유도</span>
                <div className="seg">{[0, 1, 2, 3].map((f) => <button key={f} className={draft.freedom === f ? 'on' : ''} onClick={() => setDraft({ ...draft, freedom: f })}>{f}</button>)}</div>
                <span className="mute">{FREEDOM_KO[draft.freedom]} — 사실 정확성·금지 표현·글자수는 자유도와 무관하게 고정</span>
              </div>
            )}
            {def.kind === 'ai' && (
              <div className="row" style={{ marginBottom: 10 }}>
                <span style={{ width: 80 }}>AI 제공자</span>
                <div className="seg">{([['auto', '자동(전환 순서)'], ['claude', 'Claude'], ['openai', 'OpenAI'], ['oss', '오픈소스']] as const).map(([k, l]) => <button key={k} className={(draft.provider || 'auto') === k ? 'on' : ''} onClick={() => setDraft({ ...draft, provider: k })}>{l}</button>)}</div>
                <span className="mute">지정한 제공자가 실패하면 설정의 전환 순서대로 넘어갑니다</span>
              </div>
            )}
            <textarea style={{ minHeight: 460, fontSize: 13, lineHeight: 1.6 }} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
            <div className="row" style={{ marginTop: 8 }}>
              <input style={{ flex: 1 }} placeholder="변경 메모 (예: 숫자 훅 우선으로 변경 — 11/20 성과 반영)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="pri" disabled={busy} onClick={save}>저장 (즉시 반영)</button>
              <button onClick={commit}>GitHub에 커밋</button>
              <button onClick={reset}>저장소 기본값 불러오기</button>
            </div>
            {draft.isDefault && <p className="mute">현재 저장소의 기본 SOP를 사용 중입니다. 저장하면 이 값이 우선합니다.</p>}
          </div>
          {def.kind === 'ai' && <LearnPanel step={sel} current={draft.content} mode={lc[sel]?.mode} onChanged={() => load(sel)} />}
          <details className="card">
            <summary><b>변경 이력 ({versions.length})</b></summary>
            <table><tbody>
              {versions.map((v) => (
                <tr key={v.id}><td className="mute">{new Date(v.created_at).toLocaleString('ko-KR')}</td><td>자유 {v.freedom} · {GATE_KO[v.gate]}</td><td>{v.note}</td>
                  <td><button onClick={() => setDraft({ ...draft, content: v.content, freedom: v.freedom, gate: v.gate })}>이 버전 불러오기</button></td></tr>
              ))}
            </tbody></table>
          </details>
        </div>
      </div>
    </>
  );
}
