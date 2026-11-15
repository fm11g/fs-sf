'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { applyStyle, styleFromDesign } from '@/lib/video-style';
import { Color, Field, FontSelect, Num, Seg, WeightSelect } from './controls';

const THEME_KEYS: [string, string][] = [['bg', '바탕 위'], ['bg2', '바탕 아래'], ['accent', '브랜드·강조'], ['alert', '속보·경고(빨강)'], ['text', '바탕 위 글자'], ['sub', '보조 글자'], ['surface', '카드 바탕'], ['ink', '카드 위 글자']];

/** 템플릿 · 스타일 프리셋 · 색 · 폰트(굵기) · 화면 장식 */
export default function StylePanel({ contentId, design, change, styleKey, setStyleKey, onMsg }: {
  contentId: string; design: any; change: (fn: (d: any) => void) => void; styleKey: string | null; setStyleKey: (k: string | null) => void; onMsg: (m: string) => void;
}) {
  const [list, setList] = useState<any[]>([]);
  const [def, setDef] = useState('');
  const [pick, setPick] = useState('');
  useEffect(() => { api('/api/styles').then((d) => { setList(d.styles); setDef(d.defaultKey); setPick(styleKey || design.style_key || d.defaultKey); }).catch(() => {}); }, []);
  const news = design.template === 'news';
  const ch = design.chrome || {};
  const setCh = (patch: any) => change((d) => { d.chrome = { ...(d.chrome || {}), ...patch }; });

  const apply = async () => {
    const s = list.find((x) => x.key === pick);
    if (!s) return;
    change((d) => { const n = applyStyle(d, s.style, { keepCaptionLabel: true }); Object.assign(d, n, { style_key: s.key }); });
    setStyleKey(s.key);
    try { await api(`/api/contents/${contentId}`, { style_key: s.key }, 'PATCH'); } catch { /* 디자인 저장 때 같이 */ }
    onMsg(`"${s.name}" 스타일을 적용했습니다 (장면 문구·레이어는 그대로). 저장해야 반영됩니다.`);
  };
  const saveAs = async () => {
    const name = prompt('스타일 이름', `${list.find((x) => x.key === pick)?.name || '내 스타일'} (수정)`);
    if (!name) return;
    try {
      const r = await api('/api/styles', { action: 'save', from_editor: true, name, style: styleFromDesign(design), source: { kind: 'design', content_id: contentId } });
      setList((l) => [{ key: r.key, name, style: styleFromDesign(design), builtin: false }, ...l]); setPick(r.key); setStyleKey(r.key);
      onMsg(`"${name}" 스타일로 저장했습니다. [영상 스타일]에서 기본으로 지정하면 다음 숏폼부터 이 디자인으로 만듭니다.`);
    } catch (e: any) { onMsg(`⚠ ${e.message}`); }
  };

  return (
    <div className="ed-form">
      <b>스타일 프리셋</b>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1 }}>
          {list.map((s) => <option key={s.key} value={s.key}>{s.name}{s.key === def ? ' (기본)' : ''}{s.builtin ? '' : ' · 내 스타일'}</option>)}
        </select>
        <button className="pri" onClick={apply}>적용</button>
      </div>
      <div className="row">
        <button onClick={saveAs}>지금 디자인을 스타일로 저장</button>
        <Link href="/admin/styles" target="_blank">캡처·링크로 스타일 만들기 ↗</Link>
      </div>

      <hr /><b>템플릿</b>
      <Seg value={news ? 'news' : 'classic'} options={[['news', '언론사'], ['classic', '기본(예전)']]} onChange={(v) => change((d) => { d.template = v; })} />

      <hr /><b>색</b>
      <div className="ed-colors">
        {THEME_KEYS.filter(([k]) => news || ['bg', 'bg2', 'accent', 'text', 'sub'].includes(k)).map(([k, l]) => (
          <Field key={k} label={l}><Color value={design.theme?.[k] || '#ffffff'} onChange={(v) => change((d) => { d.theme = { ...(d.theme || {}), [k]: v }; })} /></Field>
        ))}
      </div>

      <hr /><b>글꼴 · 굵기</b>
      {([['title', 'titleWeight', '제목'], ['body', 'bodyWeight', '본문'], ['number', 'numberWeight', '숫자'], ['caption', null, '자막 (자막 탭에서도 조정)']] as const).map(([k, wk, l]) => (
        <div key={k} className="font-row">
          <Field label={`${l} 글꼴`}><FontSelect value={design.fonts?.[k] || ''} fallback={k === 'number' || k === 'caption' ? design.fonts?.title || design.fonts?.body : undefined} onChange={(v) => change((d) => { d.fonts = { ...(d.fonts || {}), [k]: v || undefined }; })} /></Field>
          {wk && <Field label="굵기"><WeightSelect font={design.fonts?.[k] || design.fonts?.title} value={design.fonts?.[wk]} onChange={(v) => change((d) => { d.fonts = { ...(d.fonts || {}), [wk]: v }; })} allowDefault="기본" /></Field>}
        </div>
      ))}
      <Field label={`제목 크기 ${Math.round((design.scale?.title ?? 1) * 100)}%`}><Num value={design.scale?.title ?? 1} min={0.5} max={1.8} step={0.05} onChange={(v) => change((d) => { d.scale = { ...(d.scale || {}), title: v }; })} /></Field>
      <Field label={`본문 크기 ${Math.round((design.scale?.body ?? 1) * 100)}%`}><Num value={design.scale?.body ?? 1} min={0.5} max={1.8} step={0.05} onChange={(v) => change((d) => { d.scale = { ...(d.scale || {}), body: v }; })} /></Field>

      <hr /><b>화면 장식</b>
      <Field label="채널 표시 문구"><input value={ch.bug || ''} placeholder={design.brand_text || '오늘의 정책자금'} onChange={(e) => setCh({ bug: e.target.value || undefined })} /></Field>
      <div className="row">
        {([['brand', '채널 표시'], ['date', '날짜'], ['progress', '진행선'], ['backdrop', '배경 장식'], ...(news ? [['grid', '격자'], ['source', '출처 표기'], ['ticker', '티커(흐르는 띠)']] : [])] as [string, string][]).map(([k, l]) => (
          <label key={k} className="row" style={{ gap: 4 }}><input type="checkbox" checked={k === 'grid' || k === 'ticker' ? !!ch[k] : ch[k] !== false} onChange={(e) => setCh({ [k]: e.target.checked })} /> {l}</label>
        ))}
      </div>
      {news && ch.ticker && (
        <div className="row">
          <Field label="티커 라벨"><input value={ch.tickerLabel || ''} placeholder="속보" onChange={(e) => setCh({ tickerLabel: e.target.value.slice(0, 8) || undefined })} style={{ width: 90 }} /></Field>
          <Field label="티커 문구"><input value={ch.tickerText || ''} placeholder="오늘 공고 요약 한 줄" onChange={(e) => setCh({ tickerText: e.target.value.slice(0, 80) || undefined })} style={{ width: 220 }} /></Field>
        </div>
      )}
    </div>
  );
}
