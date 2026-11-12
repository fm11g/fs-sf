import React from 'react';
import {
  AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig,
  type CalculateMetadataFunction,
} from 'remotion';
// 폰트는 워커에서 시스템 폰트로 설치(scripts/fonts.sh) → 이름으로 바로 사용
const FONTS = ['Black Han Sans', 'Noto Sans KR', 'Do Hyeon', 'Gothic A1'];
const font = (name: string) => `'${FONTS.includes(name) ? name : 'Noto Sans KR'}', 'Noto Sans CJK KR', sans-serif`;

export const FPS = 30;
const TAIL = 0.6; // 마지막 여운(초)

export type SceneProps = {
  id: string; layout: string; headline: string; sub?: string; items?: string[]; value?: string; unit?: string;
  emphasis?: string[]; motion?: string; icon?: string;
  narration: string; captions: string[]; audioUrl: string; durationSec: number;
};
export type ShortProps = {
  brand: string; dateLabel: string;
  theme: { bg: string; bg2: string; accent: string; text: string; sub: string };
  fonts: { title: string; body: string };
  scale: { title: number; body: number; caption: number };
  scenes: SceneProps[];
  bgmUrl?: string | null;
};

export const calcMeta: CalculateMetadataFunction<ShortProps> = ({ props }) => ({
  durationInFrames: Math.max(30, Math.ceil((props.scenes.reduce((n, s) => n + s.durationSec, 0) + TAIL) * FPS)),
});

