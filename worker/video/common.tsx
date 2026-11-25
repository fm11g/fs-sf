import React from 'react';
import { Easing, interpolate } from 'remotion';
import { FONT_NAMES, nearestWeight } from '../../lib/fonts';

/**
 * 영상 공용 타입·도구 — 워커 렌더와 관리자 편집기(브라우저 미리보기)가 같은 파일을 씀.
 * 좌표: 1080×1920 기준 px. 다른 비율은 위치는 비율로(x/1080·W, y/1920·H), 크기는 k = min(W/1080, H/1350) 로 맞춤.
 */
export const FPS = 30;
export const TAIL = 0.6;

export const font = (name?: string | null, fallback = 'Pretendard') => {
  const n = name && FONT_NAMES.includes(name) ? name : fallback;
  return `'${n}', 'Pretendard', 'Noto Sans KR', 'Noto Sans CJK KR', sans-serif`;
};
/** 폰트가 실제로 가진 굵기 중 가장 가까운 값 (굵기 하나뿐인 폰트는 그대로) */
export const fw = (name: string | undefined | null, w?: number | null) => nearestWeight(name || 'Pretendard', w ?? 700);

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const EASE: Record<string, (t: number) => number> = {
  linear: (t) => t,
  out: Easing.out(Easing.cubic),
  in: Easing.in(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  back: Easing.out(Easing.back(1.6)),
  expo: Easing.out(Easing.exp),
};
export const prog = (t: number, at: number, dur: number, ease = 'out') => (EASE[ease] || EASE.out)(clamp01(dur <= 0 ? (t >= at ? 1 : 0) : (t - at) / dur));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 색 + 불투명도 → rgba */
export function alpha(hex: string | undefined, a = 1) {
  if (!hex) return `rgba(0,0,0,${a})`;
  if (!hex.startsWith('#')) return hex;
  const h = hex.length === 4 ? hex.slice(1).split('').map((x) => x + x).join('') : hex.slice(1, 7);
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** 색을 흰색(+) 또는 검정(-) 쪽으로 섞기 */
export function tint(hex: string | undefined, amt: number) {
  if (!hex?.startsWith('#')) return hex || '#ffffff';
  const h = hex.length === 4 ? hex.slice(1).split('').map((x) => x + x).join('') : hex.slice(1, 7);
  const n = parseInt(h, 16);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `#${[f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
export const isLight = (hex?: string) => {
  if (!hex?.startsWith('#')) return false;
  const h = hex.length === 4 ? hex.slice(1).split('').map((x) => x + x).join('') : hex.slice(1, 7);
  const n = parseInt(h, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
};

// ── 타입 ────────────────────────────────────────────────────────────────
export type ElKey = 'icon' | 'stat' | 'headline' | 'sub' | 'items' | 'cta' | 'caption' | 'kicker' | 'tag' | 'source';
/** 요소별 편집값 (위치 px · 배율 · 색 · 폰트 · 굵기 · 정렬 · 자간 · 숨김) */
export type ElStyle = {
  dx?: number; dy?: number; scale?: number; color?: string; font?: string; hidden?: boolean; bg?: string;
  weight?: number; align?: 'left' | 'center' | 'right'; letterSpacing?: number; lineHeight?: number;
};

/** 자막 스타일 (전체 기본 + 장면별 els.caption 으로 덮어씀) */
export type CaptionStyle = {
  hidden?: boolean;
  font?: string; size?: number /* 1080 기준 px (예전 값 0.5~2 는 배율로 해석) */; weight?: number;
  align?: 'left' | 'center' | 'right';
  color?: string; highlight?: string /* 강조 단어 색 */;
  box?: boolean | 'none' | 'box' | 'bar' | 'lower' /* 없음 · 글자 박스 · 띠 · 하단 자막(라벨+띠) */;
  bg?: string; bgOpacity?: number; padX?: number; padY?: number; radius?: number;
  stroke?: boolean | number; strokeColor?: string; shadow?: number;
  lineHeight?: number; letterSpacing?: number /* em */; maxWidth?: number /* 화면 폭 % */;
  bottom?: number /* 1920 기준 아래에서 px */;
  anim?: 'none' | 'fade' | 'pop' | 'slide' | 'wipe' | 'word' | 'karaoke';
  label?: string /* 하단 자막 라벨 (예: 정책자금 브리핑) */; labelBg?: string; labelColor?: string;
  accentBar?: boolean /* 띠 왼쪽 강조 막대 */;
};

export type LayerAnim = {
  preset?: 'none' | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'scale' | 'pop' | 'wipeRight' | 'wipeLeft' | 'wipeDown' | 'wipeUp' | 'blurIn' | 'typewriter' | 'countUp' | 'grow';
  at?: number /* 초 (장면 시작 기준, out 은 음수면 장면 끝 기준) */; dur?: number; ease?: 'out' | 'in' | 'inOut' | 'linear' | 'back' | 'expo';
};
export type LayerStyle = {
  font?: string; size?: number; weight?: number; color?: string; bg?: string; radius?: number; align?: 'left' | 'center' | 'right';
  letterSpacing?: number; lineHeight?: number; border?: number; borderColor?: string; opacity?: number; shadow?: number;
  padX?: number; padY?: number; rotate?: number; track?: string /* bar 바탕색 */;
};
/** Claude 가 설계하는 모션그래픽 레이어 (장면마다 여러 개) */
export type Layer = {
  id: string;
  type: 'text' | 'box' | 'line' | 'image' | 'counter' | 'bar' | 'tag' | 'highlight' | 'emoji';
  text?: string; src?: string; value?: number; from?: number; prefix?: string; suffix?: string; decimals?: number;
  x: number; y: number; w?: number; h?: number; anchor?: 'tl' | 'tc' | 'center';
  style?: LayerStyle; in?: LayerAnim; out?: LayerAnim; loop?: 'none' | 'pulse' | 'float' | 'blink';
  keys?: { t: number; x?: number; y?: number; scale?: number; rotate?: number; opacity?: number }[];
  z?: number; hidden?: boolean;
};

export type Theme = {
  bg: string; bg2: string; accent: string; text: string; sub: string;
  surface?: string /* 카드 바탕 */; ink?: string /* 카드 위 글자 */; alert?: string /* 속보 빨강 */; line?: string;
};
export type Fonts = { title: string; body: string; caption?: string; number?: string; titleWeight?: number; bodyWeight?: number; numberWeight?: number };

export type SceneProps = {
  id: string; layout: string; headline: string; sub?: string; items?: string[]; value?: string; unit?: string;
  emphasis?: string[]; motion?: string; icon?: string; cta?: string;
  kicker?: string /* 제목 위 작은 머리말: 기관·분류 */; tag?: string /* 속보·단독·공고 등 */; source?: string /* 출처 표기 */;
  layers?: Layer[]; hideLayout?: boolean /* 레이아웃 없이 레이어만 */;
  /** 장면 자료(영상·이미지) — footage 레이아웃은 화면 안 틀에, 그 외 레이아웃은 배경으로 (어둡게) */
  media?: { url: string; kind?: 'video' | 'image'; fit?: 'cover' | 'contain'; start?: number; label?: string; volume?: number; dim?: number; pos?: string };
  narration: string; captions: string[]; audioUrl: string; durationSec: number;
  els?: Partial<Record<ElKey, ElStyle>>;
  bg?: { bg?: string; bg2?: string };
};
export type Chrome = {
  brand?: boolean; date?: boolean; progress?: boolean; backdrop?: boolean;
  ticker?: boolean; tickerLabel?: string; tickerText?: string; source?: boolean; bug?: string; grid?: boolean;
};
export type ShortProps = {
  template?: 'news' | 'classic';
  brand: string; dateLabel: string; dateNews?: string;
  theme: Theme; fonts: Fonts;
  scale: { title: number; body: number; caption: number };
  scenes: SceneProps[];
  bgmUrl?: string | null; bgmVolume?: number;
  size?: { w: number; h: number };
  caption?: CaptionStyle; chrome?: Chrome;
};

export const sizeOf = (p: Pick<ShortProps, 'size'>) => ({ w: Math.round(p.size?.w || 1080), h: Math.round(p.size?.h || 1920) });
export const totalFrames = (p: ShortProps) => Math.max(30, Math.ceil((p.scenes.reduce((n, s) => n + s.durationSec, 0) + TAIL) * FPS));
export function sceneStarts(p: ShortProps) {
  let start = 0;
  return p.scenes.map((s) => { const from = start; start += Math.max(1, Math.round(s.durationSec * FPS)); return from; });
}
export const elT = (e?: ElStyle, k = 1) => (e && (e.dx || e.dy || (e.scale && e.scale !== 1)) ? `translate(${(e.dx || 0) * k}px, ${(e.dy || 0) * k}px) scale(${e.scale ?? 1})` : undefined);

/** 강조 단어만 색칠 */
export const Emph: React.FC<{ text: string; words?: string[]; color: string; style?: React.CSSProperties }> = ({ text, words = [], color, style }) => {
  const w = words.filter(Boolean);
  if (!w.length) return <>{text}</>;
  const re = new RegExp(`(${w.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return <>{text.split(re).map((part, i) => (w.includes(part) ? <span key={i} style={{ color, ...style }}>{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>))}</>;
};

/** 숫자 카운트업 ("60억" → 0→60) */
export function countText(raw: string, t: number) {
  const m = (raw || '').match(/^([^\d]*)([\d.,]+)(.*)$/);
  if (!m) return raw;
  const target = Number(m[2].replace(/,/g, ''));
  const dec = (m[2].split('.')[1] || '').length;
  const v = interpolate(t, [0, 1], [0, target], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return m[1] + v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3];
}
