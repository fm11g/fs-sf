import type { ShortProps, SceneProps } from './common';
import { NEWS_THEME } from './news';

/**
 * 콘텐츠(대사 + 디자인 + 편집기 수정값) → 컴포지션 props. 워커 렌더와 편집기 미리보기 공용 (순수 함수)
 *  design.scenes[i] 에 편집기가 넣는 값: els(요소별 위치·크기·색·폰트·숨김) · bg · cta · captions/narration(영상 전용 문구) · hold(초)
 *  design 최상위: template('news'|'classic') · size · caption(자막 세부 스타일) · chrome(채널 표시·날짜·진행선·티커·출처·배경) · bgm_volume
 *  scenes[i].layers = Claude 모션그래픽 레이어 · kicker/tag/source = 언론사 템플릿 머리말·태그·출처
 */
/** 언론사 표기 날짜: 2026.11.14 (토) */
export function newsDate(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 36e5);
  const w = '일월화수목금토'[k.getUTCDay()];
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, '0')}.${String(k.getUTCDate()).padStart(2, '0')} (${w})`;
}
export const DEFAULT_FONTS = {
  news: { title: 'Pretendard', body: 'Pretendard', caption: 'Pretendard', number: 'Pretendard', titleWeight: 800, bodyWeight: 500, numberWeight: 800 },
  classic: { title: 'Black Han Sans', body: 'Noto Sans KR' },
};
export const narrationOf = (sc: any, g: any) => (typeof g?.narration === 'string' && g.narration.trim() ? g.narration : sc.narration) as string;
export const captionsOf = (sc: any, g: any) => (Array.isArray(g?.captions) && g.captions.length ? g.captions : sc.captions || []) as string[];
/** 음성 길이 추정 (TTS 전 미리보기용): 공백 제외 초당 약 5.8자 */
export const estimateSec = (text: string) => Math.max(1.6, (text || '').replace(/\s/g, '').length / 5.8 + 0.25);

export function buildProps(c: any, o: { brand: string; dateLabel: string; audio?: { id: string; url: string; duration: number }[]; bgmUrl?: string | null }): ShortProps {
  const d = c.design || {};
  // 장면 순서: 편집기에서 옮긴 순서(design.scene_order)가 있으면 그 순서, 없으면 대사 순서. 목소리·자막은 id 로 따라감
  const order: string[] = Array.isArray(d.scene_order) ? d.scene_order : [];
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? 1000 : i; };
  const ordered = [...(c.script?.scenes || [])].map((x: any, i: number) => ({ x, i })).sort((a, b) => rank(a.x.id) - rank(b.x.id) || a.i - b.i).map((v) => v.x);
  const scenes: SceneProps[] = ordered.map((sc: any) => {
    // 디자인이 없는 장면: 대본의 뉴스 role·on_screen 으로 화면 구성 (없으면 자막 첫 줄을 인용 카드로)
    const ROLE: Record<string, string> = { breaking: 'breaking', stat: 'stat', points: 'list', compare: 'compare', quote: 'quote', document: 'document', timeline: 'timeline', apply: 'cta', article: 'headline', footage: 'footage' };
    const g = (d.scenes || []).find((x: any) => x.id === sc.id)
      || (sc.on_screen && ROLE[sc.role] ? { layout: ROLE[sc.role], ...sc.on_screen, headline: sc.on_screen.headline || sc.captions?.[0] || '' } : { layout: 'quote', headline: sc.captions?.[0] || '' });
    const a = o.audio?.find((x) => x.id === sc.id);
    const narration = narrationOf(sc, g);
    const hold = Math.max(-1, Math.min(5, Number(g.hold || 0)));
    const { captions: _c, narration: _n, hold: _h, ...rest } = g;
    return {
      ...rest, id: sc.id, narration, captions: captionsOf(sc, g),
      audioUrl: a?.url || '', durationSec: Math.max(0.8, (a ? a.duration : estimateSec(narration)) + hold),
    } as SceneProps;
  });
  // 템플릿: 저장된 디자인에 없으면 예전 디자인(classic) — 새 디자인은 디자인 단계가 'news' 로 만듦
  const template = d.template === 'news' ? 'news' : 'classic';
  return {
    template, brand: o.brand, dateLabel: o.dateLabel, dateNews: newsDate(),
    theme: template === 'news' ? { ...NEWS_THEME, ...(d.theme || {}) } : d.theme || { bg: '#0B1B3F', bg2: '#132B63', accent: '#FFD400', text: '#FFFFFF', sub: '#A9BCE6' },
    fonts: { ...DEFAULT_FONTS[template], ...(d.fonts || {}) },
    scale: d.scale || { title: 1, body: 1, caption: 1 },
    scenes, bgmUrl: o.bgmUrl ?? null, bgmVolume: d.bgm_volume ?? 0.12,
    size: d.size || { w: 1080, h: 1920 }, caption: d.caption || {}, chrome: d.chrome || {},
  };
}
