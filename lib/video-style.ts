/**
 * 영상 스타일 프리셋 — 템플릿·색·폰트·굵기·자막·화면 장식·모션 성향을 한 묶음으로.
 * 캡처·링크(레퍼런스)를 Claude 가 분석해 만들거나, 기본 프리셋을 고쳐 저장. 디자인 단계가 이 값을 그대로 적용.
 * 클라이언트·서버·워커 공용 (순수 데이터).
 */
import { FONT_NAMES } from './fonts';
import type { CaptionStyle, Chrome, Fonts, Layer, Theme } from '../worker/video/common';

export type StyleSpec = {
  template: 'news' | 'classic';
  theme: Theme;
  fonts: Fonts;
  scale?: { title: number; body: number; caption: number };
  caption: CaptionStyle;
  chrome: Chrome;
  motion?: { intensity: 'low' | 'mid' | 'high'; presets?: string[]; notes?: string };
  layouts?: string[];            // 자주 쓰는 레이아웃 (우선순위)
  rules?: string[];              // 디자인 AI 가 지킬 규칙 (레퍼런스에서 뽑음)
  notes?: string;                // 이 스타일을 한 줄로
  layer_kit?: Layer[];           // 모든 장면에 공통으로 얹는 장식 레이어 (선택)
};

export const BUILTIN_STYLES: { key: string; name: string; desc: string; style: StyleSpec }[] = [
  {
    key: 'news-navy', name: '언론사 · 네이비', desc: '방송 뉴스 그래픽 — 짙은 남색 바탕, 파란 채널 표시, 빨간 속보 태그, 하단 자막 띠',
    style: {
      template: 'news',
      theme: { bg: '#0B1424', bg2: '#0F1D33', accent: '#2B6CDF', text: '#FFFFFF', sub: '#AAB6C8', surface: '#FFFFFF', ink: '#0E1726', alert: '#D6282E', line: 'rgba(255,255,255,0.16)' },
      fonts: { title: 'Pretendard', body: 'Pretendard', caption: 'Pretendard', number: 'Pretendard', titleWeight: 800, bodyWeight: 500, numberWeight: 800 },
      scale: { title: 1, body: 1, caption: 1 },
      caption: { box: 'lower', bg: '#0B1220', bgOpacity: 0.88, color: '#FFFFFF', highlight: '#FFD54A', font: 'Pretendard', size: 54, weight: 700, align: 'left', anim: 'wipe', label: '정책자금 브리핑', accentBar: true, maxWidth: 84, bottom: 380 },
      chrome: { brand: true, date: true, progress: true, backdrop: true, grid: true, ticker: false, source: true },
      motion: { intensity: 'low', presets: ['wipeRight', 'slideUp', 'countUp'], notes: '마스크 리빌·와이프 위주, 튀는 효과 없음' },
      layouts: ['breaking', 'stat', 'list', 'document', 'timeline', 'cta'],
      rules: ['왼쪽 정렬', '숫자는 출처와 함께', '이모지 쓰지 않음', '한 장면 한 메시지'],
      notes: '방송 뉴스처럼 공식적이고 단정한 톤',
    },
  },
  {
    key: 'news-paper', name: '언론사 · 지면(화이트)', desc: '신문 지면 — 미색 바탕, 명조 제목, 남색·적색 포인트',
    style: {
      template: 'news',
      theme: { bg: '#F4F1EA', bg2: '#ECE7DC', accent: '#1D3A6E', text: '#111827', sub: '#4B5563', surface: '#FFFFFF', ink: '#111827', alert: '#C8102E', line: 'rgba(17,24,39,0.16)' },
      fonts: { title: 'Noto Serif KR', body: 'Pretendard', caption: 'Pretendard', number: 'Noto Serif KR', titleWeight: 900, bodyWeight: 500, numberWeight: 900 },
      scale: { title: 1, body: 1, caption: 1 },
      caption: { box: 'bar', bg: '#111827', bgOpacity: 0.92, color: '#FFFFFF', highlight: '#FFD54A', font: 'Pretendard', size: 52, weight: 600, align: 'left', anim: 'fade', accentBar: true, maxWidth: 84, bottom: 380 },
      chrome: { brand: true, date: true, progress: true, backdrop: true, grid: false, ticker: false, source: true },
      motion: { intensity: 'low', presets: ['fade', 'wipeRight', 'slideUp'] },
      layouts: ['headline', 'document', 'quote', 'stat', 'list', 'cta'],
      rules: ['제목은 명조', '여백을 넉넉히', '강조는 적색 한 곳만'],
      notes: '신문 1면 같은 차분하고 권위 있는 톤',
    },
  },
  {
    key: 'news-breaking', name: '언론사 · 속보(블랙)', desc: '속보 특보 — 검정 바탕, 빨간 띠와 티커, 굵은 고딕',
    style: {
      template: 'news',
      theme: { bg: '#0A0A0A', bg2: '#151515', accent: '#E11D2E', text: '#FFFFFF', sub: '#A3A3A3', surface: '#FFFFFF', ink: '#0A0A0A', alert: '#E11D2E', line: 'rgba(255,255,255,0.14)' },
      fonts: { title: 'Pretendard', body: 'Pretendard', caption: 'Pretendard', number: 'Pretendard', titleWeight: 900, bodyWeight: 600, numberWeight: 900 },
      scale: { title: 1.05, body: 1, caption: 1 },
      caption: { box: 'lower', bg: '#FFFFFF', bgOpacity: 0.96, color: '#0A0A0A', highlight: '#E11D2E', font: 'Pretendard', size: 54, weight: 800, align: 'left', anim: 'wipe', label: '속보', labelBg: '#E11D2E', accentBar: false, maxWidth: 86, bottom: 380 },
      chrome: { brand: true, date: true, progress: true, backdrop: true, grid: false, ticker: true, tickerLabel: '속보', source: true },
      motion: { intensity: 'mid', presets: ['wipeRight', 'slideLeft', 'countUp', 'pop'] },
      layouts: ['breaking', 'stat', 'timeline', 'list', 'cta'],
      rules: ['첫 장면은 속보 태그', '빨강은 경고·마감에만'],
      notes: '긴급 특보처럼 강하지만 과장 없는 톤',
    },
  },
];
export const DEFAULT_STYLE_KEY = 'news-navy';

