import React from 'react';
import { Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Emph, alpha, countText, elT, font, fw, isLight, prog, tint, type ElKey, type SceneProps, type ShortProps } from './common';

/**
 * 언론사 템플릿 — 공식·신뢰 톤.
 * 원칙: 왼쪽 정렬 · 색 3개(바탕/브랜드/속보 빨강) · 절제된 모션(마스크 리빌·와이프·카운트업) · 출처 표기 · 쇼츠 UI 안전 영역
 */
export const NEWS_LAYOUTS: [string, string][] = [
  ['breaking', '속보 오프닝 (태그 + 큰 제목)'], ['headline', '기사 제목 카드'], ['stat', '데이터 (큰 숫자)'], ['list', '요점 번호 목록'],
  ['compare', '비교 (두 패널)'], ['quote', '인용'], ['document', '공고문 요약'], ['timeline', '일정 (날짜|내용)'], ['cta', '안내 (신청 방법)'], ['footage', '자료화면 (영상·이미지)'],
];
export const NEWS_THEME = { bg: '#0B1424', bg2: '#0F1D33', accent: '#2B6CDF', text: '#FFFFFF', sub: '#AAB6C8', surface: '#FFFFFF', ink: '#0E1726', alert: '#D6282E', line: 'rgba(255,255,255,0.16)' };

const t0 = (f: number, fps: number) => f / fps;

const isVideo = (m: NonNullable<SceneProps['media']>) => m.kind ? m.kind === 'video' : /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(m.url);

/** 자료 영상·이미지 한 장 (영상은 기본 무음 — 내레이션이 우선) */
export const MediaEl: React.FC<{ m: NonNullable<SceneProps['media']>; style?: React.CSSProperties }> = ({ m, style }) => {
  const st: React.CSSProperties = { width: '100%', height: '100%', objectFit: m.fit || 'cover', objectPosition: m.pos || 'center', display: 'block', ...style };
  if (isVideo(m)) {
    return <OffthreadVideo src={m.url} startFrom={Math.max(0, Math.round((m.start || 0) * 30))} muted={!m.volume} volume={m.volume || 0} style={st} />;
  }
  return <Img src={m.url} style={st} />;
};

/** 배경 자료화면 — footage 가 아닌 레이아웃에 media 를 넣으면 위쪽 채널 띠 아래 전체에 어둡게 깔고 천천히 확대 */
export const SceneMediaBg: React.FC<{ s: SceneProps; p: ShortProps; len: number; k: number; W: number; H: number }> = ({ s, p, len, k, W, H }) => {
  const f = useCurrentFrame();
  if (!s.media?.url || s.layout === 'footage') return null;
  const top = (p.chrome?.ticker ? 300 : 260) * (H / 1920);
  const zoom = interpolate(f, [0, len], [1.04, 1.12]);
  const dim = s.media.dim ?? 0.7;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, bottom: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})` }}><MediaEl m={s.media} /></div>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(p.theme.bg, dim * 0.85)} 0%, ${alpha(p.theme.bg, dim)} 45%, ${alpha(p.theme.bg, Math.min(1, dim + 0.25))} 100%)` }} />
      {s.media.label && <div style={{ position: 'absolute', right: 72 * k, top: 30 * k, fontSize: 26 * k, color: 'rgba(255,255,255,.75)', fontFamily: font(p.fonts.body), fontWeight: 600, letterSpacing: '0.04em' }}>{s.media.label}</div>}
    </div>
  );
};

/** 글줄 마스크 리빌 (아래에서 올라옴) */
const Reveal: React.FC<{ t: number; at: number; dur?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ t, at, dur = 0.45, children, style }) => {
  const e = prog(t, at, dur, 'expo');
  return (
    <div style={{ overflow: 'hidden', ...style }}>
      <div style={{ transform: `translateY(${(1 - e) * 105}%)`, opacity: e > 0 ? 1 : 0 }}>{children}</div>
    </div>
  );
};

