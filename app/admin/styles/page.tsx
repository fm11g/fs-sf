'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { can } from '@/lib/perms';
import { fontHrefs } from '@/lib/fonts';
import { applyStyle, cleanStyle, type StyleSpec } from '@/lib/video-style';
import { SAMPLE_SCENES, SAMPLE_SCRIPT } from '@/lib/video-sample';
import { buildProps } from '@/worker/video/props';
import { sceneStarts } from '@/worker/video/common';
import { useMe } from '../MeContext';
import { Color, Field, FontSelect, Seg, WeightSelect } from '../contents/[id]/editor/controls';
import type { PreviewHandle } from '../contents/[id]/editor/Preview';

const Preview = dynamic(() => import('../contents/[id]/editor/Preview'), { ssr: false, loading: () => <div className="ph">미리보기 불러오는 중…</div> });

/** 캡처를 1080 폭 JPEG 로 줄여 data URL 로 (업로드 용량 줄이기) */
function shrink(file: File): Promise<string> {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, 1080 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = no;
    img.src = URL.createObjectURL(file);
  });
}

const THEME_KEYS: [string, string][] = [['bg', '바탕 위'], ['bg2', '바탕 아래'], ['accent', '브랜드'], ['alert', '속보 빨강'], ['text', '글자'], ['sub', '보조 글자'], ['surface', '카드'], ['ink', '카드 글자']];

