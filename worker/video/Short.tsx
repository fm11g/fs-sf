import React from 'react';
import {
  AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig,
  type CalculateMetadataFunction,
} from 'remotion';

/**
 * 숏폼 컴포지션 — 워커 렌더와 관리자 영상 편집기(브라우저 미리보기)가 같은 파일을 씀.
 * 좌표·크기는 1080 기준 px. 다른 화면 비율은 k = min(W/1080, H/1350) 로 맞춤.
 */
// 워커에서는 시스템 폰트(scripts/fonts.sh), 편집기에서는 구글 폰트로 같은 이름 사용
const FONTS = ['Black Han Sans', 'Noto Sans KR', 'Do Hyeon', 'Gothic A1', 'Jua', 'Nanum Gothic', 'Nanum Myeongjo', 'Nanum Pen Script', 'Gowun Dodum', 'Sunflower', 'IBM Plex Sans KR', 'Noto Serif KR', 'Dongle', 'Gasoek One', 'Hahmlet'];
const font = (name?: string) => `'${name && FONTS.includes(name) ? name : 'Noto Sans KR'}', 'Noto Sans CJK KR', sans-serif`;

export const FPS = 30;
const TAIL = 0.6; // 마지막 여운(초)

export type ElKey = 'icon' | 'stat' | 'headline' | 'sub' | 'items' | 'cta' | 'caption';
/** 요소별 편집값: 위치 이동(px, 1080 기준) · 크기 배율 · 색 · 폰트 · 숨김 */
export type ElStyle = { dx?: number; dy?: number; scale?: number; color?: string; font?: string; hidden?: boolean; bg?: string };
export type CaptionStyle = { bottom?: number; size?: number; color?: string; bg?: string; font?: string; box?: boolean; stroke?: boolean; hidden?: boolean };

export type SceneProps = {
  id: string; layout: string; headline: string; sub?: string; items?: string[]; value?: string; unit?: string;
  emphasis?: string[]; motion?: string; icon?: string; cta?: string;
  narration: string; captions: string[]; audioUrl: string; durationSec: number;
  els?: Partial<Record<ElKey, ElStyle>>;
  bg?: { bg?: string; bg2?: string };
};
export type ShortProps = {
  brand: string; dateLabel: string;
  theme: { bg: string; bg2: string; accent: string; text: string; sub: string };
  fonts: { title: string; body: string };
  scale: { title: number; body: number; caption: number };
  scenes: SceneProps[];
  bgmUrl?: string | null;
  bgmVolume?: number;
  size?: { w: number; h: number };
  caption?: CaptionStyle;
  chrome?: { brand?: boolean; date?: boolean; progress?: boolean; backdrop?: boolean };
};

export const sizeOf = (p: Pick<ShortProps, 'size'>) => ({ w: Math.round(p.size?.w || 1080), h: Math.round(p.size?.h || 1920) });
export const totalFrames = (p: ShortProps) => Math.max(30, Math.ceil((p.scenes.reduce((n, s) => n + s.durationSec, 0) + TAIL) * FPS));

export const calcMeta: CalculateMetadataFunction<ShortProps> = ({ props }) => {
  const { w, h } = sizeOf(props);
  return { durationInFrames: totalFrames(props), width: w % 2 ? w + 1 : w, height: h % 2 ? h + 1 : h };
};

/** 장면 시작 프레임 목록 (편집기에서 장면 선택 시 이동용) */
export function sceneStarts(p: ShortProps) {
  let start = 0;
  return p.scenes.map((s) => { const from = start; start += Math.max(1, Math.round(s.durationSec * FPS)); return from; });
}

const elT = (e?: ElStyle, k = 1) => (e && (e.dx || e.dy || (e.scale && e.scale !== 1)) ? `translate(${(e.dx || 0) * k}px, ${(e.dy || 0) * k}px) scale(${e.scale ?? 1})` : undefined);

