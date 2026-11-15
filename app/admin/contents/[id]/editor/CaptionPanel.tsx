'use client';
import { CAPTION_DEFAULTS } from '@/worker/video/caption';
import type { CaptionStyle } from '@/worker/video/common';
import { Color, Field, FontSelect, Num, Seg, WeightSelect } from './controls';

/** 자막 세부 조정: 전체 기본 스타일 + 이 장면만 바꾸기 */
export default function CaptionPanel({ design, change, scene, setScene, capLines, sceneCaptions, defaultCaptions }: {
  design: any; change: (fn: (d: any) => void) => void; scene: any; setScene: (fn: (s: any) => void) => void;
  capLines: string[]; sceneCaptions?: string[]; defaultCaptions: string[];
}) {
  const tpl = design.template === 'news' ? 'news' : 'classic';
  const base = CAPTION_DEFAULTS[tpl];
  const raw: CaptionStyle = design.caption || {};
  // 예전 값(0.5~2 배율, box true/false) 을 지금 단위로 보여 줌
  const cap: CaptionStyle = { ...base, ...raw, size: raw.size != null && raw.size <= 3 ? base.size! * raw.size : raw.size ?? base.size, box: raw.box === true ? 'box' : raw.box === false ? 'none' : raw.box ?? base.box };
  const set = (patch: Partial<CaptionStyle>) => change((d) => { d.caption = { ...cap, ...(d.caption || {}), ...patch }; if (d.caption.size <= 3) d.caption.size = cap.size; });
  const E = scene?.els?.caption || {};
  const setE = (patch: any) => setScene((s) => { s.els = s.els || {}; s.els.caption = Object.fromEntries(Object.entries({ ...(s.els.caption || {}), ...patch }).filter(([, v]) => v !== undefined && v !== '')); });
  const fontName = cap.font || design.fonts?.caption || design.fonts?.body;

  return (
    <div className="ed-form">
      <Field label="이 장면 자막 (한 줄 = 한 컷 · 대사 길이에 맞춰 나눠 나옴)">
        <textarea className="txt" rows={4} value={capLines.join('\n')} onChange={(e) => setScene((s) => { s.captions = e.target.value.split('\n'); })} onBlur={() => setScene((s) => { const v = (s.captions || []).map((x: string) => x.trim()).filter(Boolean); s.captions = v.length && v.join('\n') !== defaultCaptions.join('\n') ? v : undefined; })} />
      </Field>
      {sceneCaptions && <button onClick={() => setScene((s) => { delete s.captions; })}>대사 단계 자막으로</button>}

      <hr /><b>모든 장면 자막 스타일</b>
      <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!cap.hidden} onChange={(e) => set({ hidden: !e.target.checked || undefined })} /> 자막 보이기</label>

      <Field label="모양">
        <Seg value={cap.box as any} options={[['lower', '하단 자막 (라벨+띠)'], ['bar', '띠'], ['box', '글자 박스'], ['none', '글자만 (외곽선)']]} onChange={(v) => set({ box: v })} />
      </Field>
      {cap.box === 'lower' && (
        <div className="row">
          <Field label="라벨 문구 (비우면 없음)"><input value={cap.label || ''} placeholder="예: 정책자금 브리핑" onChange={(e) => set({ label: e.target.value.slice(0, 14) })} style={{ width: 150 }} /></Field>
          <Field label="라벨 바탕"><Color value={cap.labelBg || design.theme?.alert || '#D6282E'} onChange={(v) => set({ labelBg: v })} /></Field>
          <Field label="라벨 글자"><Color value={cap.labelColor || '#FFFFFF'} onChange={(v) => set({ labelColor: v })} /></Field>
        </div>
      )}

      <Field label="글꼴"><FontSelect value={cap.font || ''} fallback={design.fonts?.body} onChange={(v) => set({ font: v || undefined })} /></Field>
      <div className="row">
        <Field label="굵기"><WeightSelect font={fontName} value={cap.weight} onChange={(v) => set({ weight: v })} /></Field>
        <Field label="정렬"><Seg value={cap.align} options={[['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']]} onChange={(v) => set({ align: v })} /></Field>
      </div>
      <Field label="글자 크기 (1080 폭 기준 px)"><Num value={Math.round(cap.size || 54)} min={28} max={110} onChange={(v) => set({ size: v })} unit="px" /></Field>
      <div className="row">
        <Field label="글자색"><Color value={cap.color || '#FFFFFF'} onChange={(v) => set({ color: v })} /></Field>
        <Field label="강조 단어 색"><Color value={cap.highlight || '#FFD54A'} onChange={(v) => set({ highlight: v })} /></Field>
      </div>
      {cap.box !== 'none' && (
        <>
          <div className="row">
            <Field label="바탕색"><Color value={(cap.bg || '#000000').slice(0, 7)} onChange={(v) => set({ bg: v })} /></Field>
            <Field label={`바탕 불투명 ${Math.round((cap.bgOpacity ?? 0.85) * 100)}%`}><input type="range" min={0} max={1} step={0.02} value={cap.bgOpacity ?? 0.85} onChange={(e) => set({ bgOpacity: Number(e.target.value) })} /></Field>
          </div>
          <div className="row">
            <Field label="좌우 여백"><Num value={cap.padX ?? 30} min={0} max={80} onChange={(v) => set({ padX: v })} /></Field>
            <Field label="위아래 여백"><Num value={cap.padY ?? 18} min={0} max={60} onChange={(v) => set({ padY: v })} /></Field>
          </div>
          <div className="row">
            <Field label="모서리 둥글기"><Num value={cap.radius ?? 6} min={0} max={60} onChange={(v) => set({ radius: v })} /></Field>
            <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!!cap.accentBar} onChange={(e) => set({ accentBar: e.target.checked })} /> 왼쪽 색 막대</label>
          </div>
        </>
      )}
      <div className="row">
        <Field label="외곽선 두께"><Num value={typeof cap.stroke === 'number' ? cap.stroke : cap.stroke ? 6 : 0} min={0} max={16} onChange={(v) => set({ stroke: v })} /></Field>
        <Field label="외곽선 색"><Color value={cap.strokeColor || '#000000'} onChange={(v) => set({ strokeColor: v })} /></Field>
      </div>
      <Field label="그림자"><Num value={cap.shadow ?? 0} min={0} max={40} onChange={(v) => set({ shadow: v })} /></Field>
      <div className="row">
        <Field label="줄 간격"><Num value={cap.lineHeight ?? 1.32} min={1} max={2} step={0.02} onChange={(v) => set({ lineHeight: v })} /></Field>
        <Field label="자간 (em)"><Num value={cap.letterSpacing ?? 0} min={-0.1} max={0.2} step={0.005} onChange={(v) => set({ letterSpacing: v })} /></Field>
      </div>
      <Field label="자막 최대 폭 (화면 %)"><Num value={cap.maxWidth ?? 86} min={50} max={100} onChange={(v) => set({ maxWidth: v })} unit="%" /></Field>
      <Field label="아래에서 높이 (1920 기준 · 쇼츠 버튼 피하려면 330 이상)"><Num value={cap.bottom ?? 360} min={120} max={1400} step={5} onChange={(v) => set({ bottom: v })} unit="px" /></Field>
      <Field label="등장 효과">
        <Seg value={cap.anim} options={[['none', '없음'], ['fade', '페이드'], ['wipe', '와이프'], ['slide', '올라오기'], ['pop', '팝'], ['word', '단어씩'], ['karaoke', '노래방']]} onChange={(v) => set({ anim: v })} />
      </Field>
      <button onClick={() => change((d) => { d.caption = { ...base }; })}>템플릿 기본 자막으로</button>

      <hr /><b>이 장면만 다르게</b>
      <div className="row">
        <Field label="글자색"><Color value={E.color || cap.color || '#FFFFFF'} onChange={(v) => setE({ color: v })} /></Field>
        <Field label="바탕"><Color value={E.bg || (cap.bg || '#000000').slice(0, 7)} onChange={(v) => setE({ bg: v })} /></Field>
      </div>
      <div className="row">
        <Field label="굵기"><WeightSelect font={E.font || fontName} value={E.weight} onChange={(v) => setE({ weight: v })} allowDefault="전체와 같게" /></Field>
        <Field label="정렬"><Seg value={E.align} options={[['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']]} onChange={(v) => setE({ align: v })} /></Field>
      </div>
      <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!!E.hidden} onChange={(e) => setE({ hidden: e.target.checked || undefined })} /> 이 장면 자막 숨기기</label>
      {Object.keys(E).length > 0 && <button onClick={() => setScene((s) => { if (s.els) delete s.els.caption; })}>이 장면 자막 설정 지우기</button>}
    </div>
  );
}
