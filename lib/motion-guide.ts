/**
 * Claude 에게 주는 디자인·모션 지침 (디자인 단계 · 편집기 "Claude 에게 모션 요청" · 스타일 추출 공용)
 */
import { FONT_NAMES, VIDEO_FONTS } from './fonts';
import type { StyleSpec } from './video-style';

export const NEWS_LAYOUT_GUIDE = `언론사 템플릿 레이아웃 (layout):
- breaking: 속보 오프닝. tag(속보·단독·공고·마감임박 중 1개) + kicker(기관명) + headline(2줄, 줄바꿈 \\n) + sub(대상 한 줄) + source
- headline: 흰 기사 카드. kicker(부처·분류) + headline(기사 제목처럼, 2줄) + sub(요약 1~2줄) + source
- stat: 큰 숫자. kicker(무엇의 숫자인지) + headline(짧은 제목) + value(숫자만, 예 "60") + unit("억 원") + sub(조건·예외) + source(필수)
- list: 요점 번호. headline + items 2~4개(각 18자 이내, "대상: …" 처럼 머리말+내용)
- compare: 두 패널 비교. headline + items 정확히 2개 "라벨|내용" (두 번째가 강조 패널)
- quote: 인용. headline(인용문 그대로, 2~3줄) + sub(누가 말했나: 기관·보도자료)
- document: 공고문 요약 카드. tag("공고") + kicker(공고 번호) + headline(공고 제목) + items 3~5줄 + emphasis(형광펜 칠할 단어) + source
- timeline: 일정. headline + items "날짜|내용" 2~4개 (마지막이 마감, 빨간 점)
- cta: 안내. kicker + headline(2줄) + cta(어디서 확인하는지) + sub(무료·심사 안내)
- footage: 자료화면. media(첨부 영상·이미지 — 아래 '첨부 자료' 목록의 url) + kicker + headline(1~2줄 제목) + sub(자료 설명) + source("자료: 중진공 홍보영상" 처럼). 첨부 영상이 있을 때만
공통: emphasis = headline 안에서 강조할 단어(숫자·핵심어 1~2개). source = 출처(기관 + 문서명), 숫자가 나오면 반드시.
media(footage 외 레이아웃도 가능): { "url": 첨부 url, "kind": "video"|"image", "fit": "cover"|"contain", "start": 영상 시작 초, "label": "자료화면" } — breaking·headline 에 넣으면 배경 영상으로 깔림(어둡게 처리)
원칙: 왼쪽 정렬 · 한 장면 한 메시지 · 이모지 금지 · 과장·감탄 표현 금지 · 첫 장면은 breaking 또는 headline · 마지막은 cta.`;

/**
 * 정책자금 뉴스 브리핑 흐름 — 기획·대사·디자인이 같이 따르는 기본 구성 (운영자가 고른 참고 영상 9장면)
 * role → 레이아웃: 대사의 role 을 디자인이 그대로 레이아웃으로 씀
 */
export const NEWS_ROLE_LAYOUT: Record<string, string> = {
  breaking: 'breaking', stat: 'stat', points: 'list', compare: 'compare', quote: 'quote',
  document: 'document', timeline: 'timeline', apply: 'cta', article: 'headline', footage: 'footage',
};
export const NEWS_ROLES = Object.keys(NEWS_ROLE_LAYOUT);

