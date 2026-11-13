import { FONT_NAMES } from './fonts';
import type { Settings } from './types';
import type { Sop } from './sop';
import { stepDef, type StepKey } from './steps';
import { DIMENSIONS } from './editorial-taxonomy';

export const todayKST = () =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());

const ROLE: Record<string, string> = {
  research: '조사 담당. 웹 검색(및 연결된 MCP 도구)으로 최신 공고를 확인합니다.',
  plan: '기획 담당. 40초 세로 숏폼 구성안을 짭니다.',
  script: '대본 작가. AI 성우가 읽을 40초 내레이션과 자막을 씁니다.',
  offer: '전환 기획자. 영상에서 랜딩으로 넘어온 사람이 신청하게 만드는 이벤트를 설계합니다.',
  landing: '랜딩페이지 카피라이터. 슬롯별 글자수(공백 포함)를 절대 넘기지 않습니다. 줄바꿈은 \\n (글자수 제외).',
  design: `모션그래픽 디자이너. 1080x1920 세로 화면의 장면별 그래픽을 설계합니다.
layout: hook(큰 질문/충격 문구), stat(큰 숫자+단위), list(항목 2~4개 순차 등장), compare(2항목 비교), quote(핵심 한 문장), cta(행동 유도).
motion: pop, slide, typewriter, countup(stat 전용), zoom.
폰트(이 중에서만): ${FONT_NAMES.join(', ')}.`,
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
const revise = (prev: any, feedback?: string | null) =>
  feedback
    ? `\n\n## 재작업 지시 (최우선 반영)\n${feedback}\n\n## 이전 산출물 (지시와 무관한 부분은 유지)\n${J(prev)}`
    : '';

type Ctx = { s: Settings; c: any; prev?: any; feedback?: string | null; recentTopics?: string[]; slots?: any[]; brief?: string };

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
  "structure": [{ "id": "s1", "role": "hook|problem|info|detail|cta", "point": "이 장면에서 전달할 한 가지", "seconds": 4 }],
  "cta": "${s.cta_text} 를 자연스럽게 변형",
  ${AI_NOTES}
}
장면 6~8개, seconds 합계 38~42, 마지막 장면 role 은 cta. hook_options 3개는 서로 다른 type.${ctx.brief || ''}${revise(prev, feedback)}`; },

  script: ({ c, prev, feedback }) => `조사: ${J(c.research)}
기획: ${J(c.plan)}

규칙: 전체 내레이션 공백 제외 210~250자. 기획 structure 의 id 그대로 장면 분할.
captions: 내레이션을 화면 자막용으로 쪼갠 배열, 각 14자 이하(공백 포함), 순서·내용 누락 없이.

JSON 스키마:
{ "total_chars": 0, "scenes": [{ "id": "s1", "narration": "", "captions": [""] }], ${AI_NOTES} }${revise(prev, feedback)}`,

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

  landing: ({ c, prev, feedback, slots }) => `오늘 숏폼의 확정 대사와 이벤트에 맞게 랜딩페이지 문구를 교체합니다. 목표는 신청 전환입니다.
조사: ${J(c.research)}
확정 대사: ${J(c.script?.scenes?.map((x: any) => x.narration))}
이벤트: ${J(c.offer)}

슬롯 목록 (key / 용도 / 최대 글자수 / 현재 문구 — 현재 문구의 길이·톤을 기준으로):
${(slots || []).map((x) => `- ${x.key} / ${x.label} / ${x.max ?? '제한없음'}자 / "${x.current}"`).join('\n')}

JSON 스키마: { "values": { "슬롯key": "문구" }, ${AI_NOTES} } — 모든 슬롯 key 를 채웁니다.${revise(prev, feedback)}`,

  design: ({ c, prev, feedback }) => `기획: ${J(c.plan)}
대본: ${J(c.script)}

장면마다 화면 그래픽을 설계하세요. 자막은 하단에 따로 나가므로 headline 은 핵심 키워드·숫자만.
headline 12자 이하, sub 20자 이하, items 각 12자 이하. emphasis: headline 안에서 강조색으로 칠할 단어.

JSON 스키마:
{
  "theme": { "bg": "#0B1B3F", "bg2": "#132B63", "accent": "#FFD400", "text": "#FFFFFF", "sub": "#A9BCE6" },
  "fonts": { "title": "Black Han Sans", "body": "Noto Sans KR" },
  "scale": { "title": 1, "body": 1, "caption": 1 },
  "scenes": [{ "id": "s1", "layout": "hook", "headline": "", "sub": "", "items": [], "value": "", "unit": "", "emphasis": [], "motion": "pop", "icon": "이모지 1개(선택)" }],
  ${AI_NOTES}
}${revise(prev, feedback)}`,

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

- 제목 32자 이내, 본문 마크다운 2,000~3,000자, 표 1개 이상
- 이미지 자리 4개: ![대체텍스트](IMAGE_1) … ![대체텍스트](IMAGE_4)
- 본문 끝 "## 참고 공고"에 출처 링크, 마지막 문단에서 이벤트를 소개하고 {LINK}

JSON 스키마:
{ "title": "", "meta_description": "80~120자", "keywords": [""], "body_markdown": "", "faq": [{ "q": "", "a": "" }], ${AI_NOTES} }
faq 3~5개.${revise(prev, feedback)}`,
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
