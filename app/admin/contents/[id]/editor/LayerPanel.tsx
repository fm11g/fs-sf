'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cleanLayers } from '@/lib/video-style';
import type { Layer } from '@/worker/video/common';
import { Color, Field, FontSelect, Num, Seg, WeightSelect } from './controls';

const TYPE_LABEL: Record<Layer['type'], string> = { text: '글자', tag: '태그(색 띠 글자)', box: '사각형', line: '선', highlight: '형광펜', counter: '숫자 카운터', bar: '막대 그래프', image: '이미지', emoji: '이모지' };
const PRESET_LABEL: [string, string][] = [['none', '없음'], ['fade', '페이드'], ['slideUp', '아래→위'], ['slideDown', '위→아래'], ['slideLeft', '오른쪽→왼쪽'], ['slideRight', '왼쪽→오른쪽'], ['wipeRight', '와이프 →'], ['wipeLeft', '와이프 ←'], ['wipeDown', '와이프 ↓'], ['wipeUp', '와이프 ↑'], ['scale', '살짝 커지기'], ['pop', '팝'], ['blurIn', '흐림→선명'], ['typewriter', '타자'], ['countUp', '숫자 올라가기'], ['grow', '자라기(막대·선)']];
const EASES: [string, string][] = [['out', '부드럽게 멈춤'], ['expo', '빠르게→천천히'], ['inOut', '천천히-빠르게-천천히'], ['back', '살짝 넘쳤다 돌아옴'], ['linear', '일정'], ['in', '점점 빠르게']];

const NEW: Record<string, () => Partial<Layer>> = {
  text: () => ({ type: 'text', text: '새 글자', x: 72, y: 1200, style: { size: 56, weight: 700 }, in: { preset: 'slideUp', at: 0.6, dur: 0.45, ease: 'expo' } }),
  tag: () => ({ type: 'tag', text: '단독', x: 72, y: 1200, in: { preset: 'wipeRight', at: 0.6, dur: 0.3 } }),
  line: () => ({ type: 'line', x: 72, y: 1180, w: 420, h: 10, style: { bg: '#D6282E' }, in: { preset: 'grow', at: 0.7, dur: 0.4 } }),
  highlight: () => ({ type: 'highlight', x: 66, y: 980, w: 520, h: 46, in: { preset: 'grow', at: 0.7, dur: 0.5 }, z: 0 }),
  counter: () => ({ type: 'counter', value: 100, suffix: '%', x: 72, y: 1180, style: { size: 96, weight: 800, color: '#FFD54A' }, in: { preset: 'countUp', at: 0.7, dur: 0.8 } }),
  bar: () => ({ type: 'bar', value: 70, x: 72, y: 1220, w: 900, h: 26, in: { preset: 'grow', at: 0.7, dur: 0.7 } }),
  box: () => ({ type: 'box', x: 72, y: 1150, w: 936, h: 180, style: { bg: 'rgba(255,255,255,0.08)', radius: 6 }, in: { preset: 'fade', at: 0.5, dur: 0.4 }, z: 0 }),
};