const HEX = /^#[0-9a-fA-F]{6}$/;
const col = (v: any, d: string) => (typeof v === 'string' && (HEX.test(v) || /^rgba?\(/.test(v)) ? v : d);
const num = (v: any, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);
const fnt = (v: any, d: string) => (FONT_NAMES.includes(v) ? v : d);
const one = <T extends string>(v: any, list: readonly T[], d: T): T => (list.includes(v) ? v : d);

/** 분석 결과·사용자 입력을 안전한 값으로 (색 형식, 폰트 목록, 숫자 범위, 선택지) */
export function cleanStyle(v: any): StyleSpec {
  const base = BUILTIN_STYLES[0].style;
  const t = v?.theme || {};
  const f = v?.fonts || {};
  const c = v?.caption || {};
  const ch = v?.chrome || {};
  const template = one(v?.template, ['news', 'classic'] as const, 'news');
  return {
    template,
    theme: {
      bg: col(t.bg, base.theme.bg), bg2: col(t.bg2, t.bg || base.theme.bg2), accent: col(t.accent, base.theme.accent), text: col(t.text, base.theme.text),
      sub: col(t.sub, base.theme.sub), surface: col(t.surface, '#FFFFFF'), ink: col(t.ink, '#0E1726'), alert: col(t.alert, '#D6282E'), line: col(t.line, base.theme.line!),
    },
    fonts: {
      title: fnt(f.title, 'Pretendard'), body: fnt(f.body, 'Pretendard'), caption: fnt(f.caption, f.body || 'Pretendard'), number: fnt(f.number, f.title || 'Pretendard'),
      titleWeight: num(f.titleWeight, 100, 900, 800), bodyWeight: num(f.bodyWeight, 100, 900, 500), numberWeight: num(f.numberWeight, 100, 900, 800),
    },
    scale: { title: num(v?.scale?.title, 0.6, 1.6, 1), body: num(v?.scale?.body, 0.6, 1.6, 1), caption: num(v?.scale?.caption, 0.6, 1.6, 1) },
    caption: {
      box: one(c.box, ['none', 'box', 'bar', 'lower'] as const, 'lower'), bg: col(c.bg, '#0B1220'), bgOpacity: num(c.bgOpacity, 0, 1, 0.88),
      color: col(c.color, '#FFFFFF'), highlight: col(c.highlight, '#FFD54A'), font: fnt(c.font, 'Pretendard'), size: num(c.size, 28, 110, 54),
      weight: num(c.weight, 100, 900, 700), align: one(c.align, ['left', 'center', 'right'] as const, 'left'),
      anim: one(c.anim, ['none', 'fade', 'pop', 'slide', 'wipe', 'word', 'karaoke'] as const, 'wipe'),
      label: typeof c.label === 'string' ? c.label.slice(0, 16) : '', labelBg: c.labelBg ? col(c.labelBg, '') : undefined, labelColor: col(c.labelColor, '#FFFFFF'),
      accentBar: c.accentBar !== false, maxWidth: num(c.maxWidth, 50, 100, 84), bottom: num(c.bottom, 120, 1400, 380),
      stroke: num(c.stroke, 0, 16, 0), strokeColor: col(c.strokeColor, '#000000'), shadow: num(c.shadow, 0, 40, 0),
      padX: num(c.padX, 0, 80, 34), padY: num(c.padY, 0, 60, 22), radius: num(c.radius, 0, 60, 4), lineHeight: num(c.lineHeight, 1, 2, 1.36), letterSpacing: num(c.letterSpacing, -0.1, 0.2, -0.01),
    },
    chrome: {
      brand: ch.brand !== false, date: ch.date !== false, progress: ch.progress !== false, backdrop: ch.backdrop !== false, grid: !!ch.grid,
      ticker: !!ch.ticker, tickerLabel: typeof ch.tickerLabel === 'string' ? ch.tickerLabel.slice(0, 8) : undefined, source: ch.source !== false,
    },
    motion: { intensity: one(v?.motion?.intensity, ['low', 'mid', 'high'] as const, 'low'), presets: Array.isArray(v?.motion?.presets) ? v.motion.presets.slice(0, 8).map(String) : [], notes: String(v?.motion?.notes || '').slice(0, 200) },
    layouts: Array.isArray(v?.layouts) ? v.layouts.map(String).slice(0, 9) : [],
    rules: Array.isArray(v?.rules) ? v.rules.map((x: any) => String(x).slice(0, 80)).slice(0, 10) : [],
    notes: String(v?.notes || '').slice(0, 200),
    layer_kit: Array.isArray(v?.layer_kit) ? cleanLayers(v.layer_kit).slice(0, 4) : [],
  };
}

const PRESETS = ['none', 'fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'scale', 'pop', 'wipeRight', 'wipeLeft', 'wipeDown', 'wipeUp', 'blurIn', 'typewriter', 'countUp', 'grow'] as const;
const TYPES = ['text', 'box', 'line', 'image', 'counter', 'bar', 'tag', 'highlight', 'emoji'] as const;
/** Claude 가 만든 레이어를 안전하게 (모르는 값 버림, 화면 밖 좌표 보정) */
export function cleanLayers(v: any): Layer[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 14).map((l: any, i: number) => {
    const anim = (a: any) => (a && typeof a === 'object' ? { preset: one(a.preset, PRESETS, 'fade'), at: num(a.at, -10, 30, 0), dur: num(a.dur, 0, 5, 0.5), ease: one(a.ease, ['out', 'in', 'inOut', 'linear', 'back', 'expo'] as const, 'out') } : undefined);
    const st = l.style || {};
    return {
      id: String(l.id || `L${i + 1}`).slice(0, 20), type: one(l.type, TYPES, 'text'),
      text: l.text != null ? String(l.text).slice(0, 120) : undefined, src: typeof l.src === 'string' && /^(https?:|\.\/|\/)/.test(l.src) ? l.src : undefined,
      value: l.value != null ? Number(l.value) || 0 : undefined, from: l.from != null ? Number(l.from) || 0 : undefined,
      prefix: l.prefix ? String(l.prefix).slice(0, 6) : undefined, suffix: l.suffix ? String(l.suffix).slice(0, 8) : undefined, decimals: l.decimals != null ? num(l.decimals, 0, 3, 0) : undefined,
      x: num(l.x, -200, 1280, 72), y: num(l.y, -200, 2100, 900), w: l.w != null ? num(l.w, 1, 1400, 400) : undefined, h: l.h != null ? num(l.h, 1, 2200, 80) : undefined,
      anchor: one(l.anchor, ['tl', 'tc', 'center'] as const, 'tl'),
      style: Object.fromEntries(Object.entries({
        font: st.font ? fnt(st.font, 'Pretendard') : undefined, size: st.size != null ? num(st.size, 10, 400, 56) : undefined, weight: st.weight != null ? num(st.weight, 100, 900, 700) : undefined,
        color: st.color ? col(st.color, '#FFFFFF') : undefined, bg: st.bg ? col(st.bg, '') || undefined : undefined, radius: st.radius != null ? num(st.radius, 0, 999, 0) : undefined,
        align: st.align ? one(st.align, ['left', 'center', 'right'] as const, 'left') : undefined, letterSpacing: st.letterSpacing != null ? num(st.letterSpacing, -0.2, 0.5, 0) : undefined,
        lineHeight: st.lineHeight != null ? num(st.lineHeight, 0.8, 2.4, 1.25) : undefined, border: st.border != null ? num(st.border, 0, 20, 0) : undefined, borderColor: st.borderColor ? col(st.borderColor, '#FFFFFF') : undefined,
        opacity: st.opacity != null ? num(st.opacity, 0, 1, 1) : undefined, shadow: st.shadow != null ? num(st.shadow, 0, 60, 0) : undefined,
        padX: st.padX != null ? num(st.padX, 0, 100, 0) : undefined, padY: st.padY != null ? num(st.padY, 0, 100, 0) : undefined, rotate: st.rotate != null ? num(st.rotate, -45, 45, 0) : undefined,
        track: st.track ? col(st.track, '') || undefined : undefined,
      }).filter(([, x]) => x !== undefined)),
      in: anim(l.in), out: anim(l.out), loop: one(l.loop, ['none', 'pulse', 'float', 'blink'] as const, 'none'),
      keys: Array.isArray(l.keys) ? l.keys.slice(0, 8).map((k: any) => Object.fromEntries(Object.entries({ t: num(k.t, 0, 30, 0), x: k.x != null ? num(k.x, -200, 1280, 0) : undefined, y: k.y != null ? num(k.y, -200, 2100, 0) : undefined, scale: k.scale != null ? num(k.scale, 0, 5, 1) : undefined, rotate: k.rotate != null ? num(k.rotate, -360, 360, 0) : undefined, opacity: k.opacity != null ? num(k.opacity, 0, 1, 1) : undefined }).filter(([, x]) => x !== undefined))) as any : undefined,
      z: l.z != null ? num(l.z, -5, 5, 1) : undefined, hidden: !!l.hidden,
    } as Layer;
  });
}

/** 디자인에 스타일 적용: 템플릿·색·폰트·자막·장식은 스타일 값으로, 장면 내용(scenes)은 유지. 공통 장식 레이어는 장면마다 추가 */
export function applyStyle(design: any, style: StyleSpec, opt: { keepCaptionLabel?: boolean } = {}) {
  const d = { ...(design || {}) };
  d.template = style.template;
  d.theme = { ...style.theme };
  d.fonts = { ...style.fonts };
  d.scale = { ...(style.scale || { title: 1, body: 1, caption: 1 }) };
  d.caption = { ...style.caption, ...(opt.keepCaptionLabel && design?.caption?.label ? { label: design.caption.label } : {}) };
  d.chrome = { ...style.chrome, ...(design?.chrome?.tickerText ? { tickerText: design.chrome.tickerText } : {}), ...(design?.chrome?.bug ? { bug: design.chrome.bug } : {}) };
  if (style.layer_kit?.length) {
    d.scenes = (d.scenes || []).map((s: any) => ({ ...s, layers: [...(s.layers || []).filter((l: Layer) => !String(l.id).startsWith('kit-')), ...style.layer_kit!.map((l, i) => ({ ...l, id: `kit-${i + 1}` }))] }));
  }
  return d;
}

/** 디자인에서 스타일만 뽑기 (편집기의 "지금 디자인을 스타일로 저장") */
export function styleFromDesign(d: any): StyleSpec {
  return cleanStyle({ template: d?.template || 'news', theme: d?.theme, fonts: d?.fonts, scale: d?.scale, caption: d?.caption, chrome: d?.chrome });
}

export const builtinStyle = (key?: string | null) => BUILTIN_STYLES.find((x) => x.key === key);
