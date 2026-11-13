/** 점수·태그 체계 (클라이언트·서버 공용, 순수 함수) */

export type Tier = 'gold' | 'silver' | 'neutral' | 'negative' | 'unrated';
export const TIER_KO: Record<Tier, string> = { gold: '★5 최상', silver: '★4 좋음', neutral: '★3 보통', negative: '★1~2 아쉬움', unrated: '미평가' };

export const tierOf = (score?: number | null): Tier =>
  score == null ? 'unrated' : score >= 5 ? 'gold' : score >= 4 ? 'silver' : score >= 3 ? 'neutral' : 'negative';
export const kindOf = (score: number): 'good' | 'neutral' | 'bad' => (score >= 4 ? 'good' : score <= 2 ? 'bad' : 'neutral');

/** 평가할 때 고르는 태그 — 좋은 점 / 아쉬운 점 (단계별 추가) */
export const POS_TAGS: Record<string, string[]> = {
  _: ['사실정확', '타깃적합', '숫자명확', '간결함', '톤좋음', '전환유도', '바로사용가능'],
  research: ['시의성높음', '출처충실', '각도좋음'],
  plan: ['훅강함', '마감훅', '숫자훅', '손실훅', '질문훅', '구성탄탄'],
  script: ['첫문장강함', '리듬좋음', '귀에쏙', '자연스러운말투'],
  offer: ['혜택명확', '허들낮음', '영상과연결', '근거있는마감'],
  landing: ['영상과연결', '헤드라인강함', '버튼명확', '불안해소'],
  design: ['가독성', '화면리듬', '강조적절', '색감좋음'],
  copy: ['제목클릭유도', '댓글행동유도', '해시태그적절'],
  post: ['검색의도충족', '구조좋음', '표유용', 'FAQ유용'],
};
export const NEG_TAGS: Record<string, string[]> = {
  _: ['사실오류', '근거부족', '과장', '장황함', '밋밋함', '어색한표현', '타깃불일치'],
  research: ['오래된공고', '출처약함'],
  plan: ['훅약함', '장면과다'],
  script: ['길이초과', '숫자과다', '발음어려움'],
  offer: ['혜택모호', '허들높음'],
  landing: ['글자수안맞음', '영상과단절'],
  design: ['글자과다', '단조로움'],
  copy: ['낚시성', '링크누락'],
  post: ['키워드나열', '얕은내용'],
};
export const tagsFor = (step: string) => ({ pos: [...POS_TAGS._, ...(POS_TAGS[step] || [])], neg: [...NEG_TAGS._, ...(NEG_TAGS[step] || [])] });

const len = (s: any) => [...String(s ?? '').replace(/\n/g, '')].length;
const noSpace = (s: any) => String(s ?? '').replace(/\s/g, '').length;
const hasNum = (s: any) => /\d/.test(String(s ?? ''));
const bucket = (n: number, w: number) => `${Math.floor(n / w) * w}~${Math.floor(n / w) * w + w - 1}`;

