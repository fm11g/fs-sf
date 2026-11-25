'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { api } from '@/lib/api';
import { can, canStep } from '@/lib/perms';
import { fontHrefs } from '@/lib/fonts';
import { useMe } from '../../../MeContext';
import { DEFAULT_FONTS, buildProps, captionsOf, narrationOf } from '@/worker/video/props';
import { sceneStarts, type ElKey, type ElStyle } from '@/worker/video/common';
import { NEWS_LAYOUTS, NEWS_THEME } from '@/worker/video/news';
import MediaField from './MediaField';
import { Color, Field, FontSelect, Seg, WeightSelect } from './controls';
import CaptionPanel from './CaptionPanel';
import LayerPanel from './LayerPanel';
import StylePanel from './StylePanel';
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
const CLASSIC_LAYOUTS = [['hook', '훅(첫 장면)'], ['stat', '숫자 강조'], ['list', '목록'], ['compare', '비교'], ['quote', '한 문장'], ['cta', '신청 유도']];
const MOTIONS = [['pop', '튀어나오기'], ['slide', '아래서 올라오기'], ['zoom', '줌인 + 흐림'], ['typewriter', '타자 치기'], ['countup', '숫자 올라가기']];
const EL_LABEL: Record<ElKey, string> = { icon: '아이콘', stat: '숫자', headline: '제목', sub: '부제', items: '목록 칸', cta: '신청 버튼', caption: '자막', kicker: '머리말', tag: '태그', source: '출처' };

const DEFAULT_THEME = { bg: '#0B1B3F', bg2: '#132B63', accent: '#FFD400', text: '#FFFFFF', sub: '#A9BCE6' };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** 이 장면에서 화면에 나오는 요소 */
function elsOf(s: any, news = false): ElKey[] {
  const out: ElKey[] = [];
  if (news && ['breaking', 'hook'].includes(s.layout)) out.push('tag');
  if (news && s.kicker) out.push('kicker');
  if (!news && s.icon) out.push('icon');
  if (s.layout === 'stat') out.push('stat');
  out.push('headline');
  if (s.sub) out.push('sub');
  if (s.layout === 'list' || s.layout === 'compare') out.push('items');
  if (s.layout === 'cta') out.push('cta');
  if (news && s.source) out.push('source');
  out.push('caption');
  return out;
}