export default function Styles() {
  const me = useMe();
  const work = can(me, 'styles', 'work');
  const [list, setList] = useState<any[]>([]);
  const [def, setDef] = useState('');
  const [cur, setCur] = useState<{ key?: string; name: string; desc?: string; style: StyleSpec; images?: string[]; source?: any; builtin?: boolean } | null>(null);
  const [imgs, setImgs] = useState<string[]>([]);
  const [links, setLinks] = useState('');
  const [refId, setRefId] = useState('');
  const [refs, setRefs] = useState<any[]>([]);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [json, setJson] = useState<string | null>(null);
  const pv = useRef<PreviewHandle | null>(null);

  const load = () => api('/api/styles').then((d) => { setList(d.styles); setDef(d.defaultKey); if (!cur) { const s = d.styles.find((x: any) => x.key === d.defaultKey) || d.styles[0]; setCur({ ...s }); } });
  useEffect(() => { load(); api('/api/references').then((d) => setRefs((d.refs || []).filter((r: any) => r.status === 'ready' && r.frames?.length))).catch(() => {}); }, []);

  const props = useMemo(() => {
    if (!cur) return null;
    const design = applyStyle({ scenes: SAMPLE_SCENES, caption: { label: '정책자금 브리핑' }, chrome: { tickerText: '제조업 시설자금 11월 20일 접수 시작 · 중진공 공고' } }, cur.style, { keepCaptionLabel: !cur.style.caption.label });
    const p = buildProps({ script: SAMPLE_SCRIPT, design }, { brand: '오늘의 정책자금', dateLabel: '11월 14일', audio: [], bgmUrl: null });
    p.scenes.forEach((s) => (s.durationSec = 3.2));
    return p;
  }, [cur]);
  const starts = useMemo(() => (props ? sceneStarts(props) : []), [props]);

  const set = (fn: (s: StyleSpec) => void) => setCur((c) => { if (!c) return c; const s = JSON.parse(JSON.stringify(c.style)); fn(s); return { ...c, style: cleanStyle(s) }; });

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, 6 - imgs.length)) if (f.type.startsWith('image/')) out.push(await shrink(f));
    setImgs((x) => [...x, ...out].slice(0, 6));
  };
  const analyze = async () => {
    setBusy('analyze'); setMsg(''); setNotes([]);
    try {
      const r = await api('/api/styles/analyze', { images: imgs, links: links.split(/\s+/).filter(Boolean), ref_id: refId || undefined, hint });
      setCur({ name: r.name || '레퍼런스 스타일', desc: r.style.notes, style: r.style, images: r.images, source: { kind: imgs.length ? 'image' : refId ? 'ref' : 'youtube', urls: links.split(/\s+/).filter(Boolean), ref_id: refId || undefined } });
      setNotes(r.notes || []);
      setMsg(`분석 완료 (${r.model}) — 아래 미리보기에서 확인하고, 색·폰트를 다듬은 뒤 [스타일 저장]을 누르세요.`);
    } catch (e: any) { setMsg(`⚠ ${e.message}`); }
    setBusy('');
  };
  const save = async (asNew = false) => {
    if (!cur) return;
    const name = asNew || cur.builtin ? prompt('스타일 이름', cur.builtin ? `${cur.name} (수정)` : cur.name) : cur.name;
    if (!name) return;
    setBusy('save');
    try {
      const r = await api('/api/styles', { action: 'save', key: asNew || cur.builtin ? undefined : cur.key, name, desc: cur.desc || cur.style.notes, style: cur.style, images: cur.images, source: cur.source });
      setCur({ ...cur, key: r.key, name, builtin: false }); setMsg(`"${name}" 저장했습니다.`); load();
    } catch (e: any) { setMsg(`⚠ ${e.message}`); }
    setBusy('');
  };
  const makeDefault = async (key: string) => { await api('/api/styles', { action: 'default', key }); setDef(key); setMsg('기본 스타일로 지정했습니다 — 다음 디자인 단계부터 이 스타일로 만듭니다.'); };
  const del = async (key: string) => { if (!confirm('이 스타일을 지울까요?')) return; await api('/api/styles', { action: 'delete', key }); if (cur?.key === key) setCur(null); load(); };

  const st = cur?.style;
  return (
    <div id="tpf-styles">
      {fontHrefs().map((h) => <link key={h} rel="stylesheet" href={h} />)}
      <h1>영상 스타일</h1>
      <p className="mute" style={{ marginTop: -8 }}>
        마음에 드는 숏폼 채널의 <b>캡처</b>나 <b>링크</b>를 주면 Claude 가 색·폰트·굵기·자막 모양·화면 구성·모션 성향을 뽑아 스타일로 만듭니다.
        <b> 기본 스타일</b>로 지정하면 디자인 단계가 그 스타일로 영상을 만들고, 작업대·편집기에서 콘텐츠마다 바꿀 수도 있습니다.
      </p>
      {msg && <div className="card" style={{ padding: 10 }}>{msg}</div>}

      <div className="layout">
        <div>
          {work && (
            <div className="card">
              <h2>레퍼런스로 새 스타일 만들기</h2>
              <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }} onPaste={(e) => addFiles(e.clipboardData.files)} tabIndex={0}>
                <input type="file" accept="image/*" multiple onChange={(e) => addFiles(e.target.files)} />
                <span>캡처를 끌어다 놓거나 붙여넣기(Ctrl+V) · 최대 6장 · 같은 채널의 여러 장면일수록 정확</span>
              </div>
              {imgs.length > 0 && <div className="thumbs">{imgs.map((u, i) => <span key={i}><img src={u} alt="" /><button onClick={() => setImgs(imgs.filter((_, j) => j !== i))}>✕</button></span>)}</div>}
              <Field label="링크 (유튜브 쇼츠 · 이미지 주소 · 여러 개는 줄바꿈)"><textarea className="txt" rows={2} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://youtube.com/shorts/…" /></Field>
              {refs.length > 0 && (
                <Field label="또는 분석이 끝난 참고 영상의 프레임으로 (가장 정확)">
                  <select value={refId} onChange={(e) => setRefId(e.target.value)}><option value="">선택 안 함</option>{refs.map((r) => <option key={r.id} value={r.id}>#{r.id} {r.title || r.url}</option>)}</select>
                </Field>
              )}
              <Field label="원하는 느낌 메모 (선택)"><input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="예: YTN 처럼 공식적으로, 자막은 하단 흰 띠" /></Field>
              <button className="pri" disabled={!!busy || (!imgs.length && !links.trim() && !refId)} onClick={analyze}>{busy === 'analyze' ? 'Claude 가 분석 중… (최대 1분)' : '스타일 분석'}</button>
              {notes.map((n) => <p key={n} className="mute" style={{ margin: '6px 0 0' }}>ⓘ {n}</p>)}
              <p className="mute" style={{ marginBottom: 0 }}>유튜브 링크는 썸네일 한 장만 볼 수 있어 대략적입니다. 정확하게 하려면 [참고 영상]에 등록해 프레임 분석을 마친 뒤 위 목록에서 고르세요. 인스타그램은 로그인이 필요해 캡처를 올려 주세요.</p>
            </div>
          )}

          <div className="card">
            <h2>스타일 목록</h2>
            {list.map((s) => (
              <div key={s.key} className={`sty ${cur?.key === s.key ? 'on' : ''}`} onClick={() => setCur({ ...s })}>
                <div className="sw">{['bg', 'accent', 'alert', 'text'].map((k) => <i key={k} style={{ background: s.style.theme[k] }} />)}</div>
                <div style={{ flex: 1 }}>
                  <b style={{ fontFamily: `'${s.style.fonts.title}'`, fontWeight: s.style.fonts.titleWeight }}>{s.name}</b> {s.key === def && <span className="tag approved">기본</span>} {!s.builtin && <span className="mute">내 스타일</span>}
                  <div className="mute">{s.desc || s.style.notes}</div>
                </div>
                {work && s.key !== def && <button onClick={(e) => { e.stopPropagation(); makeDefault(s.key); }}>기본으로</button>}
                {work && !s.builtin && <button onClick={(e) => { e.stopPropagation(); del(s.key); }}>삭제</button>}
              </div>
            ))}
          </div>
        </div>

        {cur && st && props && (
          <div className="card preview">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{cur.name}</h2>
              {work && <div className="row"><button onClick={() => save(true)} disabled={!!busy}>새 이름으로 저장</button><button className="pri" onClick={() => save(false)} disabled={!!busy}>{cur.builtin ? '복사해서 저장' : '스타일 저장'}</button></div>}
            </div>
            <div className="pv-grid">
              <div>
                <Preview handle={pv} props={props} drag={false} onMove={() => {}} />
                <div className="row jump">{SAMPLE_SCENES.map((s: any, i: number) => <button key={s.id} onClick={() => pv.current?.seek(starts[i] + 40)}>{s.layout}</button>)}</div>
              </div>
              <div className="ed-form">
                {cur.images?.length ? <div className="thumbs small">{cur.images.map((u) => <img key={u} src={u} alt="" />)}</div> : null}
                {st.notes && <p style={{ margin: 0 }}>{st.notes}</p>}
                {st.rules?.length ? <ul className="rules">{st.rules.map((r) => <li key={r}>{r}</li>)}</ul> : null}
                <Field label="템플릿"><Seg value={st.template} options={[['news', '언론사'], ['classic', '기본(예전)']]} onChange={(v) => set((s) => { s.template = v; })} /></Field>
                <div className="colors">{THEME_KEYS.map(([k, l]) => <Field key={k} label={l}><Color value={(st.theme as any)[k] || '#ffffff'} onChange={(v) => set((s) => { (s.theme as any)[k] = v; })} /></Field>)}</div>
                <div className="fr"><Field label="제목 글꼴"><FontSelect value={st.fonts.title} onChange={(v) => set((s) => { s.fonts.title = v; })} /></Field><Field label="굵기"><WeightSelect font={st.fonts.title} value={st.fonts.titleWeight} onChange={(v) => set((s) => { s.fonts.titleWeight = v; })} /></Field></div>
                <div className="fr"><Field label="본문 글꼴"><FontSelect value={st.fonts.body} onChange={(v) => set((s) => { s.fonts.body = v; })} /></Field><Field label="굵기"><WeightSelect font={st.fonts.body} value={st.fonts.bodyWeight} onChange={(v) => set((s) => { s.fonts.bodyWeight = v; })} /></Field></div>
                <div className="fr"><Field label="자막 글꼴"><FontSelect value={st.caption.font || ''} onChange={(v) => set((s) => { s.caption.font = v; })} /></Field><Field label="굵기"><WeightSelect font={st.caption.font} value={st.caption.weight} onChange={(v) => set((s) => { s.caption.weight = v; })} /></Field></div>
                <Field label="자막 모양"><Seg value={st.caption.box as any} options={[['lower', '하단 자막'], ['bar', '띠'], ['box', '박스'], ['none', '글자만']]} onChange={(v) => set((s) => { s.caption.box = v; })} /></Field>
                <div className="row">
                  <Field label="자막 바탕"><Color value={(st.caption.bg || '#000000').slice(0, 7)} onChange={(v) => set((s) => { s.caption.bg = v; })} /></Field>
                  <Field label="자막 글자"><Color value={st.caption.color || '#FFFFFF'} onChange={(v) => set((s) => { s.caption.color = v; })} /></Field>
                  <Field label="라벨"><input value={st.caption.label || ''} onChange={(e) => set((s) => { s.caption.label = e.target.value; })} style={{ width: 120 }} placeholder="없음" /></Field>
                </div>
                <div className="row">
                  {([['ticker', '티커'], ['grid', '격자'], ['source', '출처'], ['progress', '진행선']] as const).map(([k, l]) => <label key={k} className="row" style={{ gap: 4 }}><input type="checkbox" checked={k === 'ticker' || k === 'grid' ? !!st.chrome[k] : st.chrome[k] !== false} onChange={(e) => set((s) => { (s.chrome as any)[k] = e.target.checked; })} /> {l}</label>)}
                </div>
                <p className="mute" style={{ margin: 0 }}>자막 크기·정렬·애니메이션 같은 세부는 저장 후 영상 편집기 [자막] 탭에서도 조정할 수 있습니다.</p>
                <a href="#" className="mute" onClick={(e) => { e.preventDefault(); setJson(json == null ? JSON.stringify(st, null, 1) : null); }}>{json == null ? '전체 값 JSON 으로 고치기' : 'JSON 닫기'}</a>
                {json != null && <><textarea className="txt mono" rows={12} value={json} onChange={(e) => setJson(e.target.value)} /><button onClick={() => { try { setCur({ ...cur, style: cleanStyle(JSON.parse(json)) }); setMsg('JSON 적용'); } catch { setMsg('⚠ JSON 형식을 확인하세요'); } }}>JSON 적용</button></>}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        #tpf-styles .layout{display:grid;grid-template-columns:420px 1fr;gap:14px;align-items:start}
        #tpf-styles .drop{border:2px dashed var(--line);border-radius:12px;padding:16px;display:grid;gap:8px;text-align:center;color:var(--mute);font-size:13px;margin-bottom:10px}
        #tpf-styles .drop:focus{border-color:var(--pri)}
        #tpf-styles .thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
        #tpf-styles .thumbs span{position:relative}
        #tpf-styles .thumbs img{height:110px;border-radius:6px;display:block}
        #tpf-styles .thumbs.small img{height:70px}
        #tpf-styles .thumbs button{position:absolute;top:2px;right:2px;padding:0 6px;font-size:11px}
        #tpf-styles .sty{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer}
        #tpf-styles .sty.on{border-color:var(--pri);background:#eef2ff}
        #tpf-styles .sw{display:grid;grid-template-columns:repeat(2,16px);gap:2px}
        #tpf-styles .sw i{width:16px;height:16px;border-radius:3px;border:1px solid rgba(0,0,0,.1)}
        #tpf-styles .pv-grid{display:grid;grid-template-columns:minmax(260px,380px) 1fr;gap:16px;margin-top:12px}
        #tpf-styles .jump{gap:4px;margin-top:6px;justify-content:center}
        #tpf-styles .jump button{font-size:11px;padding:3px 7px}
        #tpf-styles .ed-form{display:grid;gap:10px;align-content:start}
        #tpf-styles label.f{display:grid;gap:4px;font-size:12px;color:var(--mute)}
        #tpf-styles .colors{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        #tpf-styles .fr{display:grid;grid-template-columns:1fr 140px;gap:6px}
        #tpf-styles .seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--line);border-radius:8px;overflow:hidden}
        #tpf-styles .seg button{border:0;border-radius:0;border-right:1px solid var(--line);padding:5px 9px;font-size:12px}
        #tpf-styles .seg button.on{background:var(--pri);color:#fff}
        #tpf-styles .rules{margin:0;padding-left:18px;font-size:13px}
        #tpf-styles textarea.mono{font-family:ui-monospace,monospace;font-size:11px}
        #tpf-styles .ph{aspect-ratio:9/16;background:#0b1424;border-radius:12px;display:grid;place-items:center;color:#fff}
        @media (max-width:1200px){#tpf-styles .layout,#tpf-styles .pv-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
