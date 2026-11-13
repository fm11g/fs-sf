import type { ShortProps, SceneProps } from './Short';

/**
 * 콘텐츠(대사 + 디자인 + 편집기 수정값) → 컴포지션 props. 워커 렌더와 편집기 미리보기 공용 (순수 함수)
 *  design.scenes[i] 에 편집기가 넣는 값: els(요소별 위치·크기·색·폰트·숨김) · bg · cta · captions/narration(영상 전용 문구) · hold(초)
 *  design 최상위: size(영상 크기) · caption(자막 스타일) · chrome(브랜드·날짜·진행바·배경 도형) · bgm_volume
 */
export const narrationOf = (sc: any, g: any) => (typeof g?.narration === 'string' && g.narration.trim() ? g.narration : sc.narration) as string;
export const captionsOf = (sc: any, g: any) => (Array.isArray(g?.captions) && g.captions.length ? g.captions : sc.captions || []) as string[];
/** 음성 길이 추정 (TTS 전 미리보기용): 공백 제외 초당 약 5.8자 */
export const estimateSec = (text: string) => Math.max(1.6, (text || '').replace(/\s/g, '').length / 5.8 + 0.25);

export function buildProps(c: any, o: { brand: string; dateLabel: string; audio?: { id: string; url: string; duration: number }[]; bgmUrl?: string | null }): ShortProps {
  const d = c.design || {};
  const scenes: SceneProps[] = (c.script?.scenes || []).map((sc: any) => {
    const g = (d.scenes || []).find((x: any) => x.id === sc.id) || { layout: 'quote', headline: sc.captions?.[0] || '' };
    const a = o.audio?.find((x) => x.id === sc.id);
    const narration = narrationOf(sc, g);
    const hold = Math.max(-1, Math.min(5, Number(g.hold || 0)));
    const { captions: _c, narration: _n, hold: _h, ...rest } = g;
    return {
      ...rest, id: sc.id, narration, captions: captionsOf(sc, g),
      audioUrl: a?.url || '', durationSec: Math.max(0.8, (a ? a.duration : estimateSec(narration)) + hold),
    } as SceneProps;
  });
  return {
    brand: o.brand, dateLabel: o.dateLabel,
    theme: d.theme || { bg: '#0B1B3F', bg2: '#132B63', accent: '#FFD400', text: '#FFFFFF', sub: '#A9BCE6' },
    fonts: d.fonts || { title: 'Black Han Sans', body: 'Noto Sans KR' },
    scale: d.scale || { title: 1, body: 1, caption: 1 },
    scenes, bgmUrl: o.bgmUrl ?? null, bgmVolume: d.bgm_volume ?? 0.12,
    size: d.size || { w: 1080, h: 1920 }, caption: d.caption || {}, chrome: d.chrome || {},
  };
}