/** 뉴스 흐름 표의 각 줄 (role → 화면·내레이션 예·자막 예) */
const FLOW_ROWS: Record<string, string> = {
  breaking: '| breaking | 속보 태그 + 기관 + 2줄 헤드라인 | "중소벤처기업진흥공단이 제조업 시설자금 공고를 냈습니다." | 이번 주 시설자금 공고가 나왔습니다 |',
  stat: '| stat | 핵심 숫자 하나 크게 | "기업당 최대 60억 원까지 지원합니다." | 기업당 최대 60억 원까지 지원합니다 |',
  points: '| points | 꼭 알아야 할 3가지 (대상·한도·마감) | "핵심 세 가지만 정리합니다. 대상은 연매출 5억 이상 제조업…" | 핵심 세 가지만 정리합니다 |',
  compare: '| compare | 일반 대출 vs 정책자금 | "일반 대출과 무엇이 다를까요? 정부가 보증해 금리가 낮습니다." | 일반 대출과 무엇이 다를까요 |',
  quote: '| quote | 기관·보도자료 인용 | "공단은 설비 투자 기업을 우선 지원하겠다고 밝혔습니다." | 우선 지원한다고 밝혔습니다 |',
  document: '| document | 공고문 요약 카드(형광펜) | "공고문 핵심은 이렇습니다." | 공고문 핵심은 이렇습니다 |',
  timeline: '| timeline | 접수 일정 (마지막=마감) | "접수는 11월 20일부터 28일까지입니다." | 접수는 11월 20일부터 28일까지 |',
  apply: '| apply | 신청 방법 · 내 조건 확인 | "내 조건으로 가능한지 고정 댓글에서 30초 만에 확인하세요." | 고정 댓글에서 확인하세요 |',
  article: '| article | 기사 카드 (보도·정책 변화 소개) | "정부가 올해 설비투자 정책자금을 늘렸습니다." | 설비투자 정책자금 확대 |',
  footage: '| footage | 자료화면 (첨부 영상) | "공단은 스마트공장 설비 기업을 우선 지원합니다." | 스마트공장 설비 우선 지원 |',
};
export const DEFAULT_FLOW_ORDER = ['breaking', 'stat', 'points', 'compare', 'quote', 'document', 'timeline', 'apply'];

/** 운영자가 정한 순서(편집기에서 장면을 옮기면 저장됨)를 반영한 뉴스 흐름 지침 */
export function newsFlow(order?: string[] | null) {
  const custom = Array.isArray(order) && order.filter((r) => FLOW_ROWS[r]).length >= 3;
  const main = custom ? order!.filter((r, i) => FLOW_ROWS[r] && order!.indexOf(r) === i) : DEFAULT_FLOW_ORDER;
  const optional = Object.keys(FLOW_ROWS).filter((r) => !main.includes(r));
  return `정책자금 뉴스 브리핑 흐름 (뉴스 앵커가 공고를 브리핑하듯)${custom ? ' — ★ 운영자가 편집기에서 정한 장면 순서입니다. 이 순서를 그대로 따르세요' : ' — 기본 구성'}:
| 순서 | role | 화면 | 내레이션 예 (앵커 브리핑체 "~습니다/~입니다") | 하단 자막 예 |
${main.map((r, i) => FLOW_ROWS[r].replace(/^\| /, `| ${i + 1} | `)).join('\n')}
${optional.length ? `선택(필요할 때만): ${optional.join(' · ')} — article 은 기사 카드, footage 는 첨부 영상이 있을 때 자료화면` : ''}
규칙:
- ${custom ? '위 순서대로 장면을 배치. 주제에 맞지 않는 장면(인용할 발언·비교 대상이 없음 등)만 빼고, 남은 장면의 앞뒤 순서는 바꾸지 말 것' : '기본 8장면(선택 포함 최대 9). 주제에 맞지 않는 장면은 빼고 6장면까지 줄여도 됨. 1(속보)과 마지막(신청)은 고정, 사이는 주제에 맞게 순서를 바꿔도 됨'}
- 없는 사실을 지어내 장면을 채우지 말 것 · 장면마다 메시지 하나 · 숫자는 한 장면에 하나 · 모든 숫자·기관·날짜는 조사 facts 에 있는 것만
- 말투: 뉴스 앵커 브리핑 — 짧은 평서문, 감탄·과장·반말 금지, "대표님" 호명은 첫 장면에서 한 번까지
- 하단 자막(captions): 장면당 1줄(길면 2줄), 한 줄 18자 이내, 그 장면 내레이션의 요지를 기사 제목처럼`;
}
export const NEWS_FLOW = newsFlow();
/** 레이아웃 → 뉴스 role (편집기에서 옮긴 순서를 role 순서로 바꿀 때) */
export const LAYOUT_ROLE: Record<string, string> = Object.fromEntries(Object.entries(NEWS_ROLE_LAYOUT).map(([r, l]) => [l, r]));

