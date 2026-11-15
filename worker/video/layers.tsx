import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { EASE, alpha, font, fw, prog, type Layer, type LayerAnim, type ShortProps } from './common';

/**
 * Claude 모션그래픽 레이어 렌더러.
 * 디자인 단계(또는 편집기의 "Claude 에게 모션 요청")에서 Claude 가 장면마다 layers[] 를 설계하면 여기서 그대로 그림.
 *  - 위치 x,y: 1080×1920 기준 px (다른 비율은 비율로 환산) · 크기: k 배율
 *  - in/out: 등장·퇴장 프리셋 + 시점(at)·길이(dur)·가속(ease) · keys: 시간별 위치·크기·회전·투명도 키프레임 · loop: 반복 효과
 */
export const LAYER_PRESETS = ['none', 'fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'scale', 'pop', 'wipeRight', 'wipeLeft', 'wipeDown', 'wipeUp', 'blurIn', 'typewriter', 'countUp', 'grow'] as const;
export const LAYER_TYPES = ['text', 'box', 'line', 'image', 'counter', 'bar', 'tag', 'highlight', 'emoji'] as const;

type FX = { opacity: number; tx: number; ty: number; scale: number; blur: number; clip?: string; chars: number; count: number; grow: number };
const base = (): FX => ({ opacity: 1, tx: 0, ty: 0, scale: 1, blur: 0, chars: 1, count: 1, grow: 1 });

/** 프리셋 하나를 진행률 e(0→1, 0=숨김 1=제자리)로 적용 */
function apply(fx: FX, preset: LayerAnim['preset'], e: number, k: number) {
  const d = 70 * k;
  switch (preset) {
    case 'fade': fx.opacity *= e; break;
    case 'slideUp': fx.ty += (1 - e) * d; fx.opacity *= e; break;
    case 'slideDown': fx.ty -= (1 - e) * d; fx.opacity *= e; break;
    case 'slideLeft': fx.tx += (1 - e) * d * 1.6; fx.opacity *= e; break;
    case 'slideRight': fx.tx -= (1 - e) * d * 1.6; fx.opacity *= e; break;
    case 'scale': fx.scale *= 0.82 + 0.18 * e; fx.opacity *= e; break;
    case 'pop': fx.scale *= Math.max(0, e); fx.opacity *= Math.min(1, e * 2); break;
    case 'wipeRight': fx.clip = `inset(0 ${(1 - e) * 100}% 0 0)`; break;
    case 'wipeLeft': fx.clip = `inset(0 0 0 ${(1 - e) * 100}%)`; break;
    case 'wipeDown': fx.clip = `inset(0 0 ${(1 - e) * 100}% 0)`; break;
    case 'wipeUp': fx.clip = `inset(${(1 - e) * 100}% 0 0 0)`; break;
    case 'blurIn': fx.blur += (1 - e) * 18; fx.opacity *= e; break;
    case 'typewriter': fx.chars = e; break;
    case 'countUp': fx.count = e; break;
    case 'grow': fx.grow = e; break;
    default: break;
  }
}

export function layerFx(l: Layer, t: number, len: number, k: number): FX {
  const fx = base();
  const inA = l.in || { preset: l.type === 'counter' ? 'countUp' : l.type === 'bar' || l.type === 'line' || l.type === 'highlight' ? 'grow' : 'fade' };
  if (inA.preset && inA.preset !== 'none') {
    const ease = inA.preset === 'pop' ? 'back' : inA.ease || 'out';
    apply(fx, inA.preset, prog(t, inA.at ?? 0, inA.dur ?? 0.5, ease), k);
  }
  if (l.out?.preset && l.out.preset !== 'none') {
    const at = (l.out.at ?? -0.4) < 0 ? len + (l.out.at ?? -0.4) : l.out.at!;
    const e = 1 - prog(t, at, l.out.dur ?? 0.35, l.out.ease || 'in');
    if (e < 1) apply(fx, l.out.preset, e, k);
  }
  if (l.loop === 'pulse') fx.scale *= 1 + Math.sin(t * 6) * 0.025;
  if (l.loop === 'float') fx.ty += Math.sin(t * 2.4) * 8 * k;
  if (l.loop === 'blink') fx.opacity *= 0.55 + 0.45 * (Math.sin(t * 7) > 0 ? 1 : 0);
  return fx;
}

/** 키프레임 보간 (x·y 는 기준 px 절대값, scale·rotate·opacity 는 곱/더하기) */
function keyed(l: Layer, t: number) {
  const ks = (l.keys || []).filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const out: { x?: number; y?: number; scale?: number; rotate?: number; opacity?: number } = {};
  if (!ks.length) return out;
  for (const prop of ['x', 'y', 'scale', 'rotate', 'opacity'] as const) {
    const pts = ks.filter((x) => x[prop] != null);
    if (!pts.length) continue;
    if (pts.length === 1) { out[prop] = pts[0][prop]; continue; }
    out[prop] = interpolate(t, pts.map((x) => x.t), pts.map((x) => x[prop]!), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.inOut });
  }
  return out;
}

