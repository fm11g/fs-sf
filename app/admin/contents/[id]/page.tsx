'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { sbBrowser } from '@/lib/supabase/client';
import { FREEDOM_KO, GATE_KO, STATE_KO, STEP_DEFS, stepDef, type StepKey } from '@/lib/steps';
import type { Content, StepRow } from '@/lib/types';
import { CopyEditor, DesignEditor, JsonEditor, LandingEditor, Readable, ScriptEditor } from './editors';
import RatingBox from './RatingBox';

const fmtMs = (ms: number) => (ms >= 60000 ? `${Math.round(ms / 6000) / 10}분` : `${Math.round(ms / 1000)}초`);

export default function Workbench({ params }: { params: { id: string } }) {
  const [c, setC] = useState<Content | null>(null);
  const [variant, setVariant] = useState<any>(null);
  const [steps, setSteps] = useState<Record<string, StepRow>>({});
  const [jobs, setJobs] = useState<any[]>([]);
  const [sops, setSops] = useState<any[]>([]);
  const [bgms, setBgms] = useState<any[]>([]);
  const [sel, setSel] = useState<StepKey | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [edit, setEdit] = useState(false);
  const [exemplars, setExemplars] = useState<any[]>([]);
  const [learnMsg, setLearnMsg] = useState<{ text: string; step?: string } | null>(null);

  const load = useCallback(async () => {
    const d = await api(`/api/contents/${params.id}`);
    setC(d.content); setVariant(d.variant); setSteps(d.steps); setJobs(d.jobs || []); setExemplars(d.exemplars || []);
    setSel((cur) => cur || (STEP_DEFS.find((x) => d.steps[x.key]?.state !== 'approved')?.key ?? 'publish'));
  }, [params.id]);

  useEffect(() => {
    load();
    api('/api/sop').then((d) => setSops(d.sops));
    sbBrowser().from('bgm_tracks').select('*').eq('active', true).then(({ data }) => setBgms(data || []));
  }, [load]);
  useEffect(() => {
    if (!Object.values(steps).some((s) => s.state === 'running')) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [steps, load]);

  if (!c || !sel) return <p>불러오는 중…</p>;
  const def = stepDef(sel);
  const row = steps[sel];
  const sop = sops.find((s) => s.step === sel);
  const blocked = def.deps.filter((d) => steps[d]?.state !== 'approved');
  const output: any = sel === 'landing' ? variant?.values : def.field ? (c as any)[def.field] : null;

  const act = async (name: string, fn: () => Promise<any>) => {
    setBusy(name);
    try { await fn(); } catch (e: any) { alert(e.message); }
    setBusy(null); setEdit(false);
    await load();
  };
  const run = (feedback?: string) => act('run', async () => { await api(`/api/pipeline/${sel}`, { contentId: c.id, feedback }); setNote(''); });
  /** 학습 제안 생성은 화면을 막지 않고 뒤에서 */
  const triggerLearn = (step: string) => {
    setLearnMsg({ text: 'SOP 학습 제안을 만드는 중… (좋은 예가 쌓였습니다)', step });
    api('/api/learn', { action: 'propose', step })
      .then((r) => setLearnMsg({ text: r.auto_applied?.length ? `SOP 자동 보완 ${r.auto_applied.length}건 반영됨` : `SOP 학습 제안 ${r.proposal?.changes?.length ?? 0}건이 생겼습니다 — 검토 후 반영하세요`, step }))
      .catch((e) => setLearnMsg({ text: `학습 제안 실패: ${e.message}`, step }));
  };
  const afterDecide = (r: any) => {
    if (r?.learned_edit) setLearnMsg({ text: '직접 고친 내용이 "수정 예"로 저장되어 SOP 학습에 쓰입니다', step: sel });
    if (r?.should_propose) triggerLearn(sel);
  };
  const decideStep = (decision: 'approve' | 'reject') => act(decision, async () => {
    if (decision === 'reject' && !note.trim()) throw new Error('반려 사유(=재작업 지시)를 적어 주세요');
    afterDecide(await api('/api/steps/decide', { contentId: c.id, step: sel, decision, note })); setNote('');
  });
  const aiDecide = (apply: boolean) => act('ai', () => api('/api/steps/ai-decide', { contentId: c.id, step: sel, apply }));
  const save = (patch: any) => act('save', () => api(`/api/contents/${c.id}`, patch, 'PATCH'));

  /** 승인 가능한 곳까지 자동 진행: 검수 대기(사람 결정)에서 멈춤 */
  const auto = () => act('auto', async () => {
    for (let i = 0; i < 12; i++) {
      const r = await api('/api/pipeline/advance', { contentId: c.id });
      await load();
      if (r.step) setSel(r.step);
      if (r.action === 'continue') continue;
      if (r.action === 'worker' && r.step === 'render') { await api('/api/render', { contentId: c.id }); }
      break;
    }
  });
  const approveAndGo = () => act('approve', async () => {
    await api('/api/steps/decide', { contentId: c.id, step: sel, decision: 'approve', note }); setNote('');
  }).then(auto);

  const canDecide = ['review', 'stale', 'rejected'].includes(row.state) && (output != null || def.kind === 'worker');

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Do+Hyeon&family=Gothic+A1:wght@400;700;900&family=Noto+Sans+KR:wght@400;700;900&display=swap" />
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>{c.topic || '새 숏폼'} <span className="mute">{c.slug}</span></h1>
        <div className="row">
          <button className="acc" disabled={!!busy} onClick={auto}>{busy === 'auto' ? '진행 중…' : '▶ 가능한 곳까지 자동 진행'}</button>
          <button onClick={() => confirm('이 콘텐츠를 삭제할까요?') && api(`/api/contents/${c.id}`, undefined, 'DELETE').then(() => (location.href = '/admin'))}>삭제</button>
        </div>
      </div>
      {c.error && <div className="card bad">{c.error}</div>}

      <div className="bench">
        {/* 공정 레일 */}
        <div className="rail">
          {STEP_DEFS.map((d) => {
            const st = steps[d.key]?.state || 'pending';
            const g = sops.find((s) => s.step === d.key)?.gate;
            return (
              <button key={d.key} className={`rail-item ${sel === d.key ? 'on' : ''}`} onClick={() => { setSel(d.key); setEdit(false); }}>
                <span className={`dot ${st}`} />
                <span className="rail-label"><b>{d.no}</b> {d.label}<small>{d.out}</small></span>
                <span className={`tag ${st}`}>{STATE_KO[st]}</span>
                <span className="gate" title={GATE_KO[g] || ''}>{g === 'ai' ? '🤖' : g === 'auto' ? '⏩' : '👤'}</span>
              </button>
            );
          })}
        </div>

        {/* 선택한 단계 */}
        <div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{def.no}. {def.label} <span className={`tag ${row.state}`}>{STATE_KO[row.state]}</span></h2>
              <span className="mute">
                결정: {GATE_KO[sop?.gate] || '-'} · 자유도 {FREEDOM_KO[sop?.freedom ?? 2]} · 시도 {row.attempts}회
                {row.provider && ` · ${row.provider}${row.model ? '/' + row.model : ''}`}{row.work_ms > 0 && ` · 작업 ${fmtMs(Number(row.work_ms))}`}{row.wait_ms > 0 && ` · 대기 ${fmtMs(Number(row.wait_ms))}`} ·{' '}
                <Link href={`/admin/sop?step=${sel}`}>SOP 수정</Link>
              </span>
            </div>
            {blocked.length > 0 && <p className="warnline">상위 단계 승인이 먼저 필요합니다: {blocked.map((b) => stepDef(b).label).join(', ')}</p>}
            {row.state === 'stale' && <p className="warnline">상위 산출물이 바뀌었습니다. 다시 실행하거나, 그대로 써도 되면 승인하세요.</p>}
            {learnMsg && learnMsg.step === sel && <p className="learnline">🧠 {learnMsg.text} · <Link href={`/admin/sop?step=${sel}`}>SOP 학습 보기</Link></p>}
            {exemplars.filter((x) => x.step === sel).map((x) => (
              <span key={x.id} className={`tag ${x.kind === 'bad' ? 'rejected' : 'approved'}`} style={{ marginRight: 6 }} title={x.note || ''}>
                {x.kind === 'edit' ? '✍️ 수정 예' : `★${x.score ?? '-'}`}{x.tags?.length ? ` ${x.tags.slice(0, 3).join('·')}` : ''}{x.used_in ? ` · SOP 반영 #${x.used_in}` : ''}
              </span>
            ))}
            {row.decided_by && <p className="mute">결정: {row.decided_by === 'human' ? '사람' : row.decided_by === 'ai' ? 'AI' : '자동'} · {row.decision_note || ''}</p>}

            {def.kind === 'ai' && (
              <>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="pri" disabled={!!busy || blocked.length > 0 || row.state === 'running'} onClick={() => run()}>
                    {busy === 'run' || row.state === 'running' ? '작업 중…' : output ? '처음부터 다시 생성' : '실행'}
                  </button>
                  {canDecide && <>
                    <button className="ok" disabled={!!busy} onClick={() => decideStep('approve')}>승인</button>
                    <button className="ok" disabled={!!busy} onClick={approveAndGo}>승인하고 계속 진행 ▶</button>
                    <button disabled={!!busy} onClick={() => aiDecide(false)}>{busy === 'ai' ? 'AI 검수 중…' : '🤖 AI에게 판단 맡기기'}</button>
                    <button disabled={!!busy} onClick={() => aiDecide(true)}>🤖 AI 판단 + 미달이면 자동 수정</button>
                  </>}
                </div>
                {output != null && (
                  <div className="row" style={{ marginTop: 8, alignItems: 'stretch' }}>
                    <textarea style={{ flex: 1, minHeight: 54, fontFamily: 'inherit', fontSize: 14 }} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder={'수정 지시 / 반려 사유 — 예) "2번 훅으로 바꿔줘", "숫자를 첫 문장으로", "더 단호한 어조"'} />
                    <div style={{ display: 'grid', gap: 6 }}>
                      <button disabled={!!busy || !note.trim()} onClick={() => run(note)}>이 지시대로 재생성</button>
                      <button disabled={!!busy || !note.trim() || !canDecide} onClick={() => decideStep('reject')}>반려(사유 저장)</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {sel === 'render' && (
              <div className="row" style={{ marginTop: 10 }}>
                <label>BGM&nbsp;
                  <select value={c.bgm_id || ''} onChange={(e) => save({ bgm_id: e.target.value || null })}>
                    <option value="">자동 (기획 무드: {c.plan?.mood || '-'})</option>
                    {bgms.map((b) => <option key={b.id} value={b.id}>{b.title} · {b.mood}</option>)}
                  </select>
                </label>
                <button className="pri" disabled={!!busy || blocked.length > 0 || row.state === 'running'} onClick={() => act('render', () => api('/api/render', { contentId: c.id }))}>
                  {row.state === 'running' ? '렌더 중… (3~6분)' : c.video_url ? '다시 렌더' : '렌더 시작'}
                </button>
                {canDecide && c.video_url && <>
                  <button className="ok" disabled={!!busy} onClick={() => decideStep('approve')}>영상 승인</button>
                  <button disabled={!!busy || !note.trim()} onClick={() => decideStep('reject')}>반려</button>
                  <input style={{ flex: 1 }} placeholder="반려 사유 (어느 단계를 고칠지)" value={note} onChange={(e) => setNote(e.target.value)} />
                </>}
              </div>
            )}

            {sel === 'publish' && (
              <div className="row" style={{ marginTop: 10 }}>
                {(['youtube+instagram', 'youtube', 'instagram'] as const).map((t) => (
                  <button key={t} className={t.includes('+') ? 'acc' : ''} disabled={!!busy || blocked.length > 0 || row.state === 'running'}
                    onClick={() => confirm(`${t} 에 게시합니다. 진행할까요?`) && act('publish', () => api('/api/publish', { contentId: c.id, targets: t.split('+') }))}>
                    {row.state === 'running' ? '업로드 중…' : `${t.replace('+', ' + ')} 게시`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {def.kind === 'ai' && output != null && (
            <RatingBox contentId={c.id} step={sel} row={row} ratings={exemplars.filter((x) => x.step === sel)} canApprove={canDecide}
              onApprove={async (n) => afterDecide(await api('/api/steps/decide', { contentId: c.id, step: sel, decision: 'approve', note: n }))}
              onSaved={(r) => { setLearnMsg({ text: `${r.updated ? '평가 수정' : '평가 저장'} ★${r.exemplar.score} — 이 단계 학습 재료 ${r.counts.unused_signal}/${r.learn_min} · 평균 ★${r.counts.avg ?? '-'}`, step: sel }); if (r.should_propose) triggerLearn(sel); load(); }} />
          )}

          {/* 규칙 검사 · AI 의견 · AI 검수 */}
          {(row.checks?.length > 0 || row.ai_notes || row.ai_review) && (
            <div className="grid2">
              <div className="card">
                <h2>규칙 검사</h2>
                {(row.checks || []).map((k, i) => <div key={i} className={`check ${k.level}`}>{k.level === 'error' ? '✕' : k.level === 'warn' ? '!' : '✓'} {k.msg}</div>)}
                {row.ai_review && (
                  <>
                    <h2 style={{ marginTop: 14 }}>AI 검수 <span className={`tag ${row.ai_review.verdict === 'pass' ? 'approved' : 'rejected'}`}>{row.ai_review.verdict === 'pass' ? '통과' : '수정 필요'} · {row.ai_review.score}점</span></h2>
                    <p>{row.ai_review.summary}</p>
                    {(row.ai_review.checklist || []).map((k: any, i: number) => <div key={i} className={`check ${k.ok ? 'ok' : 'error'}`}>{k.ok ? '✓' : '✕'} {k.item}{k.note && <span className="mute"> — {k.note}</span>}</div>)}
                    {row.ai_review.issues?.length > 0 && <><b>문제</b><ul>{row.ai_review.issues.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
                    {row.ai_review.feedback && <button onClick={() => setNote(row.ai_review.feedback)}>AI 피드백을 수정 지시란에 넣기</button>}
                  </>
                )}
              </div>
              <div className="card">
                <h2>AI 의견 {row.ai_notes?.confidence != null && <span className="mute">확신도 {Math.round(row.ai_notes.confidence * 100)}%</span>}</h2>
                {row.ai_notes ? (
                  <>
                    <p>{row.ai_notes.opinion}</p>
                    {(['suggestions', 'alternatives', 'questions'] as const).map((k) => row.ai_notes[k]?.length > 0 && (
                      <div key={k}><b>{{ suggestions: '제안', alternatives: '채택하지 않은 대안', questions: '운영자에게 질문' }[k]}</b>
                        <ul>{row.ai_notes[k].map((x: any, i: number) => (
                          <li key={i}>{typeof x === 'string' ? x : JSON.stringify(x)} <a href="#" onClick={(e) => { e.preventDefault(); setNote(typeof x === 'string' ? x : JSON.stringify(x)); }}>↳ 지시로 쓰기</a></li>
                        ))}</ul></div>
                    ))}
                  </>
                ) : <p className="mute">아직 없음</p>}
              </div>
            </div>
          )}

          {/* 산출물 */}
          {def.kind === 'ai' && (
            <div className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>중간 산출물</h2>
                {output != null && sel !== 'design' && <button onClick={() => setEdit(!edit)}>{edit ? '보기' : '직접 수정'}</button>}
              </div>
              {output == null && <p className="mute">아직 산출물이 없습니다.</p>}
              {output != null && !edit && sel === 'script' && (
                <table><tbody>{(c.script?.scenes || []).map((s) => <tr key={s.id}><td className="mute">{s.id}</td><td>{s.narration}</td><td className="mute">{s.captions.join(' / ')}</td></tr>)}</tbody></table>
              )}
              {output != null && !edit && sel === 'landing' && <p><a href={`/l/${c.slug}`} target="_blank">랜딩 미리보기 ↗</a></p>}
              {output != null && !edit && sel !== 'script' && sel !== 'design' && <Readable value={sel === 'post' ? { ...output, body_markdown: undefined } : output} />}
              {output != null && !edit && sel === 'post' && <pre className="md">{output.body_markdown}</pre>}
            </div>
          )}
          {edit && sel === 'script' && <ScriptEditor c={c} onSave={(v) => save({ script: v })} />}
          {edit && sel === 'copy' && <CopyEditor c={c} onSave={(v) => save({ copy: v })} />}
          {edit && sel === 'landing' && <LandingEditor slug={c.slug} variant={variant} slots={variant?.landing_templates?.slots || []} onSave={(v) => save({ landing_values: v })} />}
          {edit && ['research', 'plan', 'offer', 'post'].includes(sel) && <JsonEditor value={output} onSave={(v) => save({ [def.field!]: v })} />}
          {!edit && sel === 'design' && c.design && <DesignEditor c={c} onSave={(v) => save({ design: v })} />}

          {(sel === 'render' || sel === 'publish') && (
            <div className="card">
              {c.video_url ? (
                <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
                  <video src={c.video_url} controls playsInline />
                  <div style={{ flex: 1 }}>
                    {c.audio?.totalSec && <p>길이 <b>{Number(c.audio.totalSec).toFixed(1)}초</b></p>}
                    {(row.checks || []).map((k, i) => <div key={i} className={`check ${k.level}`}>{k.msg}</div>)}
                    {c.youtube_id && <p>YouTube: <a href={`https://youtube.com/shorts/${c.youtube_id}`} target="_blank">{c.youtube_id}</a> <span className="mute">← 스튜디오에서 댓글 고정</span></p>}
                    {c.instagram_id && <p>Instagram 미디어 ID: {c.instagram_id}</p>}
                    {c.published_at && <p>정보글: <a href={`/policy/${c.slug}`} target="_blank">/policy/{c.slug}</a> · 랜딩: <a href={`/l/${c.slug}`} target="_blank">/l/{c.slug}</a></p>}
                  </div>
                </div>
              ) : <p className="mute">아직 렌더된 영상이 없습니다.</p>}
            </div>
          )}

          <details className="card">
            <summary><b>실행 로그</b></summary>
            <table><tbody>
              {jobs.map((j) => (
                <tr key={j.id}><td className="mute">{new Date(j.created_at).toLocaleString('ko-KR')}</td><td>{j.step}</td><td>{j.status}</td><td className="mute">{j.message}</td></tr>
              ))}
            </tbody></table>
          </details>
        </div>
      </div>
    </>
  );
}
