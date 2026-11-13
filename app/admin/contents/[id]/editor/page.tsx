'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { api } from '@/lib/api';
import { can, canStep } from '@/lib/perms';
import { VIDEO_FONTS, googleFontsHref } from '@/lib/fonts';
import { useMe } from '../../../MeContext';
import { buildProps, captionsOf, narrationOf } from '@/worker/video/props';
import { sceneStarts, type ElKey, type ElStyle } from '@/worker/video/Short';
import type { PreviewHandle } from './Preview';

const Preview = dynamic(() => import('./Preview'), { ssr: false, loading: () => <div className="ed-ph">미리보기 불러오는 중…</div> });

/** 영상 크기 */
const SIZES = [
  { label: '9:16 쇼츠·릴스', w: 1080, h: 1920 },
  { label: '4:5 피드', w: 1080, h: 1350 },
  { label: '1:1 정사각', w: 1080, h: 1080 },
  { label: '16:9 가로', w: 1920, h: 1080 },
  { label: '9:16 720p', w: 720, h: 1280 },
];
const LAYOUTS = [['hook', '훅(첫 장면)'], ['stat', '숫자 강조'], ['list', '목록'], ['compare', '비교'], ['quote', '한 문장'], ['cta', '신청 유도']];
const MOTIONS = [['pop', '튀어나오기'], ['slide', '아래서 올라오기'], ['zoom', '줌인 + 흐림'], ['typewriter', '타자 치기'], ['countup', '숫자 올라가기']];
const EL_LABEL: Record<ElKey, string> = { icon: '아이콘', stat: '숫자', headline: '제목', sub: '부제', items: '목록 칸', cta: '신청 버튼', caption: '자막' };
const THEME_LABEL: [string, string][] = [['bg', '배경 위'], ['bg2', '배경 아래'], ['accent', '강조색'], ['text', '제목 글자'], ['sub', '부제 글자']];

const DEFAULT_THEME = { bg: '#0B1B3F', bg2: '#132B63', accent: '#FFD400', text: '#FFFFFF', sub: '#A9BCE6' };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** 이 장면에서 화면에 나오는 요소 */
function elsOf(s: any): ElKey[] {
  const out: ElKey[] = [];
  if (s.icon) out.push('icon');
  if (s.layout === 'stat') out.push('stat');
  out.push('headline');
  if (s.sub) out.push('sub');
  if (s.layout === 'list' || s.layout === 'compare') out.push('items');
  if (s.layout === 'cta') out.push('cta');
  out.push('caption');
  return out;
}

