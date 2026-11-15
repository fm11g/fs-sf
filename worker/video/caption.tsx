import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Emph, alpha, clamp01, elT, font, fw, prog, type CaptionStyle, type SceneProps, type ShortProps } from './common';

/** 기본 자막 스타일 — 템플릿별 */
export const CAPTION_DEFAULTS: Record<'news' | 'classic', CaptionStyle> = {
  news: {
    font: 'Pretendard', size: 54, weight: 700, align: 'left', color: '#FFFFFF', highlight: '#FFD54A',
    box: 'lower', bg: '#0B1220', bgOpacity: 0.88, padX: 34, padY: 22, radius: 4, stroke: 0, strokeColor: '#000000', shadow: 0,
    lineHeight: 1.38, letterSpacing: -0.01, maxWidth: 84, bottom: 380, anim: 'wipe', label: '', labelBg: '', labelColor: '#FFFFFF', accentBar: true,
  },
  classic: {
    font: 'Noto Sans KR', size: 68, weight: 900, align: 'center', color: '#FFFFFF', highlight: '',
    box: 'box', bg: '#000000', bgOpacity: 0.72, padX: 34, padY: 18, radius: 20, stroke: 0, strokeColor: '#000000', shadow: 0,
    lineHeight: 1.3, letterSpacing: 0, maxWidth: 89, bottom: 360, anim: 'pop', accentBar: false,
  },
};

/** 내레이션 길이 비례로 자막 컷 분배 + 스타일 세부 적용 */
export const Captions: React.FC<{ s: SceneProps; p: ShortProps; len: number; k: number; W: number; H: number }> = ({ s, p, len, k, W, H }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tpl = p.template === 'news' ? 'news' : 'classic';
  const raw = p.caption || {};
  // 예전 값 호환: size 0.5~2 = 배율, box true/false
  const legacySize = raw.size != null && raw.size <= 3 ? raw.size : null;
  const c: CaptionStyle = { ...CAPTION_DEFAULTS[tpl], ...raw, size: legacySize ? CAPTION_DEFAULTS[tpl].size! * legacySize : raw.size ?? CAPTION_DEFAULTS[tpl].size };
  if (raw.box === true) c.box = 'box';
  if (raw.box === false) c.box = 'none';
  const e = s.els?.caption || {};
  const fontName = e.font || c.font || p.fonts.caption || p.fonts.body;
  const weight = fw(fontName, e.weight ?? c.weight);
  const align = e.align || c.align || 'center';
  const color = e.color || c.color || '#fff';
  const hl = c.highlight || p.theme.accent;
  const boxType = c.box || 'none';
  const bg = alpha(e.bg || c.bg || '#000', e.bg ? 1 : c.bgOpacity ?? 0.8);

  const caps = s.captions?.length ? s.captions : [s.narration];
  const weights = caps.map((x) => Math.max(1, x.replace(/\s/g, '').length));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const idx = caps.findIndex((_, i) => { acc += weights[i]; return frame < (acc / total) * len; });
  const i = idx < 0 ? caps.length - 1 : idx;
  const capStart = Math.round((weights.slice(0, i).reduce((a, b) => a + b, 0) / total) * len);
  const capLen = Math.max(1, Math.round((weights[i] / total) * len));
  const t = (frame - capStart) / fps;
  const text = caps[i] || '';

  // 등장 모션
  const a = c.anim || 'none';
  const pIn = prog(t, 0, a === 'wipe' ? 0.28 : 0.18, a === 'pop' ? 'back' : 'out');
  const box: React.CSSProperties = {};
  if (a === 'fade') box.opacity = pIn;
  if (a === 'pop') box.transform = `scale(${0.85 + 0.15 * pIn})`;
  if (a === 'slide') { box.transform = `translateY(${(1 - pIn) * 30 * k}px)`; box.opacity = pIn; }
  if (a === 'wipe') box.clipPath = `inset(0 ${(1 - pIn) * 100}% 0 0)`;

  // 단어 단위 (word: 하나씩 등장 · karaoke: 지나간 단어 강조)
  const words = text.split(/(\s+)/);
  const wordCount = words.filter((w) => w.trim()).length;
  const wp = clamp01((frame - capStart) / (capLen * 0.85));
  let seen = 0;
  const body = a === 'word' || a === 'karaoke'
    ? words.map((w, wi) => {
      if (!w.trim()) return <React.Fragment key={wi}>{w}</React.Fragment>;
      seen++;
      const on = seen <= Math.ceil(wp * wordCount);
      const isEmph = (s.emphasis || []).some((x) => x && w.includes(x));
      if (a === 'word') return <span key={wi} style={{ opacity: on ? 1 : 0, color: isEmph ? hl : undefined }}>{w}</span>;
      return <span key={wi} style={{ color: on ? hl : color, transition: 'none' }}>{w}</span>;
    })
    : <Emph text={text} words={s.emphasis} color={hl} />;

  const size = (c.size || 54) * p.scale.caption * k;
  const strokeW = typeof c.stroke === 'number' ? c.stroke : c.stroke ? 6 : boxType === 'none' ? 6 : 0;
  const txt: React.CSSProperties = {
    fontFamily: font(fontName), fontWeight: weight, fontSize: size, lineHeight: e.lineHeight ?? c.lineHeight ?? 1.32,
    letterSpacing: `${e.letterSpacing ?? c.letterSpacing ?? 0}em`, color, textAlign: align, wordBreak: 'keep-all', whiteSpace: 'pre-line',
    ...(strokeW ? { WebkitTextStroke: `${strokeW * k}px ${c.strokeColor || '#000'}`, paintOrder: 'stroke fill' } : {}),
    ...(c.shadow ? { textShadow: `0 ${c.shadow * 0.4 * k}px ${c.shadow * k}px rgba(0,0,0,.6)` } : {}),
  };
  const maxW = ((c.maxWidth ?? 86) / 100) * W;
  const padX = (c.padX ?? 30) * k;
  const padY = (c.padY ?? 18) * k;
  const radius = (c.radius ?? 8) * k;
  const bottom = ((c.bottom ?? 360) / 1920) * H;
  const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  const side = (W - maxW) / 2;

  return (
    <div style={{ position: 'absolute', left: side, right: side, bottom, display: 'flex', flexDirection: 'column', alignItems: justify, transform: elT(e, k) }}>
      {boxType === 'lower' && (c.label || '') && (
        <div style={{ background: c.labelBg || p.theme.alert || p.theme.accent, color: c.labelColor || '#fff', fontFamily: font(fontName), fontWeight: fw(fontName, 800), fontSize: size * 0.56, padding: `${8 * k}px ${18 * k}px`, letterSpacing: '0.02em', clipPath: `inset(0 ${(1 - prog((frame - capStart) / fps + (i ? 1 : 0), 0, 0.22)) * 100}% 0 0)` }}>
          {c.label}
        </div>
      )}
      <div style={{
        ...box,
        ...(boxType === 'box' ? { background: bg, borderRadius: radius, padding: `${padY}px ${padX}px` } : {}),
        ...(boxType === 'bar' || boxType === 'lower' ? { background: bg, borderRadius: radius, padding: `${padY}px ${padX}px`, width: '100%', boxSizing: 'border-box' } : {}),
        ...(boxType !== 'none' && c.accentBar ? { borderLeft: `${10 * k}px solid ${p.theme.alert || p.theme.accent}` } : {}),
        maxWidth: maxW, display: 'flex', justifyContent: justify,
      }}>
        <span style={txt}>{body}</span>
      </div>
    </div>
  );
};