export const Layers: React.FC<{ layers?: Layer[]; p: ShortProps; len: number; k: number; W: number; H: number; zMin?: number; zMax?: number }> = ({ layers, p, len, k, W, H, zMin = -Infinity, zMax = Infinity }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lenSec = len / fps;
  const list = (layers || []).filter((l) => !l.hidden && (l.z ?? 1) >= zMin && (l.z ?? 1) <= zMax).sort((a, b) => (a.z ?? 1) - (b.z ?? 1));
  return (
    <>
      {list.map((l) => {
        const fx = layerFx(l, t, lenSec, k);
        const kv = keyed(l, t);
        const st = l.style || {};
        const X = ((kv.x ?? l.x) / 1080) * W;
        const Y = ((kv.y ?? l.y) / 1920) * H;
        const w = l.w != null ? l.w * k : undefined;
        const h = l.h != null ? l.h * k : undefined;
        const anchor = l.anchor === 'center' ? 'translate(-50%,-50%)' : l.anchor === 'tc' ? 'translateX(-50%)' : '';
        const tf = `${anchor} translate(${fx.tx}px, ${fx.ty}px) scale(${fx.scale * (kv.scale ?? 1)}) rotate(${(st.rotate || 0) + (kv.rotate || 0)}deg)`;
        const wrap: React.CSSProperties = {
          position: 'absolute', left: X, top: Y, width: w, height: h, transform: tf, transformOrigin: l.anchor === 'tl' || !l.anchor ? 'left top' : 'center',
          opacity: fx.opacity * (kv.opacity ?? 1) * (st.opacity ?? 1), filter: fx.blur ? `blur(${fx.blur}px)` : undefined, clipPath: fx.clip,
        };
        const fName = st.font || (l.type === 'counter' ? p.fonts.number || p.fonts.title : p.fonts.body);
        const text: React.CSSProperties = {
          fontFamily: font(fName), fontWeight: fw(fName, st.weight ?? (l.type === 'counter' ? 800 : 700)), fontSize: (st.size ?? 56) * k,
          color: st.color || p.theme.text, textAlign: st.align || 'left', letterSpacing: `${st.letterSpacing ?? 0}em`, lineHeight: st.lineHeight ?? 1.25,
          whiteSpace: 'pre-line', wordBreak: 'keep-all', ...(st.shadow ? { textShadow: `0 ${st.shadow * 0.3 * k}px ${st.shadow * k}px rgba(0,0,0,.45)` } : {}),
        };
        const pad = `${(st.padY ?? 0) * k}px ${(st.padX ?? 0) * k}px`;
        const boxed: React.CSSProperties = { background: st.bg, borderRadius: (st.radius ?? 0) * k, border: st.border ? `${st.border * k}px solid ${st.borderColor || p.theme.line || '#fff'}` : undefined, padding: pad, boxSizing: 'border-box' };

        let inner: React.ReactNode = null;
        if (l.type === 'text' || l.type === 'emoji') {
          const s = l.text || '';
          const shown = fx.chars < 1 ? [...s].slice(0, Math.floor([...s].length * fx.chars)).join('') : s;
          inner = <div style={{ ...text, ...(l.type === 'emoji' ? { fontSize: (st.size ?? 120) * k } : {}), ...boxed }}>{shown}</div>;
        } else if (l.type === 'tag') {
          inner = <div style={{ ...text, display: 'inline-block', ...boxed, background: st.bg || p.theme.alert || p.theme.accent, padding: `${(st.padY ?? 10) * k}px ${(st.padX ?? 22) * k}px`, color: st.color || '#fff', fontSize: (st.size ?? 40) * k }}>{l.text}</div>;
        } else if (l.type === 'box') {
          inner = <div style={{ width: '100%', height: '100%', ...boxed, background: st.bg || alpha(p.theme.surface || '#fff', 0.1) }} />;
        } else if (l.type === 'line' || l.type === 'highlight') {
          inner = <div style={{ width: '100%', height: h ?? (l.type === 'line' ? 6 * k : 40 * k), background: st.bg || st.color || (l.type === 'highlight' ? alpha(p.theme.alert || '#FFD54A', 0.45) : p.theme.accent), borderRadius: (st.radius ?? 0) * k, transform: `scaleX(${fx.grow})`, transformOrigin: 'left center' }} />;
        } else if (l.type === 'image') {
          inner = l.src ? <img src={l.src} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: (st.radius ?? 0) * k, border: boxed.border }} /> : null;
        } else if (l.type === 'counter') {
          const v = (l.from ?? 0) + ((l.value ?? 0) - (l.from ?? 0)) * fx.count;
          const dec = l.decimals ?? 0;
          inner = <div style={{ ...text, ...boxed, fontVariantNumeric: 'tabular-nums' }}>{l.prefix || ''}{v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}{l.suffix || ''}</div>;
        } else if (l.type === 'bar') {
          const pct = Math.max(0, Math.min(100, l.value ?? 100)) / 100;
          inner = (
            <div style={{ width: '100%', height: h ?? 28 * k, background: st.track || alpha(p.theme.text, 0.15), borderRadius: (st.radius ?? 999) * k, overflow: 'hidden' }}>
              <div style={{ width: `${pct * fx.grow * 100}%`, height: '100%', background: st.bg || st.color || p.theme.accent, borderRadius: (st.radius ?? 999) * k }} />
            </div>
          );
        }
        return <div key={l.id} style={wrap}>{inner}</div>;
      })}
    </>
  );
};
