import React from 'react';
import { Composition } from 'remotion';
import { FPS, Short, calcMeta, type ShortProps } from './Short';

const sample: ShortProps = {
  brand: '오늘의 정책자금',
  dateLabel: '11월 12일',
  theme: { bg: '#0B1B3F', bg2: '#132B63', accent: '#FFD400', text: '#FFFFFF', sub: '#A9BCE6' },
  fonts: { title: 'Black Han Sans', body: 'Noto Sans KR' },
  scale: { title: 1, body: 1, caption: 1 },
  bgmUrl: null,
  scenes: [
    { id: 's1', layout: 'hook', headline: '제조업 대표님 필독', sub: '이번 주 마감입니다', emphasis: ['필독'], motion: 'pop', icon: '🚨', narration: '', captions: ['제조업 대표님,', '이번 주 마감입니다'], audioUrl: '', durationSec: 3 },
    { id: 's2', layout: 'stat', headline: '최대 지원 한도', value: '60', unit: '억', motion: 'countup', narration: '', captions: ['최대 60억까지'], audioUrl: '', durationSec: 3 },
    { id: 's3', layout: 'list', headline: '신청 조건', items: ['업력 3년 이상', '매출 5억 이상', '제조업 영위'], motion: 'slide', narration: '', captions: ['조건은 세 가지'], audioUrl: '', durationSec: 4 },
    { id: 's4', layout: 'cta', headline: '내 조건 확인', motion: 'zoom', narration: '', captions: ['고정 댓글에서 확인하세요'], audioUrl: '', durationSec: 3 },
  ],
};

export const Root: React.FC = () => (
  <Composition id="Short" component={Short} width={1080} height={1920} fps={FPS} durationInFrames={300} defaultProps={sample} calculateMetadata={calcMeta} />
);