export const LAYER_GUIDE = `모션그래픽 레이어 (scenes[].layers — 레이아웃 위에 얹는 그래픽. 꼭 필요한 장면에만 0~4개):
좌표: 1080×1920 세로 화면 기준 px. x,y = 왼쪽 위 (anchor "tc" 가로 가운데, "center" 정중앙).
안전 영역: y 290~1360 (위는 채널 표시·날짜, 1400 아래는 자막과 쇼츠 버튼), x 72~984.
type: text(글) · tag(색 띠 글자: 속보·단독) · box(사각형) · line(선, w·h) · highlight(형광펜 띠) · counter(숫자 카운트업: value·from·prefix·suffix·decimals) · bar(막대 그래프: value 0~100, w·h) · image(src URL) · emoji(쓰지 말 것)
style: { font, size(px), weight(100~900), color, bg, radius, align, letterSpacing(em), lineHeight, border, borderColor, opacity, shadow, padX, padY, rotate, track(bar 바탕) }
in/out: { preset, at(초, 장면 시작 기준 · out 은 음수면 끝에서), dur(초), ease(out|in|inOut|linear|back|expo) }
preset: fade · slideUp · slideDown · slideLeft · slideRight · scale · pop · wipeRight · wipeLeft · wipeDown · wipeUp · blurIn · typewriter · countUp(counter) · grow(bar·line·highlight)
keys: [{ t(초), x, y, scale, rotate, opacity }] 시간별 키프레임 (카메라 밀기·이동) · loop: none|pulse|float|blink · z: 0 이하면 레이아웃 뒤, 1 이상이면 앞
타이밍: 레이아웃 글자가 0~0.8초에 들어오므로 레이어는 0.6초 이후 · 장면 길이를 넘기지 말 것 · 언론사 톤은 wipe·slide·countUp 위주, pop·blink 는 거의 쓰지 않음.
예) 숫자 강조 밑줄: { "id":"u1","type":"line","x":72,"y":1080,"w":420,"h":10,"style":{"bg":"#D6282E"},"in":{"preset":"grow","at":0.8,"dur":0.4} }
예) 증가율 카운터: { "id":"c1","type":"counter","value":12,"suffix":"%↑","x":72,"y":1180,"style":{"size":96,"weight":800,"color":"#FFD54A"},"in":{"preset":"countUp","at":0.9,"dur":0.8} }
예) 막대 비교: { "id":"b1","type":"bar","value":80,"x":72,"y":1200,"w":900,"h":26,"style":{"bg":"#2B6CDF"},"in":{"preset":"grow","at":0.8,"dur":0.7} }`;

export function styleBlock(name: string, st: StyleSpec) {
  return `적용 스타일: "${name}"${st.notes ? ` — ${st.notes}` : ''}
템플릿 ${st.template} · 색 ${JSON.stringify(st.theme)} · 폰트 제목 ${st.fonts.title}(${st.fonts.titleWeight}) 본문 ${st.fonts.body}(${st.fonts.bodyWeight}) 숫자 ${st.fonts.number}
모션 성향: ${st.motion?.intensity || 'low'}${st.motion?.presets?.length ? ` · 자주 쓰는 효과 ${st.motion.presets.join(', ')}` : ''}${st.motion?.notes ? ` · ${st.motion.notes}` : ''}
${st.layouts?.length ? `자주 쓰는 레이아웃: ${st.layouts.join(', ')}\n` : ''}${st.rules?.length ? `스타일 규칙:\n${st.rules.map((r) => `- ${r}`).join('\n')}` : ''}
(색·폰트·자막·화면 장식은 공장이 이 스타일로 고정합니다. 당신은 장면 구성·문구·레이어만 설계합니다. 레이어 색도 이 색 안에서.)`;
}

/** 캡처·영상 프레임 → 스타일 추출 지시문 */
export const STYLE_SYSTEM = `당신은 방송·언론사 모션그래픽 아트디렉터입니다. 숏폼 화면 캡처를 보고, 같은 느낌의 영상을 우리 렌더러로 다시 만들 수 있게 디자인 규격(JSON)을 뽑습니다.
색은 화면에서 실제로 보이는 색을 #RRGGBB 로. 폰트는 화면 글자의 생김새(고딕/명조, 굵기, 자폭)를 보고 아래 목록에서 가장 가까운 것을 고릅니다.
쓸 수 있는 폰트: ${VIDEO_FONTS.map((f) => `${f.name}(${f.kind}, 굵기 ${f.weights.length > 1 ? `${f.weights[0]}~${f.weights[f.weights.length - 1]}` : f.weights[0]})`).join(' · ')}
반드시 JSON 하나만 출력합니다.`;

