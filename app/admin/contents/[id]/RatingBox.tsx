'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { TIER_KO, tagsFor, tierOf } from '@/lib/tags';

/** 결과물 평가: 1~5점 + 좋은 점/아쉬운 점 태그 + 메모 → 학습 재료 (GitHub·시트로도 저장) */
export default function RatingBox({ contentId, step, row, ratings, onSaved, onApprove, canApprove }: {
  contentId: string; step: string; row: any; ratings: any[]; canApprove: boolean;
  onSaved: (r: any) => void; onApprove: (note: string) => Promise<any>;
}) {
  const last = ratings.find((x) => x.kind !== 'edit' && x.score != null);
  const [score, setScore] = useState<number>(last?.score || 0);
  const [tags, setTags] = useState<string[]>(last?.tags || []);
  const [free, setFree] = useState('');
  const [note, setNote] = useState(last?.note || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setScore(last?.score || 0); setTags(last?.tags || []); setNote(last?.note || ''); }, [step, last?.id]); // eslint-disable-line
  const { pos, neg } = tagsFor(step);
  const toggle = (t: string) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);

  const save = async (approve = false) => {
    if (!score) return alert('점수를 골라 주세요 (1~5)');
    if (score <= 2 && !note.trim() && !tags.some((t) => neg.includes(t))) return alert('낮은 점수는 아쉬운 점 태그나 메모가 필요합니다 (SOP 학습 근거)');
    setBusy(true);
    try {
      const all = [...tags, ...free.split(',').map((x) => x.trim()).filter(Boolean)];
      const r = await api('/api/exemplars', { contentId, step, score, tags: all, note });
      setFree('');
      if (approve) await onApprove(note);
      onSaved(r);
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  return (
    <div className="card rating">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>결과물 평가 <span className="mute">— 점수와 태그로 학습·최적화에 쓰입니다</span></h2>
        <span className="mute">
          {row?.pred_score != null && <>AI 예측 <b>★{Number(row.pred_score).toFixed(1)}</b> · </>}
          {row?.candidates > 1 && <>후보 {row.candidates}개 중 선택 · </>}
          {row?.refs?.length > 0 && <>고득점 예시 {row.refs.length}개 참고 · </>}
          {last && <>내 평가 {TIER_KO[tierOf(last.score)]}{last.used_in ? ` · SOP 반영 #${last.used_in}` : ''}</>}
        </span>
      </div>
      <div className="row" style={{ margin: '10px 0 6px' }}>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={n <= score ? 'on' : ''} onClick={() => setScore(n)} title={`${n}점`}>★</button>
          ))}
        </div>
        <span className="mute">{score ? `${score}점 · ${TIER_KO[tierOf(score)]}` : '점수 선택'}</span>
      </div>
      <div className="chips">
        {pos.map((t) => <button key={t} className={`chip pos ${tags.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)}>+ {t}</button>)}
      </div>
      <div className="chips">
        {neg.map((t) => <button key={t} className={`chip neg ${tags.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)}>− {t}</button>)}
      </div>
      <div className="row" style={{ marginTop: 6, alignItems: 'stretch' }}>
        <input style={{ flex: 1 }} placeholder="왜 이 점수인가요? (구체적으로 — 예: 마감일을 첫 문장에 둬서 훅이 셈)" value={note} onChange={(e) => setNote(e.target.value)} />
        <input style={{ width: 180 }} placeholder="직접 태그 (쉼표)" value={free} onChange={(e) => setFree(e.target.value)} />
        <button className="pri" disabled={busy} onClick={() => save(false)}>{last ? '평가 수정' : '평가 저장'}</button>
        {canApprove && <button className="ok" disabled={busy} onClick={() => save(true)}>평가 + 승인</button>}
      </div>
      {row?.ai_notes?.judge?.scores?.length > 1 && (
        <p className="mute" style={{ margin: '8px 0 0' }}>후보 예측 점수: {row.ai_notes.judge.scores.map((x: any) => `#${x.i} ★${x.score}${x.i === row.ai_notes.judge.best ? '(선택)' : ''}`).join(' · ')}</p>
      )}
    </div>
  );
}
