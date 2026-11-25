import { FONT_NAMES } from './fonts';
import { LAYER_GUIDE, NEWS_LAYOUT_GUIDE, NEWS_ROLES, newsFlow, styleBlock } from './motion-guide';
import type { StyleSpec } from './video-style';
import type { Settings } from './types';
import type { Sop } from './sop';
import { stepDef, type StepKey } from './steps';
import { DIMENSIONS } from './editorial-taxonomy';

export const todayKST = () =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());

const ROLE: Record<string, string> = {
  research: '조사 담당. 웹 검색(및 연결된 MCP 도구)으로 최신 공고를 확인합니다.',
  plan: '기획 담당. 40초 세로 숏폼을 정책자금 뉴스 브리핑 형식으로 구성합니다.',
  script: '뉴스 브리핑 대본 작가. 뉴스 앵커가 정책자금 공고를 브리핑하듯, AI 성우가 읽을 40초 내레이션과 기사 제목 같은 하단 자막을 씁니다.',
  offer: '전환 기획자. 영상에서 랜딩으로 넘어온 사람이 신청하게 만드는 이벤트를 설계합니다.',
  landing: '랜딩페이지 카피라이터. 슬롯별 글자수(공백 포함)를 절대 넘기지 않습니다. 줄바꿈은 \\n (글자수 제외).',
  design: `방송 뉴스 모션그래픽 디자이너. 1080x1920 세로 숏폼을 언론사처럼 공식적이고 신뢰감 있게 설계합니다.
장면마다 레이아웃·머리말·제목·출처를 정하고, 필요한 장면에만 모션그래픽 레이어를 얹습니다. 색·폰트·자막 모양은 지정된 스타일을 따릅니다.
폰트(레이어에 쓸 때 이 중에서만): ${FONT_NAMES.join(', ')}.`,
  copy: '채널 카피라이터. 링크 자리는 반드시 {LINK} 토큰으로 둡니다.',
  post: 'SEO 에디터. 네이버·구글 검색 상위 노출을 노리는 정보성 글을 씁니다.',
};

const FREEDOM = [
  '자유도 0 — SOP와 상위 산출물만 따릅니다. 새로운 시도를 하지 않습니다. _ai.suggestions 는 비워도 됩니다.',
  '자유도 1 — SOP 범위 안에서 작업합니다. 더 나은 방법이 보이면 산출물은 그대로 두고 _ai.suggestions 에만 적습니다.',
  '자유도 2 — SOP를 따르되 표현·구성은 스스로 더 나은 쪽을 고릅니다. _ai.alternatives 에 채택하지 않은 대안 2개를 남깁니다.',
  '자유도 3 — SOP는 가이드입니다. 성과가 더 날 근거가 있으면 각도·구성을 바꿔도 됩니다. 바꾼 점과 이유를 _ai.opinion 에 반드시 적고, 운영자에게 묻고 싶은 것을 _ai.questions 에 남깁니다.',
];

const AI_NOTES = `"_ai": { "opinion": "이번 산출물에 대한 솔직한 의견·판단 근거 (2~4문장)", "suggestions": ["운영자에게 제안"], "alternatives": ["채택하지 않은 대안"], "questions": ["결정이 필요한 질문"], "confidence": 0.0 }`;

/** 모든 단계 공통 시스템 프롬프트: 고정 규칙 + 역할 + SOP(md) + 자유도 */
export function buildSystem(s: Settings, step: StepKey, sop: Sop) {
  return `당신은 '${s.brand}' 유튜브 쇼츠·인스타 릴스 채널 제작팀의 ${ROLE[step] || stepDef(step).label + ' 담당.'}
타깃: ${s.target}. 오늘: ${todayKST()} (KST).

## 고정 규칙 (자유도와 무관하게 항상 적용)
- 사실만 씁니다. 금액·금리·기간·자격은 조사 산출물에 있는 것만 사용하고, 없으면 "공고 확인 필요"로 둡니다.
- 금지 표현: ${s.banned_phrases.join(', ')}. 승인·한도를 보장하는 말 금지.
- 출력 JSON 스키마와 글자수 상한을 지킵니다.
- 사장님이 바로 이해하는 쉬운 말, 짧은 문장, 숫자 중심.

## 이 단계의 SOP (운영자가 관리하는 지침 — 집중 포인트를 최우선으로)
${sop.content}

## 작업 자유도
${FREEDOM[sop.freedom] ?? FREEDOM[2]}
모든 산출물 JSON 최상위에 다음 필드를 포함합니다: ${AI_NOTES}`;
}