export function stylePrompt(hint?: string) {
  return `첨부한 캡처(같은 채널 또는 원하는 느낌)를 분석해 아래 스키마로 디자인 규격을 만드세요.${hint ? `\n운영자 메모: ${hint}` : ''}
- template: 공식·뉴스·정보형이면 "news", 예능·밈형이면 "classic"
- theme: bg(바탕 위)·bg2(바탕 아래, 그라데이션 없으면 bg 와 같게)·accent(브랜드·강조 면 색)·text(바탕 위 글자)·sub(보조 글자)·surface(카드 바탕)·ink(카드 위 글자)·alert(속보·경고 빨강 계열)·line(구분선, rgba 가능)
- fonts: title·body·caption·number (목록 이름 그대로) + titleWeight·bodyWeight·numberWeight (100~900)
- caption: 자막 모양 — box("none" 글자만+외곽선 | "box" 글자 크기 박스 | "bar" 가로 띠 | "lower" 라벨+띠 하단 자막), bg, bgOpacity(0~1), color, highlight(강조 단어 색), font, size(1080 폭 기준 px, 보통 44~72), weight, align(left|center|right), anim(none|fade|pop|slide|wipe|word|karaoke), label(라벨 문구, 없으면 ""), labelBg, accentBar(띠 왼쪽 색 막대 여부), stroke(외곽선 px), shadow, maxWidth(화면 폭 %), bottom(1920 기준 아래에서 px), padX, padY, radius, lineHeight, letterSpacing(em)
- chrome: brand(채널 표시), date(날짜), progress(진행선), backdrop(배경 장식), grid(격자), ticker(하단/상단 흐르는 띠), tickerLabel, source(출처 표기)
- motion: intensity(low|mid|high), presets(자주 보이는 효과: fade, slideUp, wipeRight, countUp, pop …), notes
- layouts: 이 스타일에 어울리는 레이아웃 순서 (breaking, headline, stat, list, compare, quote, document, timeline, cta)
- rules: 이 느낌을 지키는 규칙 4~8개 (예: "제목은 왼쪽 정렬 2줄", "강조는 노랑 한 단어", "이모지 없음")
- notes: 이 스타일을 한 줄로
JSON: { "template": "news", "theme": {…}, "fonts": {…}, "scale": { "title": 1, "body": 1, "caption": 1 }, "caption": {…}, "chrome": {…}, "motion": {…}, "layouts": [], "rules": [], "notes": "", "name": "스타일 이름 제안" }`;
}

export function motionPrompt(o: { scene: any; narration: string; durationSec: number; design: any; styleName: string; style: StyleSpec; instruction: string }) {
  return `편집 중인 장면에 모션그래픽 레이어를 설계합니다.
운영자 요청: ${o.instruction || '이 장면을 더 언론사답게, 핵심 숫자·단어가 눈에 들어오도록 레이어를 설계해 주세요.'}

장면 (길이 약 ${o.durationSec.toFixed(1)}초): ${JSON.stringify({ layout: o.scene.layout, kicker: o.scene.kicker, tag: o.scene.tag, headline: o.scene.headline, sub: o.scene.sub, items: o.scene.items, value: o.scene.value, unit: o.scene.unit, source: o.scene.source })}
대사: ${o.narration}
지금 레이어: ${JSON.stringify(o.scene.layers || [])}

${styleBlock(o.styleName, o.style)}

${NEWS_LAYOUT_GUIDE}

${LAYER_GUIDE}

레이아웃이 그리는 글자와 겹치지 않게 빈 자리를 쓰거나, 레이아웃 없이 레이어로만 장면을 짜려면 hideLayout: true 로 하고 모든 글자를 레이어로 만드세요.
JSON: { "layers": [ … ], "hideLayout": false, "note": "무엇을 어떻게 움직이는지 한두 문장" }`;
}
export const FONT_LIST_TEXT = FONT_NAMES.join(', ');
