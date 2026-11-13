/**
 * AI 모델 · 생각 깊이 — 작업(공정 단계 + 보조 작업)마다 다르게.
 * 클라이언트·서버 공용 (순수 데이터). 실제 적용은 lib/llm.ts 의 ask() 가 task 키로 읽어서 함.
 *
 * 생각 깊이(effort) = Claude API output_config.effort (low · medium · high · xhigh · max)
 *   최신 Claude 모델은 생각(adaptive thinking)이 항상 켜져 있고 이 값으로 깊이만 조절.
 *   OpenAI 는 reasoning.effort 로 바꿔 보냄 (xhigh·max → high). 오픈소스 모델은 무시.
 */
export type Effort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Tier = 'deep' | 'normal' | 'fast';
export type TaskModel = { claude?: string; effort?: Effort; provider?: string; openai?: string; oss?: string; tier?: Tier };
export type ModelSettings = { default?: TaskModel; tasks?: Record<string, TaskModel> };

export const CLAUDE_MODELS: { id: string; label: string; note: string }[] = [
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', note: '최상위 — 가장 똑똑함 · 가장 비쌈 · 느림' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: '깊은 추론·창작 — 기획·대사·학습 정리에 적합' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: '균형 (기본) — 대부분의 작업' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: '빠르고 저렴 — 형식 맞추기·축약·분류' },
];
export const DEFAULT_CLAUDE = 'claude-sonnet-5-5';
export const claudeLabel = (id?: string | null) => CLAUDE_MODELS.find((m) => m.id === id)?.label.replace('Claude ', '') || id || '-';

export const EFFORTS: { id: Effort; label: string; note: string }[] = [
  { id: 'auto', label: '모델 기본', note: '모델이 정한 기본값' },
  { id: 'low', label: '낮음', note: '거의 바로 답함 · 형식 변환·축약·분류' },
  { id: 'medium', label: '보통', note: '약간 따져 봄 · 대부분의 작성' },
  { id: 'high', label: '높음', note: '충분히 생각 · 판단·창작·사실 확인' },
  { id: 'xhigh', label: '매우 높음', note: '오래 생각 · 어려운 판단 (느림)' },
  { id: 'max', label: '최대', note: '가장 오래 · 비용 큼 · 서버 시간 초과 주의' },
];
export const effortLabel = (e?: string | null) => EFFORTS.find((x) => x.id === e)?.label || '모델 기본';

export const TIERS: Record<Tier, { label: string; desc: string; preset: TaskModel }> = {
  deep: { label: '🧠 깊은 생각', desc: '판단·창작·사실 확인이 결과를 좌우하는 일', preset: { claude: 'claude-opus-5-5', effort: 'high' } },
  normal: { label: '⚖️ 보통', desc: '규칙에 맞춰 잘 쓰면 되는 일', preset: { claude: 'claude-sonnet-5-5', effort: 'medium' } },
  fast: { label: '⚡ 빠른 처리', desc: '형식 맞추기·변환·축약·분류 — 생각보다 속도', preset: { claude: 'claude-haiku-5-5', effort: 'low' } },
};

/** 작업 목록: 공정 단계 + 단계 안팎의 보조 AI 작업. tier = 기본 분류, why = 그렇게 분류한 이유 */
export const TASKS: { key: string; label: string; group: '공정 단계' | '검수·학습' | '분석·편성'; tier: Tier; why: string; defaults: TaskModel; vision?: boolean; web?: boolean }[] = [
  { key: 'research', label: '01 조사', group: '공정 단계', tier: 'deep', why: '웹검색 결과에서 공고·숫자·마감일을 가려내고 출처를 확인', defaults: { claude: 'claude-sonnet-5-5', effort: 'high' }, web: true },
  { key: 'plan', label: '02 기획', group: '공정 단계', tier: 'deep', why: '타깃·각도·훅을 정하는 판단 — 영상 성과를 가장 크게 좌우', defaults: { claude: 'claude-opus-5-5', effort: 'high' } },
  { key: 'script', label: '03 40초 대사', group: '공정 단계', tier: 'deep', why: '짧은 시간 안에 훅·전개·CTA 를 설계하는 창작', defaults: { claude: 'claude-opus-5-5', effort: 'high' } },
  { key: 'offer', label: '04 오퍼·이벤트', group: '공정 단계', tier: 'normal', why: '정해진 오퍼 목록·규칙 안에서 고르고 문구화', defaults: { claude: 'claude-sonnet-5-5', effort: 'medium' } },
  { key: 'landing', label: '05 랜딩 문구', group: '공정 단계', tier: 'normal', why: '슬롯별 글자수에 맞춰 쓰기 — 정확성 위주', defaults: { claude: 'claude-sonnet-5-5', effort: 'low' } },
  { key: 'design', label: '06 디자인·모션', group: '공정 단계', tier: 'normal', why: '장면 구성·강조어·색을 JSON 으로 — 규칙 기반', defaults: { claude: 'claude-sonnet-5-5', effort: 'low' } },
  { key: 'copy', label: '07 카피(설명·댓글)', group: '공정 단계', tier: 'normal', why: '채널별 설명·고정 댓글·캡션 — 짧은 카피', defaults: { claude: 'claude-sonnet-5-5', effort: 'medium' } },
  { key: 'post', label: '08 SEO 정보글', group: '공정 단계', tier: 'normal', why: '조사 내용을 긴 글로 정리 — 분량은 많지만 판단은 적음', defaults: { claude: 'claude-sonnet-5-5', effort: 'medium' } },

  { key: 'review', label: 'AI 검수 (승인/반려 판단)', group: '검수·학습', tier: 'deep', why: '산출물이 SOP·사실·금지어에 맞는지 판정 — 잘못 통과시키면 그대로 업로드', defaults: { claude: 'claude-sonnet-5-5', effort: 'high' } },
  { key: 'judge', label: '후보 채점 (여러 개 중 고르기)', group: '검수·학습', tier: 'normal', why: '운영자 채점 기준으로 후보 점수 예측', defaults: { claude: 'claude-sonnet-5-5', effort: 'medium' } },
  { key: 'fix', label: '글자수 자동 축약', group: '검수·학습', tier: 'fast', why: '의미 유지하며 줄이기만 — 단순 변환', defaults: { claude: 'claude-haiku-5-5', effort: 'low' } },
  { key: 'learn', label: 'SOP 학습·정리', group: '검수·학습', tier: 'deep', why: '좋은 예·수정 예·성과에서 규칙을 뽑아 SOP 를 고침 — 이후 모든 작업에 영향', defaults: { claude: 'claude-opus-5-5', effort: 'high' } },

  { key: 'reference', label: '참고 영상 분석', group: '분석·편성', tier: 'normal', why: '화면 프레임·대사로 구조와 재현 규칙 정리 (이미지 이해 필요)', defaults: { claude: 'claude-sonnet-5-5', effort: 'medium' }, vision: true },
  { key: 'channels', label: '채널 댓글 분석·분류', group: '분석·편성', tier: 'fast', why: '영상 형태 분류와 댓글 의도 집계 — 대량·단순', defaults: { claude: 'claude-haiku-5-5', effort: 'low' } },
  { key: 'editorial', label: '편성 AI PD', group: '분석·편성', tier: 'deep', why: '점수·새로움·흐름을 따져 한 주 순서를 다듬음', defaults: { claude: 'claude-sonnet-5-5', effort: 'high' } },
];
export const taskDef = (k: string) => TASKS.find((t) => t.key === k);