export default function VideoEditor({ params }: { params: { id: string } }) {
  const me = useMe();
  const [c, setC] = useState<any>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [design, setDesign] = useState<any>(null);
  const [saved, setSaved] = useState<string>('');
  const [past, setPast] = useState<any[]>([]);
  const [future, setFuture] = useState<any[]>([]);
  const [bgms, setBgms] = useState<any[]>([]);
  const [bgmId, setBgmId] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [el, setEl] = useState<ElKey>('headline');
  const [tab, setTab] = useState<'scene' | 'el' | 'layers' | 'caption' | 'all'>('scene');
  const [selLayer, setSelLayer] = useState<string | null>(null);
  const [styleKey, setStyleKey] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const pv = useRef<PreviewHandle | null>(null);
  const dragBase = useRef<{ dx: number; dy: number; layer?: boolean } | null>(null);

  const mayEdit = can(me, 'editor', 'work') || canStep(me, 'design', 'work');
  const mayRender = canStep(me, 'render', 'work');

  useEffect(() => {
    api(`/api/contents/${params.id}`).then((d) => {
      const content = d.content;
      setC(content);
      const ds = clone(content.design || {});
      const isNews = ds.template === 'news';
      ds.theme = { ...(isNews ? NEWS_THEME : DEFAULT_THEME), ...(ds.theme || {}) };
      ds.fonts = { ...(isNews ? DEFAULT_FONTS.news : DEFAULT_FONTS.classic), ...(ds.fonts || {}) };
      ds.scale = { title: 1, body: 1, caption: 1, ...(ds.scale || {}) };
      ds.size = ds.size || { w: 1080, h: 1920 };
      ds.caption = ds.caption || {};
      ds.chrome = { brand: true, date: true, progress: true, backdrop: true, ...(ds.chrome || {}) };
      // 대사 장면마다 디자인 장면이 있도록 (없으면 첫 자막으로 한 문장 장면)
      ds.scenes = (content.script?.scenes || []).map((sc: any) => (ds.scenes || []).find((x: any) => x.id === sc.id) || { id: sc.id, layout: 'quote', headline: sc.captions?.[0] || '', motion: 'pop' });
      setDesign(ds); setSaved(JSON.stringify(ds)); setBgmId(content.bgm_id ?? null); setStyleKey(content.style_key ?? ds.style_key ?? null);
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

  const g = design?.scenes?.[sel];
  const sc = c?.script?.scenes?.find((x: any) => x.id === g?.id) || c?.script?.scenes?.[sel]; // 장면을 옮겨도 대사는 id 로 짝지음
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
    if (!elsOf(s, design.template === 'news').includes(el)) setEl('headline');
    setSelLayer(null);
  };
  const onFrame = useCallback((f: number) => {
    // 재생 중에는 지금 나오는 장면을 따라감 (드래그 중엔 고정)
    if (dragBase.current) return;
    let i = 0;
    for (let j = 0; j < starts.length; j++) if (f >= starts[j]) i = j;
    setSel((cur) => (cur === i ? cur : i));
  }, [starts]);

  const onMove = (dx: number, dy: number, done: boolean) => {
    // 모션 탭에서 레이어를 골랐으면 레이어를 옮김 (x·y = 1080×1920 기준)
    const L = tab === 'layers' && selLayer ? design.scenes[sel]?.layers?.find((x: any) => x.id === selLayer) : null;
    if (L) {
      if (!dragBase.current) { dragBase.current = { dx: L.x, dy: L.y, layer: true }; setPast((p) => [...p.slice(-60), design]); setFuture([]); }
      const b = dragBase.current;
      change((d) => { const l = d.scenes[sel].layers.find((x: any) => x.id === selLayer); if (l) { l.x = Math.round(b.dx + dx); l.y = Math.round(b.dy + dy); } }, false);
      if (done) dragBase.current = null;
      return;
    }
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
  const nudge = (k: 'dx' | 'dy', n: number) => {
    if (tab === 'layers' && selLayer) return setScene((s) => { const l = (s.layers || []).find((x: any) => x.id === selLayer); if (l) l[k === 'dx' ? 'x' : 'y'] += n; });
    setEl_(el, { [k]: ((g?.els?.[el] as any)?.[k] || 0) + n });
  };

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

  /** 장면 순서 옮기기 — 미리보기·렌더가 이 순서를 따르고, 저장하면 다음 대사의 기본 순서로도 씀 */
  const moveScene = (from: number, to: number) => {
    if (to < 0 || to >= design.scenes.length || from === to) return;
    change((d) => {
      const [x] = d.scenes.splice(from, 1);
      d.scenes.splice(to, 0, x);
      d.scene_order = d.scenes.map((y: any) => y.id);
    });
    setSel(to);
  };
  const orderChanged = !!design?.scene_order && JSON.stringify(design.scene_order) !== JSON.stringify(JSON.parse(saved || '{}')?.scene_order || null);
  const [learnOrder, setLearnOrder] = useState(true);
  const save = async (andRender = false) => {
    setBusy(andRender ? 'render' : 'save'); setMsg('');
    try {
      const r = await api(`/api/contents/${params.id}`, { video_edit: { design, learn_order: orderChanged && learnOrder } }, 'PATCH');
      if (r?.learned_order) setMsg(`장면 순서를 다음 대사의 기본 순서로 저장했습니다: ${r.learned_order.join(' → ')}`);
      if ((bgmId ?? null) !== (c.bgm_id ?? null) && mayRender) await api(`/api/contents/${params.id}`, { bgm_id: bgmId }, 'PATCH');
      setSaved(JSON.stringify(design));
      if (andRender) {
        await api('/api/render', { contentId: params.id });
        setMsg('저장했고 렌더를 시작했습니다 (보통 3~6분). 끝나면 작업대에서 새 영상을 확인하세요.');
      } else if (!r?.learned_order) setMsg(mayRender ? '저장했습니다. 영상 파일에 반영하려면 [저장 + 다시 렌더]를 누르세요.' : '저장했습니다. 렌더 권한이 있는 사람이 다시 렌더하면 영상에 반영됩니다.');
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
  const news = design.template === 'news';
  const LAYOUTS = news ? NEWS_LAYOUTS : CLASSIC_LAYOUTS;
  const sceneDur = props.scenes[sel]?.durationSec || 3;

  return (
    <div id="tpf-editor">
      {fontHrefs().map((h) => <link key={h} rel="stylesheet" href={h} />)}
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
            <div key={s.id} className={`sc-row ${dragFrom === i ? 'dragging' : ''}`} draggable
              onDragStart={() => setDragFrom(i)} onDragEnd={() => setDragFrom(null)}
              onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragFrom != null) moveScene(dragFrom, i); setDragFrom(null); }}>
              <button className={i === sel ? 'on' : ''} onClick={() => pick(i)}>
                <b>{i + 1}</b> <span className="mute">{LAYOUTS.find((l) => l[0] === s.layout)?.[1] || s.layout} · {props.scenes.find((x: any) => x.id === s.id)?.durationSec.toFixed(1)}초</span>
                <div className="t">{s.layout === 'stat' && s.value ? `${s.value}${s.unit || ''} ` : ''}{s.headline || '(제목 없음)'}</div>
              </button>
              <div className="sc-move">
                <button title="앞으로" disabled={i === 0} onClick={() => moveScene(i, i - 1)}>▲</button>
                <button title="뒤로" disabled={i === design.scenes.length - 1} onClick={() => moveScene(i, i + 1)}>▼</button>
              </div>
            </div>
          ))}
          <p className="mute" style={{ fontSize: 11, margin: '6px 2px' }}>끌어서 놓거나 ▲▼ 로 장면 순서를 바꿉니다.</p>
          {orderChanged && (
            <label className="row" style={{ gap: 4, fontSize: 12, background: '#fff9ec', border: '1px solid #f0c36d', borderRadius: 8, padding: 6 }}>
              <input type="checkbox" checked={learnOrder} onChange={(e) => setLearnOrder(e.target.checked)} /> 저장할 때 이 순서를 다음 대사의 기본 순서로
            </label>
          )}
        </div>

        {/* 미리보기 */}
        <div>
          <Preview handle={pv} props={props} drag={drag} onMove={onMove} onFrame={onFrame} />
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={drag} onChange={(e) => setDrag(e.target.checked)} /> 화면에서 끌어서 이동</label>
            <select value={el} onChange={(e) => { setEl(e.target.value as ElKey); setTab('el'); }}>
              {elsOf(g, news).map((k) => <option key={k} value={k}>{EL_LABEL[k]}</option>)}
            </select>
            <span className="mute">{drag ? '방향키 1px · Shift+방향키 10px' : '체크하면 선택한 요소를 마우스로 옮깁니다'}</span>
          </div>
          {narr !== (sc?.narration || '') && <p className="mute" style={{ textAlign: 'center' }}>🔊 이 장면 대사를 바꿨습니다 — 미리보기는 예상 길이, 다시 렌더할 때 새 목소리로 만듭니다.</p>}
        </div>

        {/* 속성 패널 */}
        <div className="ed-panel card">
          <div className="tabs">
            {([['scene', '장면'], ['el', '요소'], ['layers', '모션'], ['caption', '자막'], ['all', '스타일·전체']] as const).map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === 'scene' && (
            <div className="ed-form">
              <Field label="구성"><select value={g.layout} onChange={(e) => setScene((s) => { s.layout = e.target.value; })}>{LAYOUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              {news ? (
                <>
                  <div className="row">
                    {['breaking', 'hook', 'document'].includes(g.layout) && <Field label="태그"><input value={g.tag || ''} placeholder={g.layout === 'document' ? '공고' : '속보'} onChange={(e) => setScene((s) => { s.tag = e.target.value || undefined; })} style={{ width: 90 }} /></Field>}
                    <Field label="머리말 (기관·분류)"><input value={g.kicker || ''} placeholder="예: 중소벤처기업진흥공단" onChange={(e) => setScene((s) => { s.kicker = e.target.value || undefined; })} style={{ width: 200 }} /></Field>
                  </div>
                  <Field label="출처 (숫자가 나오면 꼭 · 기관 + 문서명)"><input value={g.source || ''} placeholder="예: 중진공 2026년 시설자금 공고" onChange={(e) => setScene((s) => { s.source = e.target.value || undefined; })} /></Field>
                  {g.layout === 'stat' && <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={g.motion !== 'none'} onChange={(e) => setScene((s) => { s.motion = e.target.checked ? undefined : 'none'; })} /> 숫자 카운트업</label>}
                  <MediaField contentId={params.id} media={g.media} layout={g.layout} canUpload={true}
                    set={(m, lay) => setScene((s) => { if (m) s.media = m; else delete s.media; if (lay) s.layout = lay; })} />
                </>
              ) : (
                <>
                  <Field label="움직임"><select value={g.motion || 'pop'} onChange={(e) => setScene((s) => { s.motion = e.target.value; })}>{MOTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field label="아이콘(이모지)"><input value={g.icon || ''} onChange={(e) => setScene((s) => { s.icon = e.target.value || undefined; })} placeholder="예: 🚨 (비우면 없음)" /></Field>
                </>
              )}
              {g.layout === 'stat' && (
                <div className="row">
                  <Field label="숫자"><input value={g.value || ''} onChange={(e) => setScene((s) => { s.value = e.target.value; })} style={{ width: 110 }} /></Field>
                  <Field label="단위"><input value={g.unit || ''} onChange={(e) => setScene((s) => { s.unit = e.target.value; })} style={{ width: 70 }} /></Field>
                </div>
              )}
              <Field label="제목 (줄바꿈 가능)"><textarea className="txt" rows={2} value={g.headline || ''} onChange={(e) => setScene((s) => { s.headline = e.target.value; })} /></Field>
              <Field label="강조 단어 (쉼표로 구분 · 강조색으로 표시)"><input value={(g.emphasis || []).join(', ')} onChange={(e) => setScene((s) => { s.emphasis = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); })} /></Field>
              <Field label="부제"><textarea className="txt" rows={2} value={g.sub || ''} onChange={(e) => setScene((s) => { s.sub = e.target.value || undefined; })} /></Field>
              {['list', 'compare', 'document', 'timeline'].includes(g.layout) && (
                <Field label={g.layout === 'compare' ? '비교 칸 2줄 "라벨|내용" (두 번째가 강조)' : g.layout === 'timeline' ? '일정 "날짜|내용" 한 줄에 하나 (마지막 = 마감)' : g.layout === 'document' ? '공고 요약 줄 (강조 단어가 든 줄에 형광펜)' : '목록 (한 줄에 하나)'}>
                  <textarea className="txt" rows={4} value={(g.items || []).join('\n')} onChange={(e) => setScene((s) => { s.items = e.target.value.split('\n'); })} onBlur={() => setScene((s) => { s.items = (s.items || []).map((x: string) => x.trim()).filter(Boolean); })} />
                </Field>
              )}
              {g.layout === 'cta' && <Field label="버튼 문구"><input value={g.cta || ''} onChange={(e) => setScene((s) => { s.cta = e.target.value || undefined; })} placeholder={news ? "고정 댓글 링크에서 30초 확인" : "👇 고정 댓글 · 프로필 링크"} /></Field>}
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
                <div className="row">{elsOf(g, news).map((k) => <button key={k} className={k === el ? 'pri' : ''} onClick={() => setEl(k)}>{EL_LABEL[k]}</button>)}</div>
              </Field>
              <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!!E.hidden} onChange={(e) => setEl_(el, { hidden: e.target.checked || undefined })} /> 이 장면에서 숨기기</label>
              {el !== 'icon' && (
                <>
                  <Field label="글자색"><Color value={E.color || (el === 'stat' ? design.theme.accent : el === 'sub' ? design.theme.sub : el === 'cta' ? design.theme.bg : el === 'caption' ? cap.color || '#ffffff' : design.theme.text)} onChange={(v) => setEl_(el, { color: v })} /></Field>
                  {(el === 'items' || el === 'cta' || el === 'caption') && <Field label="칸 배경색"><Color value={E.bg || (el === 'cta' ? design.theme.accent : '#1a2a55')} onChange={(v) => setEl_(el, { bg: v })} /></Field>}
                  <Field label="글꼴"><FontSelect value={E.font || ''} fallback={el === 'caption' ? cap.font || design.fonts.body : elFont} onChange={(v) => setEl_(el, { font: v || undefined })} /></Field>
                  <div className="row">
                    <Field label="굵기"><WeightSelect font={E.font || (el === 'caption' ? cap.font || design.fonts.body : elFont)} value={E.weight} onChange={(v) => setEl_(el, { weight: v })} allowDefault="기본" /></Field>
                    <Field label="정렬"><Seg value={E.align} options={[['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']]} onChange={(v) => setEl_(el, { align: v })} /></Field>
                  </div>
                  <Field label={`자간 ${(E.letterSpacing ?? 0).toFixed(3)}em`}><input type="range" min={-0.1} max={0.3} step={0.005} value={E.letterSpacing ?? 0} onChange={(e) => setEl_(el, { letterSpacing: Number(e.target.value) || undefined })} /></Field>
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
            <CaptionPanel design={design} change={change} scene={g} setScene={setScene} capLines={capLines} sceneCaptions={g.captions} defaultCaptions={sc.captions || []} />
          )}

          {tab === 'layers' && (
            <LayerPanel contentId={params.id} scene={g} setScene={setScene} sel={selLayer} setSel={(id) => { setSelLayer(id); if (id) setDrag(true); }} narration={narr} durationSec={sceneDur} design={design} onMsg={setMsg} />
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
              <StylePanel contentId={params.id} design={design} change={change} styleKey={styleKey} setStyleKey={setStyleKey} onMsg={setMsg} />
              <hr />
              <Field label="브랜드 문구 (채널 표시 기본값)"><input value={design.brand_text || ''} placeholder="오늘의 정책자금" onChange={(e) => change((d) => { d.brand_text = e.target.value || undefined; })} /></Field>
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
        #tpf-editor .ed-grid{display:grid;grid-template-columns:190px minmax(300px,1fr) 380px;gap:14px;align-items:start}
        #tpf-editor .ed-scenes{display:grid;gap:6px;max-height:calc(100vh - 150px);overflow:auto}
        #tpf-editor .ed-scenes .sc-row{display:grid;grid-template-columns:1fr 26px;gap:3px;align-items:stretch}
        #tpf-editor .ed-scenes .sc-row.dragging{opacity:.4}
        #tpf-editor .ed-scenes .sc-row>button{text-align:left;padding:8px 10px;cursor:grab}
        #tpf-editor .ed-scenes .sc-move{display:grid;gap:3px}
        #tpf-editor .ed-scenes .sc-move button{padding:0;font-size:10px;line-height:1}
        #tpf-editor .ed-scenes .sc-row>button.on{border-color:var(--pri);background:#eef2ff}
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
        #tpf-editor .seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--line);border-radius:8px;overflow:hidden}
        #tpf-editor .seg button{border:0;border-radius:0;border-right:1px solid var(--line);padding:5px 8px;font-size:12px}
        #tpf-editor .seg button:last-child{border-right:0}
        #tpf-editor .seg button.on{background:var(--pri);color:#fff}
        #tpf-editor .ai-box{display:grid;gap:6px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:10px}
        #tpf-editor .layer-list{display:grid;gap:4px}
        #tpf-editor .layer-list button{text-align:left;font-size:12px;padding:6px 8px}
        #tpf-editor .layer-list button.on{border-color:var(--pri);background:#eef2ff}
        #tpf-editor textarea.mono{font-family:ui-monospace,monospace;font-size:11px}
        #tpf-editor .hint{font-size:11px;color:var(--mute)}
        #tpf-editor .font-row{display:grid;grid-template-columns:1fr 130px;gap:6px;align-items:end}
        #tpf-editor .ed-form input[type=number]{padding:4px 6px}
        #tpf-editor .ed-ph{aspect-ratio:9/16;max-width:400px;margin:0 auto;display:grid;place-items:center;background:#0b1b3f;color:#fff;border-radius:12px}
        @media (max-width:1200px){#tpf-editor .ed-grid{grid-template-columns:1fr}#tpf-editor .ed-scenes{grid-auto-flow:column;grid-auto-columns:160px;overflow-x:auto}#tpf-editor .ed-panel{position:static;max-height:none}}
      `}</style>
    </div>
  );
}