/** 상단 고정: 채널 표시(버그) · 날짜 · 구분선+진행 · (선택) 티커 */
export const NewsChrome: React.FC<{ p: ShortProps; k: number; W: number; H: number }> = ({ p, k, W, H }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = t0(frame, fps);
  const th = { ...NEWS_THEME, ...p.theme };
  const ch = { brand: true, date: true, progress: true, backdrop: true, source: true, ...(p.chrome || {}) };
  const y = (v: number) => (v / 1920) * H;
  const light = isLight(th.bg);
  const bodyF = p.fonts.body;
  return (
    <>
      {ch.backdrop && (
        <>
          {ch.grid !== false && (
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${alpha(light ? '#000000' : '#FFFFFF', 0.035)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(light ? '#000000' : '#FFFFFF', 0.035)} 1px, transparent 1px)`, backgroundSize: `${72 * k}px ${72 * k}px` }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 70% at 0% 0%, ${alpha(th.accent, 0.18)} 0%, transparent 55%)` }} />
          <div style={{ position: 'absolute', inset: 0, background: light ? 'none' : 'radial-gradient(130% 90% at 50% 40%, transparent 55%, rgba(0,0,0,.45) 100%)' }} />
        </>
      )}
      {(ch.brand || ch.date) && (
        <div style={{ position: 'absolute', top: y(108), left: 64 * k, right: 64 * k, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {ch.brand ? (
            <div style={{ display: 'flex', alignItems: 'stretch', clipPath: `inset(0 ${(1 - prog(t, 0, 0.35)) * 100}% 0 0)` }}>
              <span style={{ width: 9 * k, background: th.alert }} />
              <span style={{ background: th.accent, color: '#fff', fontFamily: font(bodyF), fontWeight: fw(bodyF, 800), fontSize: 33 * k, letterSpacing: '-0.01em', padding: `${11 * k}px ${20 * k}px` }}>{ch.bug || p.brand}</span>
            </div>
          ) : <span />}
          {ch.date && <span style={{ fontFamily: font(bodyF), fontWeight: fw(bodyF, 500), fontSize: 29 * k, color: th.sub, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em' }}>{p.dateNews || p.dateLabel}</span>}
        </div>
      )}
      {ch.progress && (
        <div style={{ position: 'absolute', top: y(200), left: 64 * k, right: 64 * k, height: Math.max(2, 3 * k), background: th.line }}>
          <div style={{ height: '100%', width: `${(frame / durationInFrames) * 100}%`, background: th.accent }} />
        </div>
      )}
      {ch.ticker && (
        <div style={{ position: 'absolute', top: y(222), left: 64 * k, right: 64 * k, height: 58 * k, display: 'flex', alignItems: 'center', overflow: 'hidden', background: alpha(light ? '#000' : '#fff', 0.06) }}>
          <span style={{ flex: 'none', background: th.alert, color: '#fff', height: '100%', display: 'flex', alignItems: 'center', padding: `0 ${18 * k}px`, fontFamily: font(bodyF), fontWeight: fw(bodyF, 800), fontSize: 27 * k, zIndex: 1 }}>{ch.tickerLabel || '속보'}</span>
          <div style={{ whiteSpace: 'nowrap', fontFamily: font(bodyF), fontWeight: fw(bodyF, 500), fontSize: 28 * k, color: th.text, paddingLeft: 24 * k, transform: `translateX(${-((frame * 2.2 * k) % (W * 2))}px)` }}>
            {[1, 2, 3].map((i) => <span key={i} style={{ marginRight: 80 * k }}>{ch.tickerText || `${p.brand} · 공고 원문과 출처를 함께 확인하세요`}</span>)}
          </div>
        </div>
      )}
    </>
  );
};

/** 장면 */
export const NewsScene: React.FC<{ s: SceneProps; p: ShortProps; len: number; k: number; W: number; H: number }> = ({ s, p, len, k, W, H }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = t0(frame, fps);
  const th = { ...NEWS_THEME, ...p.theme };
  const E = s.els || {};
  const show = (key: ElKey) => !E[key]?.hidden;
  const y = (v: number) => (v / 1920) * H;
  const exit = interpolate(frame, [len - 7, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const TF = p.fonts.title;
  const BF = p.fonts.body;
  const NF = p.fonts.number || p.fonts.title;
  const TW = p.fonts.titleWeight ?? 800;
  const BW = p.fonts.bodyWeight ?? 500;
  const sc = p.scale;
  const layout = s.layout === 'hook' ? 'breaking' : s.layout;
  const top = (p.chrome?.ticker ? 320 : 290);
  // 바탕이 밝으면 브랜드색 그대로, 어두우면 밝게 띄운 색
  const lightBg = isLight(th.bg);
  const acc2 = lightBg ? th.accent : tint(th.accent, 0.45);
  const alert2 = lightBg ? th.alert : tint(th.alert, 0.4);
  const hlc = lightBg ? th.alert : p.caption?.highlight || '#FFD54A'; // 밝은 바탕에서 노랑은 안 읽힘 → 빨강

  // 공통 텍스트 스타일 (요소별 편집값 반영)
  const T = (key: ElKey, base: React.CSSProperties, fName: string, wDef: number): React.CSSProperties => ({
    fontFamily: font(E[key]?.font || fName), fontWeight: fw(E[key]?.font || fName, E[key]?.weight ?? wDef),
    color: E[key]?.color || (base.color as string), textAlign: E[key]?.align || (base.textAlign as any) || 'left',
    letterSpacing: E[key]?.letterSpacing != null ? `${E[key]!.letterSpacing}em` : base.letterSpacing,
    lineHeight: E[key]?.lineHeight ?? base.lineHeight, wordBreak: 'keep-all', whiteSpace: 'pre-line', ...base, ...(E[key]?.color ? { color: E[key]!.color } : {}), transform: elT(E[key], k),
  });
  const lines = (txt: string) => (txt || '').split('\n');

  const Source = () => (p.chrome?.source !== false && s.source && show('source') ? (
    <div style={{ ...T('source', { fontSize: 28 * k, color: th.sub, letterSpacing: '0.01em' }, BF, 500), marginTop: 44 * k, opacity: prog(t, 0.7, 0.4), display: 'flex', alignItems: 'center', gap: 12 * k }}>
      <span style={{ width: 22 * k, height: 2 * k, background: th.sub, display: 'inline-block' }} /> 출처 · {s.source}
    </div>
  ) : null);
  const Kicker = ({ color = th.sub, at = 0.1 }: { color?: string; at?: number }) => (s.kicker && show('kicker') ? (
    <div style={{ ...T('kicker', { fontSize: 34 * k, color, letterSpacing: '0.02em' }, BF, 700), marginBottom: 22 * k, opacity: prog(t, at, 0.35) }}>{s.kicker}</div>
  ) : null);

  let body: React.ReactNode = null;

  if (layout === 'breaking') {
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 * k, marginBottom: 34 * k }}>
          {show('tag') && <span style={{ ...T('tag', { fontSize: 40 * k, color: '#fff', letterSpacing: '0.02em' }, BF, 800), background: E.tag?.bg || th.alert, padding: `${10 * k}px ${24 * k}px`, clipPath: `inset(0 ${(1 - prog(t, 0, 0.28)) * 100}% 0 0)` }}>{s.tag || '속보'}</span>}
          {s.kicker && show('kicker') && <span style={{ ...T('kicker', { fontSize: 34 * k, color: th.sub }, BF, 600), opacity: prog(t, 0.2, 0.3) }}>{s.kicker}</span>}
        </div>
        {show('headline') && (
          <div style={T('headline', { fontSize: 104 * sc.title * k, color: th.text, lineHeight: 1.16, letterSpacing: '-0.025em' }, TF, TW)}>
            {lines(s.headline).map((ln, i) => <Reveal key={i} t={t} at={0.15 + i * 0.12}><Emph text={ln} words={s.emphasis} color={hlc} /></Reveal>)}
          </div>
        )}
        <div style={{ width: 150 * k, height: 10 * k, background: th.alert, marginTop: 40 * k, transform: `scaleX(${prog(t, 0.45, 0.4)})`, transformOrigin: 'left' }} />
        {s.sub && show('sub') && <div style={{ ...T('sub', { fontSize: 46 * sc.body * k, color: th.sub, lineHeight: 1.45 }, BF, BW), marginTop: 34 * k, opacity: prog(t, 0.55, 0.4), transform: `translateY(${(1 - prog(t, 0.55, 0.4)) * 20 * k}px)` }}>{s.sub}</div>}
        <Source />
      </>
    );
  } else if (layout === 'headline') {
    const e = prog(t, 0, 0.5, 'expo');
    body = (
      <div style={{ background: E.headline?.bg || th.surface, borderRadius: 6 * k, padding: `${58 * k}px ${54 * k}px`, boxShadow: `0 ${24 * k}px ${60 * k}px rgba(0,0,0,.35)`, transform: `translateY(${(1 - e) * 80 * k}px)`, opacity: e, borderTop: `${10 * k}px solid ${th.accent}` }}>
        <Kicker color={th.accent} at={0.25} />
        {show('headline') && (
          <div style={T('headline', { fontSize: 82 * sc.title * k, color: th.ink, lineHeight: 1.22, letterSpacing: '-0.02em' }, TF, TW)}>
            {lines(s.headline).map((ln, i) => <Reveal key={i} t={t} at={0.3 + i * 0.1}><Emph text={ln} words={s.emphasis} color={th.alert} /></Reveal>)}
          </div>
        )}
        {s.sub && show('sub') && (
          <>
            <div style={{ height: 2 * k, background: '#E5E7EB', margin: `${34 * k}px 0`, transform: `scaleX(${prog(t, 0.55, 0.4)})`, transformOrigin: 'left' }} />
            <div style={{ ...T('sub', { fontSize: 40 * sc.body * k, color: '#4B5563', lineHeight: 1.5 }, BF, BW), opacity: prog(t, 0.65, 0.4) }}>{s.sub}</div>
          </>
        )}
        {s.source && p.chrome?.source !== false && show('source') && <div style={{ ...T('source', { fontSize: 26 * k, color: '#6B7280' }, BF, 500), marginTop: 30 * k, opacity: prog(t, 0.8, 0.4) }}>출처 · {s.source}</div>}
      </div>
    );
  } else if (layout === 'stat') {
    const c = prog(t, 0.2, 1.0, 'out');
    body = (
      <>
        <Kicker />
        {show('headline') && <div style={T('headline', { fontSize: 54 * sc.title * k, color: th.text, lineHeight: 1.3 }, TF, Math.min(TW, 800))}><Reveal t={t} at={0.05}><Emph text={s.headline} words={s.emphasis} color={hlc} /></Reveal></div>}
        {show('stat') && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 * k, marginTop: 20 * k, transform: elT(E.stat, k) }}>
            <span style={{ fontFamily: font(E.stat?.font || NF), fontWeight: fw(E.stat?.font || NF, E.stat?.weight ?? (p.fonts.numberWeight ?? 800)), fontSize: 236 * sc.title * k, lineHeight: 1, color: E.stat?.color || th.text, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
              {s.motion === 'none' ? s.value : countText(s.value || '', c)}
            </span>
            <span style={{ fontFamily: font(NF), fontWeight: fw(NF, 800), fontSize: 92 * sc.title * k, color: acc2, letterSpacing: '-0.02em' }}>{s.unit}</span>
          </div>
        )}
        <div style={{ height: 6 * k, background: th.line, marginTop: 26 * k, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${prog(t, 0.25, 0.9) * 100}%`, background: th.accent }} />
        </div>
        {s.sub && show('sub') && <div style={{ ...T('sub', { fontSize: 44 * sc.body * k, color: th.sub, lineHeight: 1.45 }, BF, BW), marginTop: 28 * k, opacity: prog(t, 0.6, 0.4) }}>{s.sub}</div>}
        <Source />
      </>
    );
  } else if (layout === 'list') {
    body = (
      <>
        <Kicker />
        {show('headline') && <div style={T('headline', { fontSize: 66 * sc.title * k, color: th.text, lineHeight: 1.25, letterSpacing: '-0.02em' }, TF, TW)}><Reveal t={t} at={0.05}><Emph text={s.headline} words={s.emphasis} color={hlc} /></Reveal></div>}
        <div style={{ marginTop: 40 * k, transform: elT(E.items, k) }}>
          {(s.items || []).map((it, i) => {
            const at = 0.3 + i * 0.16;
            const e = prog(t, at, 0.45, 'expo');
            return (
              <div key={i} style={{ borderTop: `${2 * k}px solid ${th.line}`, padding: `${30 * k}px 0`, display: 'flex', gap: 28 * k, alignItems: 'baseline', opacity: e, transform: `translateX(${(1 - e) * -40 * k}px)`, ...(i === (s.items || []).length - 1 ? { borderBottom: `${2 * k}px solid ${th.line}` } : {}) }}>
                <span style={{ fontFamily: font(NF), fontWeight: fw(NF, 800), fontSize: 46 * k, color: E.items?.color || acc2, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: font(E.items?.font || BF), fontWeight: fw(E.items?.font || BF, E.items?.weight ?? 600), fontSize: 50 * sc.body * k, color: th.text, lineHeight: 1.35, wordBreak: 'keep-all' }}>
                  <Emph text={it} words={s.emphasis} color={hlc} />
                </span>
              </div>
            );
          })}
        </div>
        <Source />
      </>
    );
  } else if (layout === 'compare') {
    const [a, b] = (s.items || []).map((x) => { const [l, ...r] = x.split('|'); return r.length ? { label: l.trim(), text: r.join('|').trim() } : { label: '', text: l.trim() }; });
    const Panel = ({ v, hot, at }: { v?: { label: string; text: string }; hot: boolean; at: number }) => {
      const e = prog(t, at, 0.5, 'expo');
      return v ? (
        <div style={{ background: hot ? th.accent : alpha(th.text, 0.06), border: hot ? 'none' : `${2 * k}px solid ${th.line}`, padding: `${38 * k}px ${40 * k}px`, opacity: e, transform: `translateY(${(1 - e) * 40 * k}px)` }}>
          {v.label && <div style={{ fontFamily: font(BF), fontWeight: fw(BF, 700), fontSize: 32 * k, color: hot ? 'rgba(255,255,255,.85)' : th.sub, marginBottom: 12 * k, letterSpacing: '0.02em' }}>{v.label}</div>}
          <div style={{ fontFamily: font(E.items?.font || BF), fontWeight: fw(E.items?.font || BF, E.items?.weight ?? 700), fontSize: 52 * sc.body * k, color: hot ? '#fff' : th.text, lineHeight: 1.3, wordBreak: 'keep-all' }}>{v.text}</div>
        </div>
      ) : null;
    };
    body = (
      <>
        <Kicker />
        {show('headline') && <div style={T('headline', { fontSize: 64 * sc.title * k, color: th.text, lineHeight: 1.25 }, TF, TW)}><Reveal t={t} at={0.05}><Emph text={s.headline} words={s.emphasis} color={hlc} /></Reveal></div>}
        <div style={{ display: 'grid', gap: 22 * k, marginTop: 40 * k, transform: elT(E.items, k) }}>
          <Panel v={a} hot={false} at={0.3} />
          <div style={{ fontFamily: font(BF), fontWeight: fw(BF, 800), fontSize: 30 * k, color: th.sub, textAlign: 'center', opacity: prog(t, 0.45, 0.3) }}>▼</div>
          <Panel v={b} hot at={0.55} />
        </div>
        <Source />
      </>
    );
  } else if (layout === 'quote') {
    body = (
      <>
        <div style={{ fontFamily: font('Noto Serif KR'), fontWeight: 900, fontSize: 230 * k, lineHeight: 0.8, color: th.alert, height: 150 * k, opacity: prog(t, 0, 0.4), transform: `scale(${0.8 + 0.2 * prog(t, 0, 0.5, 'back')})`, transformOrigin: 'left top' }}>“</div>
        {show('headline') && (
          <div style={T('headline', { fontSize: 72 * sc.title * k, color: th.text, lineHeight: 1.36, letterSpacing: '-0.02em' }, TF, Math.min(TW, 700))}>
            {lines(s.headline).map((ln, i) => <Reveal key={i} t={t} at={0.2 + i * 0.12}><Emph text={ln} words={s.emphasis} color={hlc} /></Reveal>)}
          </div>
        )}
        {(s.source || s.sub) && show('sub') && <div style={{ ...T('sub', { fontSize: 36 * k, color: th.sub }, BF, 600), marginTop: 40 * k, opacity: prog(t, 0.6, 0.4) }}>— {s.sub || s.source}</div>}
      </>
    );
  } else if (layout === 'document') {
    const e = prog(t, 0, 0.55, 'expo');
    body = (
      <div style={{ background: '#FBFAF6', color: '#1F2937', padding: `${52 * k}px ${50 * k}px`, boxShadow: `0 ${30 * k}px ${70 * k}px rgba(0,0,0,.4)`, transform: `translateY(${(1 - e) * 90 * k}px) rotate(${-1.2 * e}deg)`, opacity: e }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 * k, marginBottom: 24 * k }}>
          <span style={{ background: th.alert, color: '#fff', fontFamily: font(BF), fontWeight: fw(BF, 800), fontSize: 30 * k, padding: `${6 * k}px ${16 * k}px` }}>{s.tag || '공고'}</span>
          {s.kicker && <span style={{ fontFamily: font(BF), fontWeight: fw(BF, 600), fontSize: 30 * k, color: '#6B7280' }}>{s.kicker}</span>}
        </div>
        {show('headline') && <div style={T('headline', { fontSize: 60 * sc.title * k, color: '#111827', lineHeight: 1.28, letterSpacing: '-0.02em' }, TF, TW)}>{s.headline}</div>}
        <div style={{ height: 3 * k, background: '#111827', margin: `${28 * k}px 0 ${18 * k}px` }} />
        {(s.items || []).map((it, i) => {
          const at = 0.45 + i * 0.22;
          const mark = (s.emphasis || []).some((w) => w && it.includes(w)) || i === 0;
          return (
            <div key={i} style={{ position: 'relative', fontFamily: font(BF), fontWeight: fw(BF, 500), fontSize: 40 * sc.body * k, lineHeight: 1.55, padding: `${8 * k}px 0`, opacity: prog(t, at - 0.15, 0.3), wordBreak: 'keep-all' }}>
              {mark && <span style={{ position: 'absolute', left: -6 * k, right: 0, top: '52%', height: '42%', background: 'rgba(255,214,74,.55)', transform: `scaleX(${prog(t, at, 0.5)})`, transformOrigin: 'left' }} />}
              <span style={{ position: 'relative' }}>· {it}</span>
            </div>
          );
        })}
        {s.source && <div style={{ fontFamily: font(BF), fontWeight: fw(BF, 500), fontSize: 26 * k, color: '#6B7280', marginTop: 24 * k }}>출처 · {s.source}</div>}
      </div>
    );
  } else if (layout === 'timeline') {
    const rows = (s.items || []).map((x) => { const [d, ...r] = x.split('|'); return { d: d.trim(), text: r.join('|').trim() || d.trim() }; });
    body = (
      <>
        <Kicker />
        {show('headline') && <div style={T('headline', { fontSize: 64 * sc.title * k, color: th.text, lineHeight: 1.25 }, TF, TW)}><Reveal t={t} at={0.05}><Emph text={s.headline} words={s.emphasis} color={hlc} /></Reveal></div>}
        <div style={{ position: 'relative', marginTop: 44 * k, paddingLeft: 56 * k }}>
          <div style={{ position: 'absolute', left: 14 * k, top: 18 * k, bottom: 18 * k, width: 4 * k, background: th.line, transform: `scaleY(${prog(t, 0.2, 0.8)})`, transformOrigin: 'top' }} />
          {rows.map((r, i) => {
            const last = i === rows.length - 1;
            const e = prog(t, 0.3 + i * 0.2, 0.45, 'expo');
            return (
              <div key={i} style={{ position: 'relative', padding: `${20 * k}px 0`, opacity: e, transform: `translateX(${(1 - e) * 30 * k}px)` }}>
                <span style={{ position: 'absolute', left: -52 * k, top: 34 * k, width: 28 * k, height: 28 * k, borderRadius: '50%', background: last ? th.alert : th.accent, boxShadow: `0 0 0 ${6 * k}px ${alpha(last ? th.alert : th.accent, 0.25)}` }} />
                <div style={{ fontFamily: font(NF), fontWeight: fw(NF, 800), fontSize: 44 * k, color: last ? alert2 : acc2, fontVariantNumeric: 'tabular-nums' }}>{r.d}</div>
                <div style={{ fontFamily: font(BF), fontWeight: fw(BF, last ? 700 : 500), fontSize: 46 * sc.body * k, color: th.text, marginTop: 4 * k, wordBreak: 'keep-all' }}>{r.text}</div>
              </div>
            );
          })}
        </div>
        <Source />
      </>
    );
  } else if (layout === 'cta') {
    const e = prog(t, 0.35, 0.5, 'expo');
    body = (
      <>
        <Kicker />
        {show('headline') && (
          <div style={T('headline', { fontSize: 78 * sc.title * k, color: th.text, lineHeight: 1.22, letterSpacing: '-0.02em' }, TF, TW)}>
            {lines(s.headline).map((ln, i) => <Reveal key={i} t={t} at={0.05 + i * 0.12}><Emph text={ln} words={s.emphasis} color={hlc} /></Reveal>)}
          </div>
        )}
        {show('cta') && (
          <div style={{ marginTop: 50 * k, display: 'inline-flex', alignItems: 'center', gap: 18 * k, background: E.cta?.bg || th.surface, color: E.cta?.color || th.ink, padding: `${30 * k}px ${40 * k}px`, borderLeft: `${12 * k}px solid ${th.alert}`, opacity: e, transform: `${elT(E.cta, k) || ''} translateY(${(1 - e) * 30 * k}px)` }}>
            <span style={{ fontFamily: font(E.cta?.font || BF), fontWeight: fw(E.cta?.font || BF, E.cta?.weight ?? 800), fontSize: 48 * sc.body * k, wordBreak: 'keep-all' }}>{s.cta || '자세한 신청 방법은 고정 댓글'}</span>
            <span style={{ fontSize: 44 * k, transform: `translateY(${Math.sin(t * 5) * 6 * k}px)` }}>↓</span>
          </div>
        )}
        {s.sub && show('sub') && <div style={{ ...T('sub', { fontSize: 38 * sc.body * k, color: th.sub, lineHeight: 1.45 }, BF, BW), marginTop: 34 * k, opacity: prog(t, 0.65, 0.4) }}>{s.sub}</div>}
        <Source />
      </>
    );
  } else if (layout === 'footage') {
    // 자료화면: 틀 안에 영상·이미지 + '자료화면' 라벨 + 제목·설명·출처
    const e = prog(t, 0, 0.55, 'expo');
    const m = s.media;
    body = (
      <>
        <Kicker />
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', background: '#000', overflow: 'hidden', borderRadius: 4 * k, boxShadow: `0 ${20 * k}px ${50 * k}px rgba(0,0,0,.45)`, clipPath: `inset(0 ${(1 - e) * 100}% 0 0)`, border: `${2 * k}px solid ${th.line}` }}>
          {m?.url ? <div style={{ position: 'absolute', inset: 0, transform: `scale(${interpolate(t, [0, len / fps], [1.0, 1.06])})` }}><MediaEl m={m} /></div>
            : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: th.sub, fontSize: 34 * k, fontFamily: font(BF) }}>자료 영상을 넣으세요 (편집기 → 장면 → 자료)</div>}
          <span style={{ position: 'absolute', left: 24 * k, top: 24 * k, background: alpha('#000000', 0.6), color: '#fff', fontFamily: font(BF), fontWeight: 700, fontSize: 26 * k, padding: `${6 * k}px ${14 * k}px`, letterSpacing: '0.04em' }}>{m?.label || '자료화면'}</span>
        </div>
        {show('headline') && s.headline && (
          <div style={{ ...T('headline', { fontSize: 70 * sc.title * k, color: th.text, lineHeight: 1.22, letterSpacing: '-0.02em' }, TF, TW), marginTop: 40 * k }}>
            {lines(s.headline).map((ln, i) => <Reveal key={i} t={t} at={0.35 + i * 0.1}><Emph text={ln} words={s.emphasis} color={hlc} /></Reveal>)}
          </div>
        )}
        {s.sub && show('sub') && <div style={{ ...T('sub', { fontSize: 38 * sc.body * k, color: th.sub, lineHeight: 1.45 }, BF, BW), marginTop: 22 * k, opacity: prog(t, 0.55, 0.4) }}>{s.sub}</div>}
        <Source />
      </>
    );
  } else {
    // 알 수 없는 레이아웃 → 제목만
    body = show('headline') ? <div style={T('headline', { fontSize: 80 * sc.title * k, color: th.text, lineHeight: 1.22 }, TF, TW)}>{s.headline}</div> : null;
  }

  return (
    <div style={{ position: 'absolute', top: y(top), bottom: y(560), left: 72 * k, right: 96 * k, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: exit, transform: `translateY(${(1 - exit) * -16 * k}px)` }}>
      {body}
    </div>
  );
};