export const Short: React.FC<ShortProps> = (p) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width: W, height: H } = useVideoConfig();
  const k = Math.min(W / 1080, H / 1350);
  const ch = { brand: true, date: true, progress: true, backdrop: true, ...(p.chrome || {}) };
  let start = 0;
  const seqs = p.scenes.map((s) => {
    const len = Math.max(1, Math.round(s.durationSec * FPS));
    const from = start;
    start += len;
    return { s, from, len };
  });
  const cur = seqs.find((x) => frame >= x.from && frame < x.from + x.len)?.s;
  const bg = cur?.bg?.bg || p.theme.bg;
  const bg2 = cur?.bg?.bg2 || p.theme.bg2;
  const vol = p.bgmVolume ?? 0.12;

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${bg} 0%, ${bg2} 100%)`, color: p.theme.text, overflow: 'hidden' }}>
      {ch.backdrop && <Backdrop theme={p.theme} k={k} />}
      {ch.progress && <div style={{ position: 'absolute', top: 0, left: 0, height: 10 * k, width: `${(frame / durationInFrames) * 100}%`, background: p.theme.accent }} />}
      {(ch.brand || ch.date) && (
        <div style={{ position: 'absolute', top: H * 0.047, left: 70 * k, right: 70 * k, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: font(p.fonts.body), fontWeight: 900 }}>
          {ch.brand ? <span style={{ background: p.theme.accent, color: p.theme.bg, padding: `${12 * k}px ${26 * k}px`, borderRadius: 999, fontSize: 36 * k }}>{p.brand}</span> : <span />}
          {ch.date && <span style={{ fontSize: 32 * k, color: p.theme.sub }}>{p.dateLabel}</span>}
        </div>
      )}

      {seqs.map(({ s, from, len }) => (
        <Sequence key={s.id} from={from} durationInFrames={len} name={s.id}>
          <Scene s={s} p={p} len={len} k={k} H={H} />
          {s.audioUrl && <Audio src={s.audioUrl} />}
        </Sequence>
      ))}

      {p.bgmUrl && vol > 0 && (
        <Audio
          src={p.bgmUrl}
          loop
          volume={(f) => interpolate(f, [0, 15, durationInFrames - 30, durationInFrames], [0, vol, vol, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      )}
    </AbsoluteFill>
  );
};

/** 천천히 움직이는 배경 도형 */
const Backdrop: React.FC<{ theme: ShortProps['theme']; k: number }> = ({ theme, k }) => {
  const f = useCurrentFrame();
  const r = (a: number) => `rotate(${f * a}deg)`;
  return (
    <>
      <div style={{ position: 'absolute', width: 900 * k, height: 900 * k, borderRadius: '50%', border: `${3 * k}px solid ${theme.accent}22`, top: -300 * k, right: -380 * k, transform: r(0.15) }} />
      <div style={{ position: 'absolute', width: 700 * k, height: 700 * k, borderRadius: 120 * k, background: `${theme.accent}0d`, bottom: -260 * k, left: -260 * k, transform: r(-0.1) }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%, transparent 0%, rgba(0,0,0,.35) 100%)' }} />
    </>
  );
};

const Scene: React.FC<{ s: SceneProps; p: ShortProps; len: number; k: number; H: number }> = ({ s, p, len, k, H }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const exit = interpolate(frame, [len - 6, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const motion = s.motion || 'pop';
  const E = s.els || {};
  const show = (key: ElKey) => !E[key]?.hidden;

  const wrap: React.CSSProperties = { opacity: Math.min(enter * 1.4, 1) * exit };
  if (motion === 'pop') wrap.transform = `scale(${interpolate(enter, [0, 1], [0.6, 1])})`;
  if (motion === 'slide') wrap.transform = `translateY(${interpolate(enter, [0, 1], [120 * k, 0])}px)`;
  if (motion === 'zoom') {
    wrap.transform = `scale(${interpolate(enter, [0, 1], [1.35, 1])})`;
    wrap.filter = `blur(${interpolate(enter, [0, 1], [14, 0])}px)`;
  }

  const T = 130 * p.scale.title * k;
  const B = 56 * p.scale.body * k;

  const headline = motion === 'typewriter'
    ? [...s.headline].slice(0, Math.floor(interpolate(frame, [0, Math.min(len * 0.5, 30)], [0, [...s.headline].length], { extrapolateRight: 'clamp' }))).join('')
    : s.headline;

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: H * 0.1875, left: 80 * k, right: 80 * k, bottom: H * 0.29, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', ...wrap }}>
        {s.icon && show('icon') && (
          <div style={{ fontSize: 150 * k, marginBottom: 20 * k, transform: `${elT(E.icon, k) || ''} translateY(${Math.sin(frame / 8) * 8 * k}px)` }}>{s.icon}</div>
        )}

        {s.layout === 'stat' && show('stat') && <Stat s={s} p={p} frame={frame} motion={motion} k={k} />}

        {show('headline') && (
          <div style={{ fontFamily: font(E.headline?.font || p.fonts.title), color: E.headline?.color || p.theme.text, fontSize: s.layout === 'stat' ? T * 0.7 : T, lineHeight: 1.18, wordBreak: 'keep-all', whiteSpace: 'pre-line', textShadow: '0 8px 30px rgba(0,0,0,.35)', transform: elT(E.headline, k) }}>
            <Emph text={headline} words={s.emphasis} color={p.theme.accent} />
          </div>
        )}

        {s.sub && show('sub') && (
          <div style={{ fontFamily: font(E.sub?.font || p.fonts.body), fontWeight: 700, fontSize: B, color: E.sub?.color || p.theme.sub, marginTop: 36 * k, whiteSpace: 'pre-line', transform: elT(E.sub, k), opacity: interpolate(frame, [8, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
            {s.sub}
          </div>
        )}

        {(s.layout === 'list' || s.layout === 'compare') && show('items') && (
          <div style={{ display: 'grid', gridTemplateColumns: s.layout === 'compare' ? '1fr 1fr' : '1fr', gap: 26 * k, marginTop: 56 * k, width: '100%', transform: elT(E.items, k) }}>
            {(s.items || []).map((it, i) => {
              const a = spring({ frame: frame - 8 - i * 7, fps, config: { damping: 15 } });
              const hot = s.layout === 'compare' && i === 1;
              return (
                <div key={i} style={{
                  background: hot ? p.theme.accent : E.items?.bg || 'rgba(255,255,255,.1)',
                  color: hot ? p.theme.bg : E.items?.color || p.theme.text,
                  borderRadius: 28 * k, padding: `${34 * k}px ${30 * k}px`, fontFamily: font(E.items?.font || p.fonts.body), fontWeight: 900, fontSize: B * 1.05,
                  opacity: a, transform: `translateX(${interpolate(a, [0, 1], [i % 2 ? 80 * k : -80 * k, 0])}px)`,
                  textAlign: s.layout === 'list' ? 'left' : 'center',
                }}>
                  {s.layout === 'list' && <span style={{ color: p.theme.accent, marginRight: 18 * k }}>{String(i + 1).padStart(2, '0')}</span>}
                  {it}
                </div>
              );
            })}
          </div>
        )}

        {s.layout === 'cta' && show('cta') && (
          <div style={{ transform: elT(E.cta, k) }}>
            <div style={{
              marginTop: 60 * k, background: E.cta?.bg || p.theme.accent, color: E.cta?.color || p.theme.bg, fontFamily: font(E.cta?.font || p.fonts.body), fontWeight: 900, fontSize: B * 1.1,
              padding: `${30 * k}px ${54 * k}px`, borderRadius: 999, transform: `scale(${1 + Math.sin(frame / 5) * 0.03})`,
            }}>
              {s.cta || '👇 고정 댓글 · 프로필 링크'}
            </div>
          </div>
        )}
      </div>
      {show('caption') && !p.caption?.hidden && <Captions s={s} p={p} len={len} k={k} H={H} />}
    </AbsoluteFill>
  );
};

const Stat: React.FC<{ s: SceneProps; p: ShortProps; frame: number; motion: string; k: number }> = ({ s, p, frame, motion, k }) => {
  const raw = s.value || '';
  const m = raw.match(/^([^\d]*)([\d.,]+)(.*)$/);
  let shown = raw;
  if (m && motion === 'countup') {
    const target = Number(m[2].replace(/,/g, ''));
    const dec = (m[2].split('.')[1] || '').length;
    const v = interpolate(frame, [0, 24], [0, target], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    shown = m[1] + v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3];
  }
  const e = s.els?.stat;
  return (
    <div style={{ fontFamily: font(e?.font || p.fonts.title), color: e?.color || p.theme.accent, fontSize: 250 * p.scale.title * k, lineHeight: 1, marginBottom: 24 * k, transform: elT(e, k) }}>
      {shown}<span style={{ fontSize: 100 * p.scale.title * k }}>{s.unit}</span>
    </div>
  );
};

const Emph: React.FC<{ text: string; words?: string[]; color: string }> = ({ text, words = [], color }) => {
  const w = words.filter(Boolean);
  if (!w.length) return <>{text}</>;
  const re = new RegExp(`(${w.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return <>{text.split(re).map((part, i) => (w.includes(part) ? <span key={i} style={{ color }}>{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>))}</>;
};

/** 내레이션 길이 비례로 자막 컷 분배 */
const Captions: React.FC<{ s: SceneProps; p: ShortProps; len: number; k: number; H: number }> = ({ s, p, len, k, H }) => {
  const frame = useCurrentFrame();
  const cs = p.caption || {};
  const e = s.els?.caption;
  const caps = s.captions?.length ? s.captions : [s.narration];
  const weights = caps.map((c) => Math.max(1, c.replace(/\s/g, '').length));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const idx = caps.findIndex((_, i) => {
    acc += weights[i];
    return frame < (acc / total) * len;
  });
  const i = idx < 0 ? caps.length - 1 : idx;
  const capStart = Math.round((weights.slice(0, i).reduce((a, b) => a + b, 0) / total) * len);
  const pop = interpolate(frame - capStart, [0, 4], [0.85, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const box = cs.box !== false;
  return (
    <div style={{ position: 'absolute', bottom: cs.bottom != null ? cs.bottom * k : H * 0.1875, left: 60 * k, right: 60 * k, display: 'flex', justifyContent: 'center', transform: elT(e, k) }}>
      <span style={{
        background: box ? e?.bg || cs.bg || 'rgba(0,0,0,.72)' : 'transparent', borderRadius: 20 * k, padding: `${18 * k}px ${34 * k}px`, transform: `scale(${pop})`,
        fontFamily: font(e?.font || cs.font || p.fonts.body), fontWeight: 900, fontSize: 68 * p.scale.caption * (cs.size ?? 1) * k, lineHeight: 1.3, textAlign: 'center', wordBreak: 'keep-all',
        color: e?.color || cs.color || '#fff',
        WebkitTextStroke: cs.stroke || !box ? `${Math.max(2, 6 * k)}px rgba(0,0,0,.85)` : '1px rgba(0,0,0,.4)',
        paintOrder: 'stroke fill',
      }}>
        <Emph text={caps[i] || ''} words={s.emphasis} color={p.theme.accent} />
      </span>
    </div>
  );
};
