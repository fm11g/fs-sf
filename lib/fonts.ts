/** 영상 폰트 목록 — 편집기(구글 폰트로 미리보기)·렌더 워커(scripts/fonts.sh 로 설치)가 같은 이름을 씀 */
export const VIDEO_FONTS: { name: string; kind: string; gf: string }[] = [
  { name: 'Black Han Sans', kind: '굵은 제목', gf: 'Black+Han+Sans' },
  { name: 'Noto Sans KR', kind: '고딕 (기본)', gf: 'Noto+Sans+KR:wght@400;700;900' },
  { name: 'Do Hyeon', kind: '각진 제목', gf: 'Do+Hyeon' },
  { name: 'Gothic A1', kind: '고딕', gf: 'Gothic+A1:wght@400;700;900' },
  { name: 'Jua', kind: '둥근 귀여움', gf: 'Jua' },
  { name: 'Nanum Gothic', kind: '나눔고딕', gf: 'Nanum+Gothic:wght@400;700;800' },
  { name: 'Nanum Myeongjo', kind: '명조', gf: 'Nanum+Myeongjo:wght@800' },
  { name: 'Nanum Pen Script', kind: '손글씨', gf: 'Nanum+Pen+Script' },
  { name: 'Gowun Dodum', kind: '부드러운 고딕', gf: 'Gowun+Dodum' },
  { name: 'Sunflower', kind: '좁은 고딕', gf: 'Sunflower:wght@700' },
  { name: 'IBM Plex Sans KR', kind: '단정한 고딕', gf: 'IBM+Plex+Sans+KR:wght@700' },
  { name: 'Noto Serif KR', kind: '본명조', gf: 'Noto+Serif+KR:wght@400;700;900' },
  { name: 'Dongle', kind: '동글동글', gf: 'Dongle:wght@700' },
  { name: 'Gasoek One', kind: '아주 굵은 제목', gf: 'Gasoek+One' },
  { name: 'Hahmlet', kind: '현대 명조', gf: 'Hahmlet:wght@400;700;900' },
];
export const FONT_NAMES = VIDEO_FONTS.map((f) => f.name);
export const googleFontsHref = () => `https://fonts.googleapis.com/css2?${VIDEO_FONTS.map((f) => `family=${f.gf}`).join('&')}&display=swap`;