/** 저장값 + 기본값 → 실제 적용값 */
export function resolveTask(ms: ModelSettings | null | undefined, key?: string | null): Required<Pick<TaskModel, 'claude' | 'effort'>> & TaskModel & { source: 'task' | 'default' | 'builtin' } {
  const t = key ? ms?.tasks?.[key] : undefined;
  const d = ms?.default || {};
  const builtin = (key && taskDef(key)?.defaults) || { claude: DEFAULT_CLAUDE, effort: 'auto' as Effort };
  // 작업별로 저장한 값 > 작업의 기본 분류 (모델·생각 깊이는 작업마다 따로라서 전체 기본값을 쓰지 않음)
  const claude = t?.claude || builtin.claude || DEFAULT_CLAUDE;
  const effort = (t?.effort || builtin.effort || 'auto') as Effort;
  return {
    claude, effort,
    provider: t?.provider || d.provider || undefined,
    openai: t?.openai || d.openai || undefined,
    oss: t?.oss || d.oss || undefined,
    tier: t?.tier || (key ? taskDef(key)?.tier : undefined),
    source: t?.claude || t?.effort ? 'task' : 'builtin',
  };
}

/** 생각이 길어지면 출력 한도(max_tokens)를 늘려야 함 (생각 + 답변 합계) */
/** 상대 비용·시간 (1 = Haiku·낮음). 정확한 요금이 아니라 고를 때 감 잡기용 */
const MODEL_W: Record<string, number> = { 'claude-haiku-5-5': 1, 'claude-sonnet-5-5': 3, 'claude-opus-5-5': 5, 'claude-fable-5-2': 10 };
const EFFORT_W: Record<Effort, number> = { auto: 1.6, low: 1, medium: 1.6, high: 2.6, xhigh: 4, max: 6 };
export const relCost = (m: TaskModel) => (MODEL_W[m.claude || DEFAULT_CLAUDE] || 3) * EFFORT_W[(m.effort || 'auto') as Effort];

export const THINK_HEADROOM: Record<Effort, number> = { auto: 6000, low: 2000, medium: 6000, high: 16000, xhigh: 32000, max: 48000 };
export const OPENAI_EFFORT: Record<Effort, string | null> = { auto: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'high', max: 'high' };

export function cleanModels(v: any): ModelSettings {
  const ok = (m: any): TaskModel => {
    const o: TaskModel = {};
    if (typeof m?.claude === 'string' && /^claude-[a-z0-9.-]{3,60}$/.test(m.claude)) o.claude = m.claude;
    if (EFFORTS.some((e) => e.id === m?.effort)) o.effort = m.effort;
    if (['auto', 'claude', 'openai', 'oss'].includes(m?.provider)) o.provider = m.provider === 'auto' ? undefined : m.provider;
    if (typeof m?.openai === 'string' && m.openai.trim()) o.openai = m.openai.trim().slice(0, 60);
    if (typeof m?.oss === 'string' && m.oss.trim()) o.oss = m.oss.trim().slice(0, 100);
    if (m?.tier && m.tier in TIERS) o.tier = m.tier;
    return Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as TaskModel;
  };
  const tasks: Record<string, TaskModel> = {};
  for (const [k, m] of Object.entries(v?.tasks || {})) if (taskDef(k)) { const c = ok(m); if (Object.keys(c).length) tasks[k] = c; }
  return { default: ok(v?.default || {}), tasks };
}
