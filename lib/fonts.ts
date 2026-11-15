/**
 * 영상 폰트 목록 — 편집기(웹폰트로 미리보기)·렌더 워커(worker/scripts/fonts.sh 로 시스템 설치)가 같은 이름을 씀.
 * weights: 실제로 쓸 수 있는 굵기 (가변 폰트는 100 단위 전부). 굵기가 하나뿐인 폰트는 굵기 조절이 안 됨.
 */
export type VideoFont = { name: string; kind: string; group: '언론·공식' | '고딕' | '명조' | '제목' | '개성'; weights: number[]; gf?: string; css?: string };
const ALL = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const VIDEO_FONTS: VideoFont[] = [
  { name: 'Pretendard', kind: '프리텐다드 — 뉴스 그래픽 표준 고딕', group: '언론·공식', weights: ALL, css: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css' },
  { name: 'Noto Sans KR', kind: '본고딕 — 공문·자막', group: '언론·공식', weights: ALL, gf: 'Noto+Sans+KR:wght@100..900' },
  { name: 'Noto Serif KR', kind: '본명조 — 신문 제목', group: '언론·공식', weights: [200, 300, 400, 500, 600, 700, 800, 900], gf: 'Noto+Serif+KR:wght@200..900' },
  { name: 'IBM Plex Sans KR', kind: '단정한 고딕 — 데이터·표', group: '언론·공식', weights: [100, 200, 300, 400, 500, 600, 700], gf: 'IBM+Plex+Sans+KR:wght@100;200;300;400;500;600;700' },
  { name: 'Gothic A1', kind: '고딕 A1', group: '고딕', weights: ALL, gf: 'Gothic+A1:wght@100;200;300;400;500;600;700;800;900' },
  { name: 'Nanum Gothic', kind: '나눔고딕', group: '고딕', weights: [400, 700, 800], gf: 'Nanum+Gothic:wght@400;700;800' },
  { name: 'Hahmlet', kind: '함렛 — 현대 명조', group: '명조', weights: ALL, gf: 'Hahmlet:wght@100..900' },
  { name: 'Nanum Myeongjo', kind: '나눔명조', group: '명조', weights: [400, 700, 800], gf: 'Nanum+Myeongjo:wght@400;700;800' },
  { name: 'Gowun Batang', kind: '고운바탕 — 부드러운 명조', group: '명조', weights: [400, 700], gf: 'Gowun+Batang:wght@400;700' },
  { name: 'Black Han Sans', kind: '검은고딕 — 아주 굵은 제목', group: '제목', weights: [400], gf: 'Black+Han+Sans' },
  { name: 'Do Hyeon', kind: '도현 — 각진 제목', group: '제목', weights: [400], gf: 'Do+Hyeon' },
  { name: 'Gasoek One', kind: '가석 — 초굵은 제목', group: '제목', weights: [400], gf: 'Gasoek+One' },
  { name: 'Sunflower', kind: '해바라기 — 좁은 고딕', group: '제목', weights: [700], gf: 'Sunflower:wght@700' },
  { name: 'Jua', kind: '주아 — 둥근', group: '개성', weights: [400], gf: 'Jua' },
  { name: 'Gowun Dodum', kind: '고운돋움', group: '개성', weights: [400], gf: 'Gowun+Dodum' },
  { name: 'Dongle', kind: '동글', group: '개성', weights: [700], gf: 'Dongle:wght@700' },
  { name: 'Nanum Pen Script', kind: '나눔손글씨 펜', group: '개성', weights: [400], gf: 'Nanum+Pen+Script' },
];
export const FONT_NAMES = VIDEO_FONTS.map((f) => f.name);
export const fontDef = (name?: string | null) => VIDEO_FONTS.find((f) => f.name === name);
/** 이 폰트에서 실제로 쓸 수 있는 가장 가까운 굵기 */
export const nearestWeight = (name: string | undefined | null, w: number | undefined | null) => {
  const ws = fontDef(name)?.weights || [400, 700];
  const t = Number(w || 700);
  return ws.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), ws[0]);
};
/** 편집기용 웹폰트 링크들 (구글 폰트 1개 + 프리텐다드 CDN) */
export const fontHrefs = () => [
  `https://fonts.googleapis.com/css2?${VIDEO_FONTS.filter((f) => f.gf).map((f) => `family=${f.gf}`).join('&')}&display=swap`,
  ...VIDEO_FONTS.filter((f) => f.css).map((f) => f.css!),
];
/** 예전 호출부 호환 */
export const googleFontsHref = () => fontHrefs()[0];