export default function LayerPanel({ contentId, scene, setScene, sel, setSel, narration, durationSec, design, onMsg }: {
  contentId: string; scene: any; setScene: (fn: (s: any) => void) => void; sel: string | null; setSel: (id: string | null) => void;
  narration: string; durationSec: number; design: any; onMsg: (m: string) => void;
}) {
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState<string | null>(null);
  const layers: Layer[] = scene?.layers || [];
  const L = layers.find((l) => l.id === sel);
  const upd = (patch: (l: any) => void) => setScene((s) => { const l = (s.layers || []).find((x: any) => x.id === sel); if (l) patch(l); });
  const st = (k: string, v: any) => upd((l) => { l.style = { ...(l.style || {}) }; if (v === undefined || v === '') delete l.style[k]; else l.style[k] = v; });
  const anim = (which: 'in' | 'out', k: string, v: any) => upd((l) => { l[which] = { ...(l[which] || { preset: 'none' }), [k]: v }; });

  const add = (type: string) => {
    const id = `L${Date.now().toString(36).slice(-4)}`;
    setScene((s) => { s.layers = [...(s.layers || []), { id, ...NEW[type]() }]; });
    setSel(id);
  };
  const requestAi = async () => {
    setBusy(true);
    try {
      const r = await api(`/api/contents/${contentId}/motion`, { scene, narration, duration_sec: durationSec, instruction: ask, design });
      setScene((s) => { s.layers = r.layers; if (r.hideLayout) s.hideLayout = true; else delete s.hideLayout; });
      setSel(r.layers[0]?.id || null);
      onMsg(`Claude 가 레이어 ${r.layers.length}개를 설계했습니다${r.note ? ` — ${r.note}` : ''} (${r.model}). 마음에 안 들면 Ctrl+Z.`);
    } catch (e: any) { onMsg(`⚠ ${e.message}`); }
    setBusy(false);
  };

  return (
    <div className="ed-form">
      <div className="ai-box">
        <b>Claude 에게 모션 요청</b>
        <textarea className="txt" rows={3} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="예: 60억 숫자가 카운트업되고 아래에 빨간 밑줄이 그어지게 / 출처를 하단에 작게 / 레이아웃 없이 전부 레이어로 기사 카드처럼" />
        <div className="row">
          <button className="pri" disabled={busy} onClick={requestAi}>{busy ? '설계 중… (최대 1분)' : '이 장면 모션 설계'}</button>
          <span className="mute">지금 레이어를 바꿉니다 · 모델은 [AI 모델 → Claude 모션그래픽 설계]</span>
        </div>
      </div>

      <hr />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>레이어 {layers.length}개</b>
        <select value="" onChange={(e) => e.target.value && add(e.target.value)}>
          <option value="">+ 레이어 추가</option>
          {Object.keys(NEW).map((t) => <option key={t} value={t}>{TYPE_LABEL[t as Layer['type']]}</option>)}
        </select>
      </div>
      <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!!scene?.hideLayout} onChange={(e) => setScene((s) => { if (e.target.checked) s.hideLayout = true; else delete s.hideLayout; })} /> 레이아웃 숨기고 레이어만 보이기</label>
      <div className="layer-list">
        {layers.map((l) => (
          <button key={l.id} className={l.id === sel ? 'on' : ''} onClick={() => setSel(l.id)}>
            <span className="mute">{TYPE_LABEL[l.type]}</span> {l.text || (l.type === 'counter' ? `${l.prefix || ''}${l.value}${l.suffix || ''}` : l.type === 'bar' ? `${l.value}%` : '')}{l.hidden ? ' (숨김)' : ''}
            <span className="mute" style={{ float: 'right' }}>{(l.in?.at ?? 0).toFixed(1)}s</span>
          </button>
        ))}
        {!layers.length && <p className="mute">레이어가 없습니다. Claude 에게 요청하거나 직접 추가하세요.</p>}
      </div>

      {L && (
        <>
          <hr />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{TYPE_LABEL[L.type]} · {L.id}</b>
            <div className="row" style={{ gap: 4 }}>
              <button onClick={() => { const id = `${L.id}c`; setScene((s) => { s.layers = [...s.layers, { ...JSON.parse(JSON.stringify(L)), id, y: L.y + 80 }]; }); setSel(id); }}>복제</button>
              <button onClick={() => upd((l) => { l.hidden = !l.hidden; })}>{L.hidden ? '보이기' : '숨기기'}</button>
              <button onClick={() => { setScene((s) => { s.layers = s.layers.filter((x: any) => x.id !== L.id); }); setSel(null); }}>삭제</button>
            </div>
          </div>
          {['text', 'tag', 'emoji'].includes(L.type) && <Field label="글자 (줄바꿈 가능)"><textarea className="txt" rows={2} value={L.text || ''} onChange={(e) => upd((l) => { l.text = e.target.value; })} /></Field>}
          {L.type === 'image' && <Field label="이미지 주소 (https://…)"><input value={L.src || ''} onChange={(e) => upd((l) => { l.src = e.target.value; })} /></Field>}
          {(L.type === 'counter' || L.type === 'bar') && (
            <div className="row">
              <Field label={L.type === 'bar' ? '값 (0~100)' : '최종 숫자'}><input type="number" value={L.value ?? 0} onChange={(e) => upd((l) => { l.value = Number(e.target.value); })} style={{ width: 90 }} /></Field>
              {L.type === 'counter' && <>
                <Field label="시작 숫자"><input type="number" value={L.from ?? 0} onChange={(e) => upd((l) => { l.from = Number(e.target.value); })} style={{ width: 80 }} /></Field>
                <Field label="앞"><input value={L.prefix || ''} onChange={(e) => upd((l) => { l.prefix = e.target.value; })} style={{ width: 50 }} /></Field>
                <Field label="뒤"><input value={L.suffix || ''} onChange={(e) => upd((l) => { l.suffix = e.target.value; })} style={{ width: 60 }} /></Field>
                <Field label="소수"><input type="number" min={0} max={3} value={L.decimals ?? 0} onChange={(e) => upd((l) => { l.decimals = Number(e.target.value); })} style={{ width: 50 }} /></Field>
              </>}
            </div>
          )}
          <div className="row">
            <Field label="가로 x"><input type="number" value={Math.round(L.x)} onChange={(e) => upd((l) => { l.x = Number(e.target.value); })} style={{ width: 80 }} /></Field>
            <Field label="세로 y"><input type="number" value={Math.round(L.y)} onChange={(e) => upd((l) => { l.y = Number(e.target.value); })} style={{ width: 80 }} /></Field>
            <Field label="폭 w"><input type="number" value={L.w ?? ''} placeholder="자동" onChange={(e) => upd((l) => { l.w = e.target.value === '' ? undefined : Number(e.target.value); })} style={{ width: 80 }} /></Field>
            <Field label="높이 h"><input type="number" value={L.h ?? ''} placeholder="자동" onChange={(e) => upd((l) => { l.h = e.target.value === '' ? undefined : Number(e.target.value); })} style={{ width: 80 }} /></Field>
          </div>
          <p className="mute" style={{ margin: 0 }}>1080×1920 기준 · 안전 영역 y 290~1360 · 미리보기에서 '화면에서 끌어서 이동'으로 옮길 수 있음</p>
          <div className="row">
            <Field label="기준점"><Seg value={L.anchor || 'tl'} options={[['tl', '왼쪽 위'], ['tc', '위 가운데'], ['center', '정가운데']]} onChange={(v) => upd((l) => { l.anchor = v; })} /></Field>
            <Field label="앞뒤"><Seg value={(L.z ?? 1) <= 0 ? 'back' : 'front'} options={[['back', '레이아웃 뒤'], ['front', '앞']]} onChange={(v) => upd((l) => { l.z = v === 'back' ? 0 : 1; })} /></Field>
          </div>
          {['text', 'tag', 'counter', 'emoji'].includes(L.type) && (
            <>
              <Field label="글꼴"><FontSelect value={L.style?.font || ''} fallback={design.fonts?.body} onChange={(v) => st('font', v || undefined)} /></Field>
              <div className="row">
                <Field label="굵기"><WeightSelect font={L.style?.font || design.fonts?.body} value={L.style?.weight} onChange={(v) => st('weight', v)} allowDefault="기본" /></Field>
                <Field label="정렬"><Seg value={L.style?.align || 'left'} options={[['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']]} onChange={(v) => st('align', v)} /></Field>
              </div>
              <Field label="크기"><Num value={L.style?.size ?? (L.type === 'tag' ? 40 : 56)} min={10} max={400} onChange={(v) => st('size', v)} unit="px" /></Field>
              <div className="row">
                <Field label="자간 (em)"><Num value={L.style?.letterSpacing ?? 0} min={-0.2} max={0.5} step={0.005} onChange={(v) => st('letterSpacing', v)} /></Field>
                <Field label="줄 간격"><Num value={L.style?.lineHeight ?? 1.25} min={0.8} max={2.4} step={0.02} onChange={(v) => st('lineHeight', v)} /></Field>
              </div>
              <Field label="글자색"><Color value={L.style?.color || design.theme?.text || '#FFFFFF'} onChange={(v) => st('color', v)} /></Field>
            </>
          )}
          <div className="row">
            <Field label="바탕·선 색"><Color value={(L.style?.bg || '').startsWith('#') ? L.style!.bg! : '#2B6CDF'} onChange={(v) => st('bg', v)} /></Field>
            {L.style?.bg && <button onClick={() => st('bg', undefined)}>바탕 없음</button>}
            <Field label="둥글기"><Num value={L.style?.radius ?? 0} min={0} max={60} onChange={(v) => st('radius', v)} /></Field>
          </div>
          <div className="row">
            <Field label="여백 좌우"><Num value={L.style?.padX ?? 0} min={0} max={100} onChange={(v) => st('padX', v)} /></Field>
            <Field label="여백 위아래"><Num value={L.style?.padY ?? 0} min={0} max={100} onChange={(v) => st('padY', v)} /></Field>
          </div>
          <div className="row">
            <Field label="불투명"><Num value={L.style?.opacity ?? 1} min={0} max={1} step={0.05} onChange={(v) => st('opacity', v)} /></Field>
            <Field label="회전"><Num value={L.style?.rotate ?? 0} min={-45} max={45} onChange={(v) => st('rotate', v)} unit="°" /></Field>
          </div>

          <hr /><b>등장</b>
          <select value={L.in?.preset || 'none'} onChange={(e) => anim('in', 'preset', e.target.value)}>{PRESET_LABEL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <div className="row">
            <Field label="시작 (초)"><Num value={L.in?.at ?? 0} min={0} max={Math.max(1, durationSec)} step={0.05} onChange={(v) => anim('in', 'at', v)} /></Field>
            <Field label="길이 (초)"><Num value={L.in?.dur ?? 0.5} min={0} max={3} step={0.05} onChange={(v) => anim('in', 'dur', v)} /></Field>
          </div>
          <select value={L.in?.ease || 'out'} onChange={(e) => anim('in', 'ease', e.target.value)}>{EASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <b>퇴장</b>
          <select value={L.out?.preset || 'none'} onChange={(e) => anim('out', 'preset', e.target.value)}>{PRESET_LABEL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {L.out?.preset && L.out.preset !== 'none' && (
            <div className="row">
              <Field label="시작 (초 · 음수 = 끝에서)"><Num value={L.out?.at ?? -0.4} min={-3} max={Math.max(1, durationSec)} step={0.05} onChange={(v) => anim('out', 'at', v)} /></Field>
              <Field label="길이"><Num value={L.out?.dur ?? 0.35} min={0} max={3} step={0.05} onChange={(v) => anim('out', 'dur', v)} /></Field>
            </div>
          )}
          <Field label="반복 효과"><Seg value={L.loop || 'none'} options={[['none', '없음'], ['pulse', '두근'], ['float', '둥실'], ['blink', '깜빡']]} onChange={(v) => upd((l) => { l.loop = v; })} /></Field>
          <Field label="키프레임 (선택 · 시간별 이동/확대)" hint='예: [{"t":0,"scale":1},{"t":3,"scale":1.08}] · x·y 는 위치(px), opacity 0~1, rotate 도'>
            <textarea className="txt mono" rows={2} defaultValue={L.keys ? JSON.stringify(L.keys) : ''} key={`${L.id}-keys`} onBlur={(e) => { try { const v = e.target.value.trim() ? JSON.parse(e.target.value) : undefined; upd((l) => { l.keys = v; }); } catch { onMsg('⚠ 키프레임 JSON 형식을 확인하세요'); } }} />
          </Field>
        </>
      )}

      <hr />
      <a href="#" className="mute" onClick={(e) => { e.preventDefault(); setJson(json == null ? JSON.stringify(layers, null, 1) : null); }}>{json == null ? '레이어 JSON 으로 보기·고치기' : 'JSON 닫기'}</a>
      {json != null && (
        <>
          <textarea className="txt mono" rows={10} value={json} onChange={(e) => setJson(e.target.value)} />
          <button onClick={() => { try { const v = cleanLayers(JSON.parse(json)); setScene((s) => { s.layers = v; }); onMsg(`레이어 ${v.length}개 적용`); } catch { onMsg('⚠ JSON 형식을 확인하세요'); } }}>JSON 적용</button>
        </>
      )}
    </div>
  );
}