const J = (v: any) => JSON.stringify(v);
/** 운영자가 올린 첨부(이미지·영상) 목록 — 대사·디자인이 자료화면·참고로 씀 */
const assetBlock = (assets?: Ctx['assets']) => assets?.length
  ? `\n\n## 첨부 자료 (운영자가 올린 파일 — 영상은 footage 장면이나 media 로 넣을 수 있음)\n${assets.map((a) => `- [${a.kind === 'video' ? '영상' : '이미지'} #${a.id}] ${a.name || ''}${a.note ? ` — ${a.note}` : ''} · url: ${a.url}`).join('\n')}`
  : '';
const revise = (prev: any, feedback?: string | null) =>
  feedback
    ? `\n\n## 재작업 지시 (최우선 반영)\n${feedback}\n\n## 이전 산출물 (지시와 무관한 부분은 유지)\n${J(prev)}`
    : '';

type Ctx = { s: Settings; c: any; prev?: any; feedback?: string | null; assets?: { id: number; kind: string; url: string; name?: string; note?: string }[]; recentTopics?: string[]; slots?: any[]; brief?: string; cases?: any[]; casePositions?: number; style?: { key: string; name: string; style: StyleSpec } };

export const USER: Record<string, (x: Ctx) => string> = {
  research: (ctx) => { const { c, prev, feedback, recentTopics } = ctx; return  `오늘 숏폼으로 다룰 정책자금 주제를 조사하세요.
${c.topic ? `지정 주제/힌트: "${c.topic}" — 이 주제로 조사합니다.` : '지정 주제 없음 — 시의성과 타깃 적합성이 가장 높은 것을 고릅니다.'}
최근 14일 내 다룬 주제(중복 회피): ${recentTopics?.length ? recentTopics.join(' / ') : '없음'}
우선 출처: 중소벤처기업진흥공단, 소상공인시장진흥공단, 신용보증기금, 기술보증기금, 지역신용보증재단, 중소벤처기업부, 기업마당(bizinfo.go.kr), 지자체 공고.

JSON 스키마:
{
  "candidates": [{ "topic": "", "why": "", "score": 0 }],
  "topic": "선택한 주제 한 줄",
  "topic_category": "${DIMENSIONS.topic_category.values.join(' | ')} 중 하나",
  "angle": "왜 지금 이 사장님들이 봐야 하는지",
  "program": { "name": "", "agency": "", "amount": "", "rate": "", "period": "", "eligibility": [""], "how_to_apply": "", "deadline": "" },
  "facts": [{ "claim": "", "source_title": "", "source_url": "", "date": "" }],
  "keywords": ["SEO 키워드 8~12개"],
  "risk_notes": ["확인 안 된 사항·주의점"],
  ${AI_NOTES}
}
candidates 는 3개.${ctx.brief || ''}${revise(prev, feedback)}`; },

  plan: (ctx) => { const { s, c, prev, feedback } = ctx; return `조사: ${J(c.research)}

40초 숏폼 기획안을 만드세요.
JSON 스키마:
{
  "working_title": "",
  "topic_category": "조사의 topic_category 그대로",
  "angle": "${DIMENSIONS.angle.values.join(' | ')} 중 하나",
  "format": "${DIMENSIONS.format.values.join(' | ')} 중 하나",
  "target": "${DIMENSIONS.target.values.join(' | ')} 중 하나",
  "hook_options": [{ "type": "${DIMENSIONS.hook_type.values.join('|')}", "text": "" }],
  "chosen_hook": "",
  "mood": "urgent | calm | hopeful | serious",
  "structure": [{ "id": "s1", "role": "${NEWS_ROLES.join('|')}", "point": "이 장면에서 전달할 한 가지", "seconds": 4 }],
  "cta": "${s.cta_text} 를 자연스럽게 변형",
  ${AI_NOTES}
}

${newsFlow((s as any).news_flow_order)}

장면 6~9개, seconds 합계 38~42, 첫 장면 role 은 breaking(또는 article), 마지막은 apply. chosen_hook 은 1장면 내레이션이 됨. hook_options 3개는 서로 다른 type.${assetBlock(ctx.assets)}${ctx.brief || ''}${revise(prev, feedback)}`; },

  script: ({ s, c, prev, feedback, assets }) => `조사: ${J(c.research)}
기획: ${J(c.plan)}

${newsFlow((s as any).news_flow_order)}

규칙:
- 기획 structure 의 id·role 그대로 장면 분할 (role 이 기획에 없으면 위 흐름에서 고름)
- 전체 내레이션 공백 제외 210~250자 · 앵커 브리핑체 평서문 · 장면당 1~2문장
- captions: 화면 아래 자막. 장면당 1줄(길면 2줄), 한 줄 18자 이내(공백 포함), 그 장면의 요지를 기사 제목처럼 — 내레이션을 그대로 쪼개지 않아도 됨
- on_screen: 그 장면 화면에 띄울 핵심(디자인이 그대로 씀). role 별 필요한 것만:
  breaking{tag,kicker,headline} · stat{kicker,headline,value,unit,source} · points{headline,items[3]} · compare{headline,items["라벨|내용"×2]}
  quote{headline(인용문),sub(누가)} · document{kicker(공고번호),headline(공고 제목),items[3~5]} · timeline{headline,items["날짜|내용"]}
  apply{headline,cta} · article{kicker,headline,sub,source} · footage{media_id(첨부 영상 #번호),headline,sub}
- 숫자·날짜·기관은 조사 facts 에 있는 것만 (없으면 그 장면을 빼고 다음 장면으로)

JSON 스키마:
{ "total_chars": 0, "scenes": [{ "id": "s1", "role": "breaking", "narration": "", "captions": [""], "on_screen": { "tag": "", "kicker": "", "headline": "", "sub": "", "value": "", "unit": "", "items": [], "cta": "", "source": "", "media_id": null } }], ${AI_NOTES} }${assetBlock(assets)}${revise(prev, feedback)}`,

  offer: ({ s, c, prev, feedback }) => `조사: ${J(c.research)}
기획: ${J(c.plan)}
확정 대사: ${J(c.script?.scenes?.map((x: any) => x.narration))}

우리가 실제로 제공 가능한 혜택(이 안에서만 선택): ${s.offers}
운영 규칙: ${s.offer_rules}

영상 마지막 문장에서 자연스럽게 이어지는 랜딩 이벤트 1개를 설계하세요.
JSON 스키마:
{
  "event_name": "18자 이하, 오늘 주제 포함",
  "bridge": "영상에서 랜딩으로 이어지는 한 문장 (예: 영상에서 본 ○○자금, 내 사업장도 되는지 확인하세요)",
  "main_benefit": "주력 혜택 1개",
  "benefits": ["보조 혜택 1~2개"],
  "deadline_label": "공고의 실제 마감일 기반 문구. 근거 없으면 빈 문자열",
  "deadline_source": "마감 근거(조사 fact). 없으면 빈 문자열",
  "effort": "신청에 드는 시간·비용 (예: 전화 10분, 비용 없음)",
  "steps": ["신청 후 진행 3단계"],
  "form_title": "신청폼 제목 16자 이하",
  "cta": "버튼 문구 14자 이하 (행동+얻는 것)",
  "objections": [{ "q": "망설이는 이유", "a": "해소 답변" }],
  "disclaimer": "심사에 따라 결정된다는 유의 문구",
  ${AI_NOTES}
}
objections 는 2~3개.${revise(prev, feedback)}`,

  landing: ({ c, prev, feedback, slots, cases, casePositions }) => `오늘 숏폼의 확정 대사와 이벤트에 맞게 랜딩페이지 문구를 교체합니다. 목표는 신청 전환입니다.
조사: ${J(c.research)}
확정 대사: ${J(c.script?.scenes?.map((x: any) => x.narration))}
이벤트: ${J(c.offer)}

슬롯 목록 (key / 용도 / 최대 글자수 / 현재 문구 — 현재 문구의 길이·톤을 기준으로):
${(slots || []).map((x) => `- ${x.key} / ${x.label} / ${x.max ?? '제한없음'}자 / "${x.current}"`).join('\n')}

용도가 "(선택)" 으로 시작하는 슬롯은 조사·대사·이벤트에 근거가 있을 때만 쓰고, 없으면 빈 문자열("")로 둡니다 (화면에서 자동으로 숨겨짐). 숫자·마감·수량 제한을 지어내지 마세요.
용도의 "—" 뒤는 그 슬롯의 작성 지침입니다.

${cases?.length ? `
실제 후기 카드 ${casePositions}칸: 문구를 쓰지 말고 아래 "등록된 실제 사례"에서 오늘 영상 타깃(업종·연차·자금 용도·상황)과 가장 가까운 순서로 id 를 고르세요.
1번 카드가 가장 먼저 보입니다. 중복 없이 최대 ${casePositions}개. 사례 원문은 공장이 그대로 넣습니다.
등록된 실제 사례:
${cases.map((x: any) => `- #${x.id} | ${x.industry}${x.years ? ` ${x.years}년차` : ''} | ${[x.fund_type, x.badge1, x.badge2].filter(Boolean).join(' · ')} | ${x.amount} | "${x.title}"${x.tags?.length ? ` | ${x.tags.join(',')}` : ''}`).join('\n')}
` : ''}
JSON 스키마: { "values": { "슬롯key": "문구" },${cases?.length ? ' "cases": [사례 id 순서],' : ''} ${AI_NOTES} } — 모든 슬롯 key 를 포함합니다(선택 슬롯은 "" 가능).${revise(prev, feedback)}`,

  design: ({ c, prev, feedback, style, assets }) => {
    const st = style?.style;
    const news = (st?.template || 'news') === 'news';
    return `기획: ${J(c.plan)}
대본: ${J(c.script)}
조사(숫자·출처 확인용): ${J({ program: c.research?.program, facts: c.research?.facts })}

${st ? styleBlock(style.name, st) : ''}

장면마다 화면 그래픽을 설계하세요. 자막은 하단에 따로 나가므로 화면 글자는 핵심 단어·숫자만.
${news ? `대본 장면의 role·on_screen 을 우선 따릅니다 — role → layout: breaking→breaking, stat→stat, points→list, compare→compare, quote→quote, document→document, timeline→timeline, apply→cta, article→headline, footage→footage. on_screen 의 글을 그대로 쓰되 글자수 규칙에 맞게만 다듬습니다. on_screen.media_id 가 있으면 첨부 목록의 그 url 을 media 로 넣습니다.` : ''}
${news ? NEWS_LAYOUT_GUIDE : 'layout: hook(큰 질문), stat(큰 숫자+단위), list(항목 2~4개), compare(2항목), quote(한 문장), cta(행동 유도). motion: pop, slide, typewriter, countup, zoom.'}
글자수: headline 한 줄 10자 안팎(최대 2줄, \n), sub 24자 이하, list items 각 18자 이하, kicker 14자 이하, source 30자 이하.
숫자·기관명·날짜는 조사 산출물에 있는 것만. 출처가 없으면 source 를 비우고 숫자 장면을 만들지 마세요.

${LAYER_GUIDE}

JSON 스키마:
{
  "scenes": [{ "id": "s1", "layout": "${news ? 'breaking' : 'hook'}", "kicker": "", "tag": "", "headline": "", "sub": "", "items": [], "value": "", "unit": "", "emphasis": [], "source": "", "cta": "", "media": null, "layers": [] }],
  "caption_label": "하단 자막 라벨 (8자 이내, 예: 정책자금 브리핑 — 스타일에 라벨이 있을 때만)",
  "ticker": "티커 문구 (스타일이 티커를 쓸 때만, 40자 이내 · 오늘 공고 요약)",
  ${AI_NOTES}
}${assetBlock(assets)}${revise(prev, feedback)}`;
  },

  copy: ({ s, c, prev, feedback }) => `조사: ${J(c.research)}
대본: ${J(c.script)}
이벤트: ${J(c.offer)}
기본 해시태그: ${s.default_hashtags.join(' ')}

JSON 스키마:
{
  "youtube": {
    "title": "40자 이하, 끝에 #shorts",
    "title_options": ["대안 제목 2개"],
    "description": "3~5줄 요약 + 이벤트 한 줄 + {LINK} + 해시태그",
    "tags": ["10개 이하"],
    "comment": "고정 댓글용 3줄 이내: 핵심 1줄 + 이벤트 1줄 + {LINK}"
  },
  "instagram": {
    "caption": "첫 줄 훅 + 본문 요약 + 이벤트 + '프로필 링크 또는 아래 주소 👉 {LINK}' + 해시태그 15개 이하",
    "first_comment": "행동 유도 + {LINK}"
  },
  ${AI_NOTES}
}${revise(prev, feedback)}`,

  post: ({ s, c, prev, feedback }) => `오늘 숏폼과 같은 주제로 '${s.brand}' 사이트 정보글을 작성하세요.
조사: ${J(c.research)}
숏폼 대본: ${J(c.script?.scenes?.map((x: any) => x.narration))}
이벤트: ${J(c.offer)}

이 글은 '${s.brand}' 홈페이지 「정책자금 정보」에 그대로 발행되고(검색 유입 → 신청), 글 처음에 ## 소제목으로 목차가 자동 생성됩니다.
- 제목 32자 이내: 검색어(자금 이름·대상·핵심 혜택)를 앞쪽에. 숏폼 제목을 그대로 쓰지 말고 검색형으로
- meta_description 80~120자: 핵심 키워드 + 이 글에서 알 수 있는 것 + 대상(연매출 4억 이상 사업자 등)
- keywords 5~8개: 사람들이 실제로 검색할 말 (예: "운전자금 신청 조건", "중진공 정책자금 금리")
- 본문 마크다운 2,000~3,000자. # 제목은 쓰지 않음(페이지 제목이 따로 있음). 첫 문단 2~3문장에 결론 요약
- ## 소제목 4~6개 (목차). 소제목만 읽어도 내용이 이해되게, 질문형·키워드형. 필요하면 ### 하위 소제목
- 표 1개 이상 (조건·금리·한도·서류 비교 등 — 조사 산출물의 숫자만)
- 이미지 자리 4개: ![대체텍스트](IMAGE_1) … ![대체텍스트](IMAGE_4) (대체텍스트에도 키워드)
- 본문 끝 "## 참고 공고"에 출처 링크, 마지막 문단에서 이벤트를 소개하고 [무료 자금 진단 신청]({LINK}) — {LINK} 는 홈페이지 신청폼으로 바뀜
- faq 3~5개: 검색에서 실제로 묻는 질문 + 2~3문장 답 (조사 근거 안에서, 승인·한도 보장 금지)
- thumb_query: 대표 이미지로 쓸 무료 사진(Pexels·Unsplash) 영문 검색어 2~4단어. 글 주제를 보여 주는 장면·사물 위주(예: "factory machinery", "shipping containers port", "financial documents calculator"), 사람 얼굴이 크게 나오는 장면·국기·화폐 클로즈업은 피함

JSON 스키마:
{ "title": "", "meta_description": "80~120자", "keywords": [""], "category": "운전자금 | 시설자금 | 대환대출 | 창업·기술자금 | 지원사업 공고 | 신청 가이드 | 제도 변경", "thumb_query": "대표 사진 검색어(영문 2~4단어)", "thumb_query_alt": "다른 각도의 영문 검색어", "body_markdown": "", "faq": [{ "q": "", "a": "" }], ${AI_NOTES} }${revise(prev, feedback)}`,
};

/** AI 검수자: SOP 체크리스트로 채점 */
export function reviewPrompt(s: Settings, step: StepKey, sop: Sop, inputs: Record<string, any>, output: any, checks: any[]) {
  return {
    system: `당신은 '${s.brand}' 제작팀의 품질 검수자입니다. '${stepDef(step).label}' 단계 산출물을 SOP의 체크리스트와 금지 항목으로 엄격하게 검수합니다.
작성자를 봐주지 않습니다. 사실 오류·근거 없는 숫자·금지 표현(${s.banned_phrases.join(', ')})·승인 보장 뉘앙스는 무조건 revise 입니다.
취향 차이만으로는 반려하지 않습니다. 오늘: ${todayKST()}.

## SOP
${sop.content}`,
    prompt: `## 상위 산출물 (근거)
${J(inputs)}

## 검수 대상 산출물
${J(output)}

## 코드 규칙 검사 결과
${J(checks)}

JSON 스키마:
{
  "verdict": "pass | revise",
  "score": 0,
  "checklist": [{ "item": "SOP 체크리스트 항목", "ok": true, "note": "" }],
  "issues": ["반드시 고쳐야 할 문제"],
  "suggestions": ["고치면 더 좋아질 점 (선택)"],
  "feedback": "revise 일 때 작성자에게 줄 구체적 재작업 지시. pass 면 빈 문자열",
  "summary": "운영자에게 보여줄 한 줄 판단"
}
score 는 0~100. issues 가 하나라도 있으면 revise.`,
  };
}
