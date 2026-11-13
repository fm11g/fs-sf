'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { sbBrowser } from '@/lib/supabase/client';
import { can } from '@/lib/perms';
import { useMe } from '../MeContext';

const STEP_KO: Record<string, string> = { research: '조사', plan: '기획', script: '대사', offer: '이벤트', design: '디자인', copy: '카피' };
const ST: Record<string, [string, string]> = { queued: ['대기', 'pending'], analyzing: ['분석 중', 'running'], ready: ['분석 완료', 'approved'], failed: ['실패', 'failed'] };

export default function References() {
  const me = useMe();
  const canWork = can(me, 'references', 'work');
  const [list, setList] = useState<any[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [f, setF] = useState({ url: '', note: '', tags: '', weight: 3, learn_steps: ['plan', 'script', 'design', 'copy'] });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  const [prog, setProg] = useState('');

  const load = useCallback(() => api('/api/references').then((d) => { setList(d.refs); setSteps(d.steps); }), []);
  useEffect(() => { load(); const id = new URLSearchParams(location.search).get('id'); if (id) setSel(Number(id)); }, [load]);
  useEffect(() => {
    if (!list.some((r) => r.status === 'queued' || r.status === 'analyzing')) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [list, load]);

  const add = async () => {
    setBusy('add');
    try {
      const base = { note: f.note, tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean), weight: f.weight, learn_steps: f.learn_steps };
      let r: any;
      if (file) {
        if (file.size > 200 * 1024 * 1024) throw new Error('200MB 이하 영상만 올릴 수 있습니다 (Supabase 파일 크기 제한도 확인)');
        setProg('업로드 준비…');
        const u = await api('/api/references', { action: 'upload_url', filename: file.name });
        setProg(`업로드 중… (${Math.round(file.size / 1048576)}MB)`);
        const { error } = await sbBrowser().storage.from('media').uploadToSignedUrl(u.path, u.token, file, { contentType: file.type || 'video/mp4' });
        if (error) throw new Error(`업로드 실패: ${error.message}`);
        r = await api('/api/references', { action: 'add', storage_path: u.path, title: file.name.replace(/\.[^.]+$/, ''), ...base });
      } else {
        if (!f.url.trim()) throw new Error('유튜브 링크를 넣거나 영상 파일을 고르세요');
        r = await api('/api/references', { action: 'add', url: f.url, ...base });
      }
      const errs = (r.many || []).filter((x: any) => x.error).map((x: any) => `${x.url}: ${x.error}`);
      if (r.warn || errs.length) alert([r.warn, ...errs].filter(Boolean).join('\n'));
      setF({ ...f, url: '', note: '', tags: '' }); setFile(null); setProg('');
      load();
    } catch (e: any) { alert(e.message); setProg(''); }
    setBusy('');
  };
  const upd = async (id: number, patch: any) => { await api('/api/references', { action: 'update', id, patch }).catch((e) => alert(e.message)); load(); };

  if (sel) return <Detail id={sel} canWork={canWork} canSop={can(me, 'sop', 'work')} canMake={canWork && can(me, 'board', 'work')} onBack={() => { setSel(null); history.replaceState(null, '', '/admin/references'); load(); }} />;

  return (
    <>
      <h1>참고 영상</h1>
      <p className="mute">잘 만든 숏폼을 찾으면 링크를 붙이거나 영상 파일을 올리세요. 워커가 컷·자막·대사·화면을 뽑고 AI가 <b>훅·구성·속도·자막·색·모션</b>을 분석해 재현 규칙으로 바꿉니다.
        [학습 사용]을 켠 영상은 기획·대사·디자인·카피를 만들 때 자동으로 참고되고, <b>이 영상처럼 만들기</b>를 누르면 그 한 편을 강하게 따라 새 숏폼을 만듭니다. 내용·문장은 가져오지 않고 형식만 배웁니다.</p>

      {canWork && (
        <div className="card">
          <h2>추가</h2>
          <div className="grid2">
            <label>유튜브 링크 (여러 개는 줄바꿈)<textarea style={{ minHeight: 70 }} placeholder="https://youtube.com/shorts/…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} disabled={!!file} /></label>
            <label>또는 영상 파일 (mp4·mov·webm)
              <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <span className="mute" style={{ fontSize: 12 }}>유튜브가 서버 다운로드를 막는 경우가 많아, 화면까지 정확히 배우려면 파일 업로드가 가장 확실합니다. 인스타 릴스도 파일로 올리세요.</span>
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 8 }}>왜 좋은가요? (AI가 가장 중요하게 봅니다)<textarea style={{ minHeight: 54, width: '100%' }} placeholder="예) 첫 1초 숫자 훅이 강함, 자막이 단어 단위로 튀어나옴, 노란 강조색, 컷이 1초마다 바뀜" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <div className="row" style={{ marginTop: 8 }}>
            <input placeholder="태그 (쉼표로)" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
            <label>반영 강도 {f.weight}/5 <input type="range" min={1} max={5} value={f.weight} onChange={(e) => setF({ ...f, weight: Number(e.target.value) })} /></label>
            <span className="mute">학습할 단계:</span>
            {steps.map((s) => (
              <label key={s} style={{ display: 'inline-flex', gap: 3 }}><input type="checkbox" checked={f.learn_steps.includes(s)} onChange={(e) => setF({ ...f, learn_steps: e.target.checked ? [...f.learn_steps, s] : f.learn_steps.filter((x) => x !== s) })} />{STEP_KO[s]}</label>
            ))}
            <button className="pri" disabled={!!busy} onClick={add}>{busy ? prog || '등록 중…' : '추가하고 분석'}</button>
          </div>
        </div>
      )}

      <div className="refs">
        {list.map((r) => (
          <div key={r.id} className={`ref ${r.active ? '' : 'off'}`}>
            <div className="thumbs" onClick={() => setSel(r.id)} style={{ cursor: 'pointer' }}>
              {(r.frames || []).slice(0, 4).map((x: any, i: number) => <img key={i} src={x.url} alt="" />)}
              {!(r.frames || []).length && <span style={{ color: '#8aa', margin: 'auto' }}>{ST[r.status]?.[0]}</span>}
            </div>
            <div className="body">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b style={{ cursor: 'pointer' }} onClick={() => setSel(r.id)}>#{r.id} {r.title || r.url}</b>
                <span className={`tag ${ST[r.status]?.[1]}`}>{ST[r.status]?.[0]}</span>
              </div>
              {r.summary && <span>{String(r.summary).slice(0, 110)}</span>}
              {r.note && <span className="mute">💬 {r.note.slice(0, 80)}</span>}
              {r.error && <span className="mute" style={{ color: r.status === 'failed' ? 'crimson' : '#8a6400' }}>⚠ {r.error.slice(0, 120)}</span>}
              <span className="mute">{r.meta?.duration ? `${r.meta.duration}초 · ` : ''}{r.meta?.cuts != null ? `컷 ${r.meta.cuts} · ` : ''}{r.fit_score ? `적합도 ★${r.fit_score} · ` : ''}강도 {r.weight}/5 · 참고 {r.uses}회</span>
              <span className="mute">{(r.learn_steps || []).map((s: string) => STEP_KO[s]).join('·')}{r.tags?.length ? ` · #${r.tags.join(' #')}` : ''}</span>
              <div className="row" style={{ gap: 4 }}>
                <button onClick={() => setSel(r.id)}>분석 보기</button>
                {canWork && <button onClick={() => upd(r.id, { active: !r.active })}>{r.active ? '학습 사용 중' : '학습 꺼짐'}</button>}
                {r.url && <a href={r.url} target="_blank" className="mute" style={{ fontSize: 12 }}>원본 ↗</a>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {!list.length && <p className="mute">아직 참고 영상이 없습니다.</p>}
    </>
  );
}

function Detail({ id, canWork, canSop, canMake, onBack }: { id: number; canWork: boolean; canSop: boolean; canMake: boolean; onBack: () => void }) {
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [topic, setTopic] = useState('');
  const load = useCallback(() => api(`/api/references?id=${id}`).then((x) => { setD(x); setEdit({ note: x.ref?.note || '', tags: (x.ref?.tags || []).join(', '), weight: x.ref?.weight || 3, learn_steps: x.ref?.learn_steps || [] }); }), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!d?.ref || !['queued', 'analyzing'].includes(d.ref.status)) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [d, load]);
  if (!d?.ref) return <p>불러오는 중…</p>;
  const r = d.ref;
  const a = r.analysis || {};
  const act = async (name: string, body: any, after?: (x: any) => void) => {
    setBusy(name);
    try { const x = await api('/api/references', { id, ...body }); after?.(x); await load(); } catch (e: any) { alert(e.message); }
    setBusy('');
  };
  const rulesBy = (s: string) => (a.replicate_rules || []).filter((x: any) => x.step === s);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>참고 영상</a> › #{r.id} {r.title || ''}</h1>
        <div className="row">
          {canMake && r.status === 'ready' && <>
            <input placeholder="주제 힌트 (비우면 AI가 고름)" value={topic} onChange={(e) => setTopic(e.target.value)} />
            <button className="acc" disabled={!!busy} onClick={() => act('make', { action: 'make', topic }, (x) => (location.href = `/admin/contents/${x.id}`))}>🎬 이 영상처럼 만들기</button>
          </>}
          {canWork && <button disabled={!!busy || r.status === 'analyzing'} onClick={() => act('re', { action: 'reanalyze' })}>다시 분석</button>}
          {canWork && <button onClick={async () => { if (confirm('삭제할까요?')) { await api(`/api/references?id=${id}`, undefined, 'DELETE'); onBack(); } }}>삭제</button>}
        </div>
      </div>
      <p className="mute">{ST[r.status]?.[0]} · {r.kind === 'upload' ? '업로드 영상' : <a href={r.url} target="_blank">{r.url}</a>} · {r.channel || ''} {r.meta?.view_count ? `· 조회 ${Number(r.meta.view_count).toLocaleString()}` : ''} {r.meta?.like_count ? `· 좋아요 ${Number(r.meta.like_count).toLocaleString()}` : ''} · 대사 출처 {r.meta?.transcript_via || '-'}{a._provider ? ` · 분석 ${a._provider}` : ''}</p>
      {r.error && <div className={`card ${r.status === 'failed' ? 'bad' : ''}`}>⚠ {r.error}</div>}
      {['queued', 'analyzing'].includes(r.status) && <div className="card">워커가 분석 중입니다 (보통 2~5분). 이 화면은 자동으로 새로고침됩니다.</div>}

      {(r.frames || []).length > 0 && (
        <div className="card">
          <h2>프레임 {r.cuts?.length ? <span className="mute">· 컷 전환 {r.cuts.length}회 ({r.cuts.slice(0, 20).map((x: number) => x.toFixed(1)).join(', ')}{r.cuts.length > 20 ? '…' : ''}초)</span> : null}</h2>
          <div className="contact">{r.frames.map((x: any, i: number) => <figure key={i}><img src={x.url} alt="" />{Number(x.t).toFixed(1)}초</figure>)}</div>
        </div>
      )}

      {r.status === 'ready' && (
        <div className="grid2">
          <div className="card">
            <h2>요약 {a.fit_score && <span className="tag approved">적합도 ★{a.fit_score}</span>}</h2>
            <p>{a.summary}</p>
            {a.why_it_works?.length > 0 && <><b>잘 되는 이유</b><ul>{a.why_it_works.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
            {a.hook && <><b>훅</b><p style={{ margin: '4px 0' }}>[{a.hook.type}] {a.hook.first_seconds}<br /><span className="mute">첫 문장: {a.hook.line}</span><br />틀: <b>{a.hook.pattern}</b></p></>}
            {a.taxonomy && <p className="mute">분류: {Object.values(a.taxonomy).filter(Boolean).join(' · ')}</p>}
            {a.pacing && <p className="mute">속도: {a.pacing.total_sec}초 · 컷 {a.pacing.cuts} · 컷당 {a.pacing.avg_shot_sec}초 · 초당 {a.pacing.chars_per_sec}자 — {a.pacing.notes}</p>}
            {a.visual && (
              <div>
                <b>디자인</b>
                <div className="row" style={{ gap: 4, margin: '4px 0' }}>{(a.visual.palette || []).map((c: string) => <span key={c} title={c} style={{ width: 26, height: 26, borderRadius: 6, background: c, border: '1px solid #ccd', display: 'inline-block' }} />)}</div>
                <p className="mute" style={{ margin: 0 }}>배경 {a.visual.background} · 제목 느낌 {a.visual.title_font_feel} · 추천 폰트 {(a.visual.recommended_fonts || []).join(', ')} · 레이아웃 {(a.visual.layouts || []).join(', ')} · 모션 {(a.visual.motion || []).join(', ')}</p>
              </div>
            )}
            {a.captions && <p className="mute">자막: {a.captions.position} · {a.captions.size} · 줄당 {a.captions.chars_per_line}자 · {a.captions.style} · {a.captions.emphasis}</p>}
            {a.audio && <p className="mute">소리: {a.audio.voice} · BGM {a.audio.bgm} · 효과음 {a.audio.sfx}</p>}
            {a.avoid?.length > 0 && <><b>따라 하지 말 것</b><ul>{a.avoid.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          </div>
          <div className="card">
            <h2>재현 규칙 <span className="mute">(학습 사용 시 생성 프롬프트에 들어감)</span></h2>
            {Object.keys(STEP_KO).map((s) => rulesBy(s).length > 0 && (
              <div key={s}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{STEP_KO[s]}</b>
                  {canSop && s !== 'research' && <button disabled={!!busy} onClick={() => act(`p-${s}`, { action: 'propose', step: s }, () => alert('SOP 보완 제안을 만들었습니다 — SOP · AI 제어에서 검토 후 반영하세요'))}>{busy === `p-${s}` ? '만드는 중…' : 'SOP 보완 제안 만들기'}</button>}
                </div>
                <ul>{rulesBy(s).map((x: any, i: number) => <li key={i}>{x.rule} <span className="mute">— {x.evidence}</span></li>)}</ul>
              </div>
            ))}
            {a.structure?.length > 0 && (
              <>
                <h2>구성 타임라인</h2>
                <table><tbody>{a.structure.map((x: any, i: number) => <tr key={i}><td className="mute">{Number(x.from).toFixed(1)}~{Number(x.to).toFixed(1)}초</td><td><b>{x.role}</b></td><td>{x.says}</td><td className="mute">{x.shows}</td></tr>)}</tbody></table>
              </>
            )}
          </div>
        </div>
      )}

      {canWork && edit && (
        <div className="card">
          <h2>학습 설정</h2>
          <label style={{ display: 'block' }}>왜 좋은가 (메모를 바꾸면 [다시 분석]으로 반영)<textarea style={{ width: '100%', minHeight: 54 }} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
          <div className="row" style={{ marginTop: 6 }}>
            <input placeholder="태그" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} />
            <label>반영 강도 {edit.weight}/5 <input type="range" min={1} max={5} value={edit.weight} onChange={(e) => setEdit({ ...edit, weight: Number(e.target.value) })} /></label>
            {Object.keys(STEP_KO).map((s) => <label key={s} style={{ display: 'inline-flex', gap: 3 }}><input type="checkbox" checked={edit.learn_steps.includes(s)} onChange={(e) => setEdit({ ...edit, learn_steps: e.target.checked ? [...edit.learn_steps, s] : edit.learn_steps.filter((x: string) => x !== s) })} />{STEP_KO[s]}</label>)}
            <label style={{ display: 'inline-flex', gap: 3 }}><input type="checkbox" checked={r.active} onChange={(e) => act('active', { action: 'update', patch: { active: e.target.checked } })} />학습 사용</label>
            <button className="pri" disabled={!!busy} onClick={() => act('save', { action: 'update', patch: edit })}>저장</button>
          </div>
        </div>
      )}

      {r.transcript && <details className="card"><summary><b>대사 ({r.meta?.transcript_via})</b></summary><pre className="md">{r.transcript}</pre></details>}
      {d.made?.length > 0 && (
        <div className="card">
          <h2>이 영상으로 만든 숏폼</h2>
          <ul>{d.made.map((c: any) => <li key={c.id}><Link href={`/admin/contents/${c.id}`}>{c.topic || c.slug}</Link> <span className="mute">{c.current_step} · {new Date(c.created_at).toLocaleDateString('ko-KR')}</span></li>)}</ul>
        </div>
      )}
    </>
  );
}