export const Short: React.FC<ShortProps> = (p) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  let start = 0;
  const seqs = p.scenes.map((s) => {
    const len = Math.max(1, Math.round(s.durationSec * FPS));
    const from = start;
    start += len;
    return { s, from, len };
  });

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${p.theme.bg} 0%, ${p.theme.bg2} 100%)`, color: p.theme.text, overflow: 'hidden' }}>
      <Backdrop theme={p.theme} />
      {/* 상단 브랜드 + 진행바 */}
      <div style={{ position: 'absolute', top: 0, left: 0, height: 10, width: `${(frame / durationInFrames) * 100}%`, background: p.theme.accent }} />
      <div style={{ position: 'absolute', top: 90, left: 70, right: 70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: font(p.fonts.body), fontWeight: 900 }}>
        <span style={{ background: p.theme.accent, color: p.theme.bg, padding: '12px 26px', borderRadius: 999, fontSize: 36 }}>{p.brand}</span>
        <span style={{ fontSize: 32, color: p.theme.sub }}>{p.dateLabel}</span>
      </div>

      {seqs.map(({ s, from, len }) => (
        <Sequence key={s.id} from={from} durationInFrames={len} name={s.id}>
          <Scene s={s} p={p} len={len} />
          {s.audioUrl && <Audio src={s.audioUrl} />}
        </Sequence>
      ))}

      {p.bgmUrl && (
        <Audio
          src={p.bgmUrl}
          loop
          volume={(f) => interpolate(f, [0, 15, durationInFrames - 30, durationInFrames], [0, 0.12, 0.12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      )}
    </AbsoluteFill>
  );
};

/** 천천히 움직이는 배경 도형 */
const Backdrop: React.FC<{ theme: ShortProps['theme'] }> = ({ theme }) => {
  const f = useCurrentFrame();
  const r = (a: number) => `rotate(${f * a}deg)`;
  return (
    <>
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', border: `3px solid ${theme.accent}22`, top: -300, right: -380, transform: r(0.15) }} />
      <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: 120, background: `${theme.accent}0d`, bottom: -260, left: -260, transform: r(-0.1) }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%, transparent 0%, rgba(0,0,0,.35) 100%)' }} />
    </>
  );
};

const Scene: React.FC<{ s: SceneProps; p: ShortProps; len: number }> = ({ s, p, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const exit = interpolate(frame, [len - 6, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const motion = s.motion || 'pop';

  const wrap: React.CSSProperties = { opacity: Math.min(enter * 1.4, 1) * exit };
  if (motion === 'pop') wrap.transform = `scale(${interpolate(enter, [0, 1], [0.6, 1])})`;
  if (motion === 'slide') wrap.transform = `translateY(${interpolate(enter, [0, 1], [120, 0])}px)`;
  if (motion === 'zoom') {
    wrap.transform = `scale(${interpolate(enter, [0, 1], [1.35, 1])})`;
    wrap.filter = `blur(${interpolate(enter, [0, 1], [14, 0])}px)`;
  }

  const T = 130 * p.scale.title;
  const B = 56 * p.scale.body;

  const headline = motion === 'typewriter'
    ? [...s.headline].slice(0, Math.floor(interpolate(frame, [0, Math.min(len * 0.5, 30)], [0, [...s.headline].length], { extrapolateRight: 'clamp' }))).join('')
    : s.headline;

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 360, left: 80, right: 80, bottom: 560, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', ...wrap }}>
        {s.icon && <div style={{ fontSize: 150, marginBottom: 20, transform: `translateY(${Math.sin(frame / 8) * 8}px)` }}>{s.icon}</div>}

        {s.layout === 'stat' && <Stat s={s} p={p} frame={frame} motion={motion} />}

        <div style={{ fontFamily: font(p.fonts.title), fontSize: s.layout === 'stat' ? T * 0.7 : T, lineHeight: 1.18, wordBreak: 'keep-all', textShadow: '0 8px 30px rgba(0,0,0,.35)' }}>
          <Emph text={headline} words={s.emphasis} color={p.theme.accent} />
        </div>

        {s.sub && (
          <div style={{ fontFamily: font(p.fonts.body), fontWeight: 700, fontSize: B, color: p.theme.sub, marginTop: 36, opacity: interpolate(frame, [8, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
            {s.sub}
          </div>
        )}

        {(s.layout === 'list' || s.layout === 'compare') && (
          <div style={{ display: 'grid', gridTemplateColumns: s.layout === 'compare' ? '1fr 1fr' : '1fr', gap: 26, marginTop: 56, width: '100%' }}>
            {(s.items || []).map((it, i) => {
              const a = spring({ frame: frame - 8 - i * 7, fps, config: { damping: 15 } });
              return (
                <div key={i} style={{
                  background: s.layout === 'compare' && i === 1 ? p.theme.accent : 'rgba(255,255,255,.1)',
                  color: s.layout === 'compare' && i === 1 ? p.theme.bg : p.theme.text,
                  borderRadius: 28, padding: '34px 30px', fontFamily: font(p.fonts.body), fontWeight: 900, fontSize: B * 1.05,
                  opacity: a, transform: `translateX(${interpolate(a, [0, 1], [i % 2 ? 80 : -80, 0])}px)`,
                  textAlign: s.layout === 'list' ? 'left' : 'center',
                }}>
                  {s.layout === 'list' && <span style={{ color: p.theme.accent, marginRight: 18 }}>{String(i + 1).padStart(2, '0')}</span>}
                  {it}
                </div>
              );
            })}
          </div>
        )}

        {s.layout === 'cta' && (
          <div style={{
            marginTop: 60, background: p.theme.accent, color: p.theme.bg, fontFamily: font(p.fonts.body), fontWeight: 900, fontSize: B * 1.1,
            padding: '30px 54px', borderRadius: 999, transform: `scale(${1 + Math.sin(frame / 5) * 0.03})`,
          }}>
            👇 고정 댓글 · 프로필 링크
          </div>
        )}
      </div>
      <Captions s={s} p={p} len={len} />
    </AbsoluteFill>
  );
};

const Stat: React.FC<{ s: SceneProps; p: ShortProps; frame: number; motion: string }> = ({ s, p, frame, motion }) => {
  const raw = s.value || '';
  const m = raw.match(/^([^\d]*)([\d.,]+)(.*)$/);
  let shown = raw;
  if (m && motion === 'countup') {
    const target = Number(m[2].replace(/,/g, ''));
    const dec = (m[2].split('.')[1] || '').length;
    const v = interpolate(frame, [0, 24], [0, target], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    shown = m[1] + v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3];
  }
  return (
    <div style={{ fontFamily: font(p.fonts.title), color: p.theme.accent, fontSize: 250 * p.scale.title, lineHeight: 1, marginBottom: 24 }}>
      {shown}<span style={{ fontSize: 100 * p.scale.title }}>{s.unit}</span>
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
const Captions: React.FC<{ s: SceneProps; p: ShortProps; len: number }> = ({ s, p, len }) => {
  const frame = useCurrentFrame();
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
  return (
    <div style={{ position: 'absolute', bottom: 360, left: 60, right: 60, display: 'flex', justifyContent: 'center' }}>
      <span style={{
        background: 'rgba(0,0,0,.72)', borderRadius: 20, padding: '18px 34px', transform: `scale(${pop})`,
        fontFamily: font(p.fonts.body), fontWeight: 900, fontSize: 68 * p.scale.caption, lineHeight: 1.3, textAlign: 'center', wordBreak: 'keep-all',
        color: '#fff', WebkitTextStroke: '1px rgba(0,0,0,.4)',
      }}>
        <Emph text={caps[i]} words={s.emphasis} color={p.theme.accent} />
      </span>
    </div>
  );
};