export default function VideoEditor({ params }: { params: { id: string } }) {
  const me = useMe();
  const [c, setC] = useState<any>(null);
  const [design, setDesign] = useState<any>(null);
  const [saved, setSaved] = useState<string>('');
  const [past, setPast] = useState<any[]>([]);
  const [future, setFuture] = useState<any[]>([]);
  const [bgms, setBgms] = useState<any[]>([]);
  const [bgmId, setBgmId] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [el, setEl] = useState<ElKey>('headline');
  const [tab, setTab] = useState<'scene' | 'el' | 'caption' | 'all'>('scene');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const pv = useRef<PreviewHandle | null>(null);
  const dragBase = useRef<{ dx: number; dy: number } | null>(null);

  const mayEdit = can(me, 'editor', 'work') || canStep(me, 'design', 'work');
  const mayRender = canStep(me, 'render', 'work');

  useEffect(() => {
    api(`/api/contents/${params.id}`).then((d) => {
      const content = d.content;
      setC(content);
      const ds = clone(content.design || {});
      ds.theme = { ...DEFAULT_THEME, ...(ds.theme || {}) };
      ds.fonts = { title: 'Black Han Sans', body: 'Noto Sans KR', ...(ds.fonts || {}) };
      ds.scale = { title: 1, body: 1, caption: 1, ...(ds.scale || {}) };
      ds.size = ds.size || { w: 1080, h: 1920 };
      ds.caption = ds.caption || {};
      ds.chrome = { brand: true, date: true, progress: true, backdrop: true, ...(ds.chrome || {}) };
      // 대사 장면마다 디자인 장면이 있도록 (없으면 첫 자막으로 한 문장 장면)
      ds.scenes = (content.script?.scenes || []).map((sc: any) => (ds.scenes || []).find((x: any) => x.id === sc.id) || { id: sc.id, layout: 'quote', headline: sc.captions?.[0] || '', motion: 'pop' });
      setDesign(ds); setSaved(JSON.stringify(ds)); setBgmId(content.bgm_id ?? null);
    }).catch((e) => setErr(e.message));
    api('/api/bgm').then((d) => setBgms(d.tracks || [])).catch(() => {});
  }, [params.id]);

  const dirty = design && JSON.stringify(design) !== saved;
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);

  /** 모든 수정은 여기로: 되돌리기 기록 + 반영 */
  const change = useCallback((fn: (d: any) => void, record = true) => {
    setDesign((cur: any) => {
      const next = clone(cur);
      fn(next);
      if (record) { setPast((p) => [...p.slice(-60), cur]); setFuture([]); }
      return next;
    });
  }, []);
  const undo = () => { if (!past.length) return; setFuture((f) => [design, ...f]); setDesign(past[past.length - 1]); setPast((p) => p.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, design]); setDesign(future[0]); setFuture((f) => f.slice(1)); };

  const sc = c?.script?.scenes?.[sel];
  const g = design?.scenes?.[sel];
  const setScene = (fn: (s: any) => void) => change((d) => fn(d.scenes[sel]));
  const setEl_ = (k: ElKey, patch: Partial<ElStyle> | null) => setScene((s) => {
    s.els = s.els || {};
    if (patch === null) delete s.els[k];
    else s.els[k] = Object.fromEntries(Object.entries({ ...(s.els[k] || {}), ...patch }).filter(([, v]) => v !== undefined && v !== ''));
  });

  // 미리보기 props (대사를 바꾼 장면은 기존 음성을 빼고 예상 길이로)
  const props = useMemo(() => {
    if (!c || !design) return null;
    const bgmUrl = bgmId ? bgms.find((b) => b.id === bgmId)?.url ?? null : c.audio?.bgmUrl ?? null;
    const audio = (c.audio?.scenes || []).filter((a: any) => {
      const s = c.script.scenes.find((x: any) => x.id === a.id);
      const gg = design.scenes.find((x: any) => x.id === a.id);
      return s && (a.text == null ? !gg?.narration : a.text === narrationOf(s, gg));
    });
    const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date());
    return buildProps({ script: c.script, design }, { brand: design.brand_text || '오늘의 정책자금', dateLabel, audio, bgmUrl });
  }, [c, design, bgmId, bgms]);
  const starts = useMemo(() => (props ? sceneStarts(props) : []), [props]);

  const pick = (i: number) => {
    setSel(i);
    if (starts[i] != null) pv.current?.seek(starts[i] + 12);
    const s = design.scenes[i];
    if (!elsOf(s).includes(el)) setEl('headline');
  };
  const onFrame = useCallback((f: number) => {
    // 재생 중에는 지금 나오는 장면을 따라감 (드래그 중엔 고정)
    if (dragBase.current) return;
    let i = 0;
    for (let j = 0; j < starts.length; j++) if (f >= starts[j]) i = j;
    setSel((cur) => (cur === i ? cur : i));
  }, [starts]);

  const onMove = (dx: number, dy: number, done: boolean) => {
    if (!dragBase.current) {
      const e = design.scenes[sel]?.els?.[el] || {};
      dragBase.current = { dx: e.dx || 0, dy: e.dy || 0 };
      setPast((p) => [...p.slice(-60), design]); setFuture([]);
    }
    const b = dragBase.current;
    change((d) => {
      const s = d.scenes[sel];
      s.els = s.els || {};
      s.els[el] = { ...(s.els[el] || {}), dx: b.dx + dx, dy: b.dy + dy };
    }, false);
    if (done) dragBase.current = null;
  };
  const nudge = (k: 'dx' | 'dy', n: number) => setEl_(el, { [k]: ((g?.els?.[el] as any)?.[k] || 0) + n });

  // 단축키: Ctrl+Z / Ctrl+Shift+Z, 방향키(드래그 모드) 1px · Shift 10px
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (!drag) return;
      const step = e.shiftKey ? 10 : 1;
      const m: Record<string, ['dx' | 'dy', number]> = { ArrowLeft: ['dx', -step], ArrowRight: ['dx', step], ArrowUp: ['dy', -step], ArrowDown: ['dy', step] };
      if (m[e.key]) { e.preventDefault(); nudge(...m[e.key]); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  });

  const save = async (andRender = false) => {
    setBusy(andRender ? 'render' : 'save'); setMsg('');
    try {
      await api(`/api/contents/${params.id}`, { video_edit: { design } }, 'PATCH');
      if ((bgmId ?? null) !== (c.bgm_id ?? null) && mayRender) await api(`/api/contents/${params.id}`, { bgm_id: bgmId }, 'PATCH');
      setSaved(JSON.stringify(design));
      if (andRender) {
        await api('/api/render', { contentId: params.id });
        setMsg('저장했고 렌더를 시작했습니다 (보통 3~6분). 끝나면 작업대에서 새 영상을 확인하세요.');
      } else setMsg(mayRender ? '저장했습니다. 영상 파일에 반영하려면 [저장 + 다시 렌더]를 누르세요.' : '저장했습니다. 렌더 권한이 있는 사람이 다시 렌더하면 영상에 반영됩니다.');
    } catch (e: any) { setMsg(`⚠ ${e.message}`); }
    setBusy(null);
  };

  if (err) return <div className="card">⚠ {err}</div>;
  if (!c || !design || !props) return <p>불러오는 중…</p>;
  if (!mayEdit) return <div className="card locked"><h1>🔒 영상 편집 권한이 없습니다</h1><p className="mute">대표에게 &lsquo;영상 편집기&rsquo; 작업 권한을 요청하세요.</p></div>;
  if (!c.script?.scenes?.length) return <div className="card">대사 단계가 아직 없습니다. 대사가 승인된 뒤 편집할 수 있습니다.</div>;

  const E: ElStyle = (g?.els?.[el] || {}) as ElStyle;
  const cap = design.caption || {};
  const total = props.scenes.reduce((n: number, s: any) => n + s.durationSec, 0);
  const capLines = captionsOf(sc, g);
  const narr = narrationOf(sc, g);
  const elFont = el === 'headline' || el === 'stat' ? design.fonts.title : design.fonts.body;

  return (
    <div id="tpf-editor">
      <link rel="stylesheet" href={googleFontsHref()} />
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="row">
          <Link href={`/admin/contents/${params.id}`}>← 작업대</Link>
          <h1 style={{ margin: 0 }}>🎬 영상 편집기 <span className="mute">{c.topic || c.slug} · {props.size?.w}×{props.size?.h} · 약 {total.toFixed(1)}초</span></h1>
        </div>
        <div className="row">
          <button onClick={undo} disabled={!past.length} title="Ctrl+Z">↶ 되돌리기</button>
          <button onClick={redo} disabled={!future.length} title="Ctrl+Shift+Z">↷ 다시</button>
          <button onClick={() => { if (confirm('저장하지 않은 수정을 모두 버릴까요?')) { setPast((p) => [...p, design]); setDesign(JSON.parse(saved)); } }} disabled={!dirty}>수정 취소</button>
          <button className="pri" disabled={!!busy || !dirty} onClick={() => save(false)}>{busy === 'save' ? '저장 중…' : dirty ? '저장' : '저장됨'}</button>
          {mayRender && <button className="acc" disabled={!!busy} onClick={() => save(true)}>{busy === 'render' ? '요청 중…' : '저장 + 다시 렌더'}</button>}
        </div>
      </div>
      {msg && <div className="card" style={{ padding: 10 }}>{msg}</div>}

      <div className="ed-grid">
        {/* 장면 목록 */}
        <div className="ed-scenes">
          {design.scenes.map((s: any, i: number) => (
            <button key={s.id} className={i === sel ? 'on' : ''} onClick={() => pick(i)}>
              <b>{i + 1}</b> <span className="mute">{LAYOUTS.find((l) => l[0] === s.layout)?.[1] || s.layout} · {props.scenes[i]?.durationSec.toFixed(1)}초</span>
              <div className="t">{s.layout === 'stat' && s.value ? `${s.value}${s.unit || ''} ` : ''}{s.headline || '(제목 없음)'}</div>
            </button>
          ))}
        </div>

        {/* 미리보기 */}
        <div>
          <Preview handle={pv} props={props} drag={drag} onMove={onMove} onFrame={onFrame} />
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={drag} onChange={(e) => setDrag(e.target.checked)} /> 화면에서 끌어서 이동</label>
            <select value={el} onChange={(e) => { setEl(e.target.value as ElKey); setTab('el'); }}>
              {elsOf(g).map((k) => <option key={k} value={k}>{EL_LABEL[k]}</option>)}
            </select>
            <span className="mute">{drag ? '방향키 1px · Shift+방향키 10px' : '체크하면 선택한 요소를 마우스로 옮깁니다'}</span>
          </div>
          {narr !== (sc?.narration || '') && <p className="mute" style={{ textAlign: 'center' }}>🔊 이 장면 대사를 바꿨습니다 — 미리보기는 예상 길이, 다시 렌더할 때 새 목소리로 만듭니다.</p>}
        </div>

        {/* 속성 패널 */}
        <div className="ed-panel card">
          <div className="tabs">
            {([['scene', '장면'], ['el', '요소'], ['caption', '자막'], ['all', '전체·크기']] as const).map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === 'scene' && (
            <div className="ed-form">
              <Field label="구성"><select value={g.layout} onChange={(e) => setScene((s) => { s.layout = e.target.value; })}>{LAYOUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="움직임"><select value={g.motion || 'pop'} onChange={(e) => setScene((s) => { s.motion = e.target.value; })}>{MOTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="아이콘(이모지)"><input value={g.icon || ''} onChange={(e) => setScene((s) => { s.icon = e.target.value || undefined; })} placeholder="예: 🚨 (비우면 없음)" /></Field>
              {g.layout === 'stat' && (
                <div className="row">
                  <Field label="숫자"><input value={g.value || ''} onChange={(e) => setScene((s) => { s.value = e.target.value; })} style={{ width: 110 }} /></Field>
                  <Field label="단위"><input value={g.unit || ''} onChange={(e) => setScene((s) => { s.unit = e.target.value; })} style={{ width: 70 }} /></Field>
                </div>
              )}
              <Field label="제목 (줄바꿈 가능)"><textarea className="txt" rows={2} value={g.headline || ''} onChange={(e) => setScene((s) => { s.headline = e.target.value; })} /></Field>
              <Field label="강조 단어 (쉼표로 구분 · 강조색으로 표시)"><input value={(g.emphasis || []).join(', ')} onChange={(e) => setScene((s) => { s.emphasis = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); })} /></Field>
              <Field label="부제"><textarea className="txt" rows={2} value={g.sub || ''} onChange={(e) => setScene((s) => { s.sub = e.target.value || undefined; })} /></Field>
              {(g.layout === 'list' || g.layout === 'compare') && (
                <Field label={g.layout === 'compare' ? '비교 칸 (한 줄에 하나 · 두 번째 칸이 강조)' : '목록 (한 줄에 하나)'}>
                  <textarea className="txt" rows={4} value={(g.items || []).join('\n')} onChange={(e) => setScene((s) => { s.items = e.target.value.split('\n'); })} onBlur={() => setScene((s) => { s.items = (s.items || []).map((x: string) => x.trim()).filter(Boolean); })} />
                </Field>
              )}
              {g.layout === 'cta' && <Field label="버튼 문구"><input value={g.cta || ''} onChange={(e) => setScene((s) => { s.cta = e.target.value || undefined; })} placeholder="👇 고정 댓글 · 프로필 링크" /></Field>}
              <Field label={`장면 여백 ${Number(g.hold || 0).toFixed(1)}초 (대사 뒤에 더 머무름 · 음수면 줄임)`}>
                <input type="range" min={-1} max={5} step={0.1} value={g.hold || 0} onChange={(e) => setScene((s) => { s.hold = Number(e.target.value) || undefined; })} />
              </Field>
              <div className="row">
                <Field label="이 장면 배경 위"><Color value={g.bg?.bg || design.theme.bg} onChange={(v) => setScene((s) => { s.bg = { ...(s.bg || {}), bg: v }; })} /></Field>
                <Field label="배경 아래"><Color value={g.bg?.bg2 || design.theme.bg2} onChange={(v) => setScene((s) => { s.bg = { ...(s.bg || {}), bg2: v }; })} /></Field>
                {g.bg && <button onClick={() => setScene((s) => { delete s.bg; })}>전체 색으로</button>}
              </div>
              <hr />
              <Field label="🔊 대사 (AI 목소리가 읽는 문장 · 바꾸면 렌더 때 새로 녹음)">
                <textarea className="txt" rows={3} value={narr} onChange={(e) => setScene((s) => { s.narration = e.target.value === sc.narration ? undefined : e.target.value; })} />
              </Field>
              {g.narration && <button onClick={() => setScene((s) => { delete s.narration; })}>원래 대사로</button>}
            </div>
          )}

          {tab === 'el' && (
            <div className="ed-form">
              <Field label="편집할 요소">
                <div className="row">{elsOf(g).map((k) => <button key={k} className={k === el ? 'pri' : ''} onClick={() => setEl(k)}>{EL_LABEL[k]}</button>)}</div>
              </Field>
              <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!!E.hidden} onChange={(e) => setEl_(el, { hidden: e.target.checked || undefined })} /> 이 장면에서 숨기기</label>
              {el !== 'icon' && (
                <>
                  <Field label="글자색"><Color value={E.color || (el === 'stat' ? design.theme.accent : el === 'sub' ? design.theme.sub : el === 'cta' ? design.theme.bg : el === 'caption' ? cap.color || '#ffffff' : design.theme.text)} onChange={(v) => setEl_(el, { color: v })} /></Field>
                  {(el === 'items' || el === 'cta' || el === 'caption') && <Field label="칸 배경색"><Color value={E.bg || (el === 'cta' ? design.theme.accent : '#1a2a55')} onChange={(v) => setEl_(el, { bg: v })} /></Field>}
                  <Field label="글꼴"><FontSelect value={E.font || ''} fallback={el === 'caption' ? cap.font || design.fonts.body : elFont} onChange={(v) => setEl_(el, { font: v || undefined })} /></Field>
                </>
              )}
              <Field label={`크기 ${Math.round((E.scale ?? 1) * 100)}%`}>
                <input type="range" min={0.3} max={2.5} step={0.05} value={E.scale ?? 1} onChange={(e) => setEl_(el, { scale: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} />
              </Field>
              <Field label={`위치 가로 ${E.dx || 0}px · 세로 ${E.dy || 0}px (1080 기준)`}>
                <input type="range" min={-540} max={540} value={E.dx || 0} onChange={(e) => setEl_(el, { dx: Number(e.target.value) || undefined })} />
                <input type="range" min={-960} max={960} value={E.dy || 0} onChange={(e) => setEl_(el, { dy: Number(e.target.value) || undefined })} />
                <div className="row">
                  <button onClick={() => nudge('dx', -10)}>←</button><button onClick={() => nudge('dy', -10)}>↑</button>
                  <button onClick={() => nudge('dy', 10)}>↓</button><button onClick={() => nudge('dx', 10)}>→</button>
                  <button onClick={() => setEl_(el, { dx: undefined, dy: undefined })}>가운데로</button>
                </div>
              </Field>
              <div className="row">
                <button onClick={() => setEl_(el, null)}>이 요소 원래대로</button>
                <button onClick={() => change((d) => { const st = d.scenes[sel].els?.[el]; d.scenes.forEach((s: any, i: number) => { if (i !== sel && elsOf(s).includes(el)) { s.els = s.els || {}; s.els[el] = clone(st || {}); } }); })}>모든 장면에 같은 스타일</button>
              </div>
              <p className="mute">팁: 미리보기 아래 &lsquo;화면에서 끌어서 이동&rsquo;을 켜면 마우스로 바로 옮길 수 있습니다.</p>
            </div>
          )}

          {tab === 'caption' && (
            <div className="ed-form">
              <Field label={`이 장면 자막 (한 줄 = 한 컷 · 대사 길이에 맞춰 나눠 나옴)`}>
                <textarea className="txt" rows={5} value={capLines.join('\n')} onChange={(e) => setScene((s) => { s.captions = e.target.value.split('\n'); })} onBlur={() => setScene((s) => { const v = (s.captions || []).map((x: string) => x.trim()).filter(Boolean); s.captions = v.length && v.join('\n') !== (sc.captions || []).join('\n') ? v : undefined; })} />
              </Field>
              {g.captions && <button onClick={() => setScene((s) => { delete s.captions; })}>대사 단계 자막으로</button>}
              <hr />
              <b>모든 장면 자막 스타일</b>
              <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!cap.hidden} onChange={(e) => change((d) => { d.caption.hidden = !e.target.checked || undefined; })} /> 자막 보이기</label>
              <Field label="글꼴"><FontSelect value={cap.font || ''} fallback={design.fonts.body} onChange={(v) => change((d) => { d.caption.font = v || undefined; })} /></Field>
              <div className="row">
                <Field label="글자색"><Color value={cap.color || '#ffffff'} onChange={(v) => change((d) => { d.caption.color = v; })} /></Field>
                <Field label="박스색"><Color value={(cap.bg || '#000000').slice(0, 7)} onChange={(v) => change((d) => { d.caption.bg = v + 'b8'; })} /></Field>
              </div>
              <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={cap.box !== false} onChange={(e) => change((d) => { d.caption.box = e.target.checked ? undefined : false; })} /> 반투명 박스</label>
              <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!!cap.stroke} onChange={(e) => change((d) => { d.caption.stroke = e.target.checked || undefined; })} /> 테두리 굵게</label>
              <Field label={`크기 ${Math.round((cap.size ?? 1) * 100)}%`}><input type="range" min={0.5} max={2} step={0.05} value={cap.size ?? 1} onChange={(e) => change((d) => { d.caption.size = Number(e.target.value); })} /></Field>
              <Field label={`아래에서 높이 ${cap.bottom ?? '기본'}${cap.bottom != null ? 'px' : ''}`}>
                <input type="range" min={0} max={1500} step={5} value={cap.bottom ?? 360} onChange={(e) => change((d) => { d.caption.bottom = Number(e.target.value); })} />
                {cap.bottom != null && <button onClick={() => change((d) => { delete d.caption.bottom; })}>기본 높이</button>}
              </Field>
            </div>
          )}

          {tab === 'all' && (
            <div className="ed-form">
              <b>영상 크기</b>
              <div className="row">
                {SIZES.map((s) => (
                  <button key={s.label} className={design.size.w === s.w && design.size.h === s.h ? 'pri' : ''} onClick={() => change((d) => { d.size = { w: s.w, h: s.h }; })}>{s.label}</button>
                ))}
              </div>
              <div className="row">
                <Field label="가로 px"><input type="number" min={240} max={3840} step={2} value={design.size.w} onChange={(e) => change((d) => { d.size.w = Math.max(240, Math.min(3840, Number(e.target.value) || 1080)); })} style={{ width: 100 }} /></Field>
                <Field label="세로 px"><input type="number" min={240} max={3840} step={2} value={design.size.h} onChange={(e) => change((d) => { d.size.h = Math.max(240, Math.min(3840, Number(e.target.value) || 1920)); })} style={{ width: 100 }} /></Field>
                <button onClick={() => change((d) => { d.size = { w: d.size.h, h: d.size.w }; })}>가로↔세로</button>
              </div>
              {(design.size.w !== 1080 || design.size.h !== 1920) && <p className="mute">유튜브 쇼츠·인스타 릴스는 9:16 이 기본입니다. 다른 비율은 일반 영상·피드로 올라갑니다.</p>}
              <hr />
              <b>색</b>
              <div className="ed-colors">
                {THEME_LABEL.map(([k, l]) => <Field key={k} label={l}><Color value={design.theme[k]} onChange={(v) => change((d) => { d.theme[k] = v; })} /></Field>)}
              </div>
              <div className="row">
                {[
                  ['남색·노랑', DEFAULT_THEME], ['검정·빨강', { bg: '#111111', bg2: '#2a0d0d', accent: '#FF3B30', text: '#FFFFFF', sub: '#F2B8B5' }],
                  ['흰색·파랑', { bg: '#FFFFFF', bg2: '#E8EEFF', accent: '#1739A6', text: '#0D1530', sub: '#4A5578' }], ['초록·형광', { bg: '#062A1F', bg2: '#0F4A35', accent: '#B6FF3B', text: '#FFFFFF', sub: '#A8D8C2' }],
                ].map(([n, t]: any) => <button key={n} onClick={() => change((d) => { d.theme = { ...t }; })}><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: t.bg, border: `3px solid ${t.accent}`, verticalAlign: -2, marginRight: 4 }} />{n}</button>)}
              </div>
              <button onClick={() => change((d) => d.scenes.forEach((s: any) => { delete s.bg; }))}>장면별 배경색 모두 지우기</button>
              <hr />
              <b>글꼴</b>
              <Field label="제목 글꼴"><FontSelect value={design.fonts.title} onChange={(v) => change((d) => { d.fonts.title = v || 'Black Han Sans'; })} /></Field>
              <Field label="본문 글꼴"><FontSelect value={design.fonts.body} onChange={(v) => change((d) => { d.fonts.body = v || 'Noto Sans KR'; })} /></Field>
              <Field label={`제목 크기 ${Math.round(design.scale.title * 100)}%`}><input type="range" min={0.5} max={1.8} step={0.05} value={design.scale.title} onChange={(e) => change((d) => { d.scale.title = Number(e.target.value); })} /></Field>
              <Field label={`본문 크기 ${Math.round(design.scale.body * 100)}%`}><input type="range" min={0.5} max={1.8} step={0.05} value={design.scale.body} onChange={(e) => change((d) => { d.scale.body = Number(e.target.value); })} /></Field>
              <Field label={`자막 크기 ${Math.round(design.scale.caption * 100)}%`}><input type="range" min={0.5} max={1.8} step={0.05} value={design.scale.caption} onChange={(e) => change((d) => { d.scale.caption = Number(e.target.value); })} /></Field>
              <hr />
              <b>화면 장식</b>
              <Field label="브랜드 문구"><input value={design.brand_text || ''} placeholder="오늘의 정책자금" onChange={(e) => change((d) => { d.brand_text = e.target.value || undefined; })} /></Field>
              <div className="row">
                {([['brand', '브랜드 배지'], ['date', '날짜'], ['progress', '진행 바'], ['backdrop', '배경 도형']] as const).map(([k, l]) => (
                  <label key={k} className="row" style={{ gap: 4 }}><input type="checkbox" checked={design.chrome[k] !== false} onChange={(e) => change((d) => { d.chrome[k] = e.target.checked; })} /> {l}</label>
                ))}
              </div>
              <hr />
              <b>배경음악</b>
              <select value={bgmId ?? ''} onChange={(e) => setBgmId(e.target.value || null)} disabled={!mayRender}>
                <option value="">{c.audio?.bgmUrl ? '지난 렌더 곡 / 자동 선택' : '자동 선택 (분위기에 맞춰)'}</option>
                {bgms.map((b) => <option key={b.id} value={b.id}>{b.title}{b.mood ? ` · ${b.mood}` : ''}</option>)}
              </select>
              <Field label={`음악 크기 ${Math.round((design.bgm_volume ?? 0.12) * 100)}%`}><input type="range" min={0} max={0.5} step={0.01} value={design.bgm_volume ?? 0.12} onChange={(e) => change((d) => { d.bgm_volume = Number(e.target.value); })} /></Field>
            </div>
          )}
        </div>
      </div>

      <style>{`
        #tpf-editor .ed-grid{display:grid;grid-template-columns:200px minmax(300px,1fr) 340px;gap:14px;align-items:start}
        #tpf-editor .ed-scenes{display:grid;gap:6px;max-height:calc(100vh - 150px);overflow:auto}
        #tpf-editor .ed-scenes button{text-align:left;padding:8px 10px}
        #tpf-editor .ed-scenes button.on{border-color:var(--pri);background:#eef2ff}
        #tpf-editor .ed-scenes .t{font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #tpf-editor .ed-panel{position:sticky;top:12px;max-height:calc(100vh - 120px);overflow-y:auto;overflow-x:hidden;margin:0;min-width:0}
        #tpf-editor .ed-form{display:grid;gap:10px;min-width:0}
        #tpf-editor .ed-form select,#tpf-editor .ed-form label.f>input:not([type]),#tpf-editor .ed-form textarea{width:100%;max-width:100%}
        #tpf-editor .ed-form label.f{display:grid;gap:4px;font-size:12px;color:var(--mute)}
        #tpf-editor .ed-form input[type=range]{width:100%}
        #tpf-editor .ed-form textarea.txt{min-height:0;font-family:inherit;font-size:14px}
        #tpf-editor .ed-form button{padding:5px 9px;font-size:12px}
        #tpf-editor .ed-colors{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        #tpf-editor hr{border:0;border-top:1px solid var(--line);margin:4px 0;width:100%}
        #tpf-editor .ed-ph{aspect-ratio:9/16;max-width:400px;margin:0 auto;display:grid;place-items:center;background:#0b1b3f;color:#fff;border-radius:12px}
        @media (max-width:1200px){#tpf-editor .ed-grid{grid-template-columns:1fr}#tpf-editor .ed-scenes{grid-auto-flow:column;grid-auto-columns:160px;overflow-x:auto}#tpf-editor .ed-panel{position:static;max-height:none}}
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="f">{label}{children}</label>;
}
function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const v = /^#[0-9a-f]{6}/i.test(value || '') ? value.slice(0, 7) : '#ffffff';
  return (
    <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <input type="color" value={v} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 30, padding: 2 }} />
      <input key={value} defaultValue={value || ''} onBlur={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && e.target.value !== value && onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} style={{ width: 80, fontFamily: 'monospace', fontSize: 12 }} />
    </span>
  );
}
function FontSelect({ value, fallback, onChange }: { value: string; fallback?: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: `'${value || fallback}'`, fontSize: 16 }}>
      {fallback && <option value="">기본 ({fallback})</option>}
      {VIDEO_FONTS.map((f) => <option key={f.name} value={f.name} style={{ fontFamily: `'${f.name}'` }}>{f.name} — {f.kind}</option>)}
    </select>
  );
}