/** 자동 특징 태그 — 점수와 함께 저장해 "어떤 조건에서 점수가 높은지"를 구분한다 */
export function features(step: string, out: any, ctx: { c?: any; row?: any; sopHash?: string | null } = {}): Record<string, string | number | boolean> {
  const c = ctx.c || {};
  const row = ctx.row || {};
  const f: Record<string, string | number | boolean> = {
    step,
    provider: String(row.provider || '').split('/')[0] || '-',
    model: row.model || '-',
    sop: ctx.sopHash || row.sop_hash || '-',
    freedom: row.freedom ?? '-',
    attempts: row.attempts ?? 0,
    candidates: row.candidates ?? 1,
    decided_by: row.decided_by || '-',
    agency: c.research?.program?.agency || '-',
    slot_experiment: !!c.editorial?.experiment,
    month: String(c.created_at || new Date().toISOString()).slice(0, 7),
  };
  if (!out) return f;
  switch (step) {
    case 'research':
      Object.assign(f, { facts: (out.facts || []).length, has_deadline: !!out.program?.deadline, keywords: (out.keywords || []).length, topic_category: out.topic_category || '-' });
      break;
    case 'plan': {
      const chosen = (out.hook_options || []).find((h: any) => (typeof h === 'string' ? h : h.text) === out.chosen_hook);
      Object.assign(f, {
        hook_type: (chosen && typeof chosen === 'object' && chosen.type) || '-', mood: out.mood || '-',
        angle: out.angle || c.editorial?.angle || '-', format: out.format || c.editorial?.format || '-', topic_category: c.research?.topic_category || out.topic_category || '-',
        scenes: (out.structure || []).length, seconds: (out.structure || []).reduce((n: number, x: any) => n + Number(x.seconds || 0), 0),
        hook_has_number: hasNum(out.chosen_hook),
      });
      break;
    }
    case 'script': {
      const sc = out.scenes || [];
      const total = sc.reduce((n: number, x: any) => n + noSpace(x.narration), 0);
      Object.assign(f, {
        chars: bucket(total, 20), scenes: sc.length, first_has_number: hasNum(sc[0]?.narration),
        caption_max: Math.max(0, ...sc.flatMap((x: any) => (x.captions || []).map(len))),
      });
      break;
    }
    case 'offer':
      Object.assign(f, { has_deadline: !!out.deadline_label, benefits: 1 + (out.benefits || []).length, cta_len: len(out.cta), event_has_topic: !!(c.topic && out.event_name && String(c.topic).split(' ').some((w: string) => w.length > 1 && String(out.event_name).includes(w))) });
      break;
    case 'landing':
      Object.assign(f, { slots: Object.keys(out).length, headline_has_number: hasNum(out.hero_title), headline_len: len(out.hero_title) });
      break;
    case 'design':
      Object.assign(f, {
        layouts: (out.scenes || []).map((x: any) => x.layout).join('>') || '-', title_font: out.fonts?.title || '-',
        stat_scenes: (out.scenes || []).filter((x: any) => x.layout === 'stat').length,
      });
      break;
    case 'copy':
      Object.assign(f, { title_len: len(out.youtube?.title), title_has_number: hasNum(out.youtube?.title), hashtags: (String(out.instagram?.caption || '').match(/#/g) || []).length });
      break;
    case 'post': {
      const md = String(out.body_markdown || '');
      Object.assign(f, { body_chars: bucket(noSpace(md), 500), h2: (md.match(/^## /gm) || []).length, tables: (md.match(/^\|.*\|\s*$/gm) || []).length ? 1 : 0, faq: (out.faq || []).length });
      break;
    }
  }
  return f;
}

/** 시트·CSV 에서 별도 열로 구분하는 특징 키 (단계별로 없는 값은 빈칸) */
export const FEATURE_COLUMNS = [
  'provider', 'model', 'sop', 'freedom', 'attempts', 'candidates', 'decided_by', 'agency', 'month',
  'topic_category', 'angle', 'format', 'slot_experiment', 'hook_type', 'mood', 'scenes', 'seconds', 'hook_has_number', 'chars', 'first_has_number', 'caption_max',
  'facts', 'has_deadline', 'keywords', 'benefits', 'cta_len', 'event_has_topic', 'slots', 'headline_has_number', 'headline_len',
  'layouts', 'title_font', 'stat_scenes', 'title_len', 'title_has_number', 'hashtags', 'body_chars', 'h2', 'tables', 'faq',
];

/** 점수 분석용 태그: 내 태그 + 범주형 특징 (key=value) */
const STAT_KEYS = ['provider', 'model', 'sop', 'freedom', 'candidates', 'topic_category', 'angle', 'format', 'slot_experiment', 'hook_type', 'mood', 'scenes', 'hook_has_number', 'chars', 'first_has_number', 'has_deadline', 'benefits', 'headline_has_number', 'title_font', 'title_has_number', 'body_chars', 'event_has_topic'];
export const statTags = (e: { tags?: string[]; features?: Record<string, any> }) => [
  ...(e.tags || []),
  ...STAT_KEYS.filter((k) => e.features?.[k] != null && e.features[k] !== '-').map((k) => `${k}=${e.features![k]}`),
];

/** 태그별 평균 점수와 전체 평균 대비 차이 (lift). 근거 수 2 미만 제외 */
export function tagStats(items: { score?: number | null; tags?: string[]; features?: Record<string, any> }[], minN = 2) {
  const rated = items.filter((x) => x.score != null);
  if (!rated.length) return { overall: null as number | null, n: 0, rows: [] as { tag: string; n: number; avg: number; lift: number }[] };
  const overall = rated.reduce((s, x) => s + Number(x.score), 0) / rated.length;
  const m = new Map<string, number[]>();
  for (const x of rated) for (const t of new Set(statTags(x))) (m.get(t) || m.set(t, []).get(t)!).push(Number(x.score));
  const rows = [...m.entries()].filter(([, v]) => v.length >= minN)
    .map(([tag, v]) => { const avg = v.reduce((a, b) => a + b, 0) / v.length; return { tag, n: v.length, avg: Math.round(avg * 100) / 100, lift: Math.round((avg - overall) * 100) / 100 }; })
    .sort((a, b) => b.lift - a.lift || b.n - a.n);
  return { overall: Math.round(overall * 100) / 100, n: rated.length, rows };
}
