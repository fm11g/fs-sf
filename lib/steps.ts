/** 공정 정의 — 클라이언트/서버/문서 공용 (순서 = 현황판 컬럼 순서) */
export type StepKey = 'research' | 'plan' | 'script' | 'offer' | 'landing' | 'design' | 'copy' | 'post' | 'render' | 'publish';

export type StepDef = {
  key: StepKey;
  no: string;
  label: string;
  kind: 'ai' | 'worker';
  deps: StepKey[];            // 이 단계가 읽는 상위 산출물 (승인되어야 실행 가능)
  field: string | null;       // contents 컬럼 (landing 은 landing_variants)
  out: string;                // 산출물 한 줄 설명
};

export const STEP_DEFS: StepDef[] = [
  { key: 'research', no: '01', label: '조사', kind: 'ai', deps: [], field: 'research', out: '주제·공고 사실·출처' },
  { key: 'plan', no: '02', label: '기획', kind: 'ai', deps: ['research'], field: 'plan', out: '훅·40초 구성안' },
  { key: 'script', no: '03', label: '40초 대사', kind: 'ai', deps: ['research', 'plan'], field: 'script', out: '내레이션·자막' },
  { key: 'offer', no: '04', label: '이벤트·오퍼', kind: 'ai', deps: ['research', 'plan', 'script'], field: 'offer', out: '신청 유도 이벤트' },
  { key: 'landing', no: '05', label: '랜딩 문구', kind: 'ai', deps: ['research', 'script', 'offer'], field: null, out: '슬롯별 문구(글자수 맞춤)' },
  { key: 'design', no: '06', label: '디자인·모션', kind: 'ai', deps: ['plan', 'script'], field: 'design', out: '장면 그래픽·폰트·색' },
  { key: 'copy', no: '07', label: '채널 카피', kind: 'ai', deps: ['research', 'script', 'offer'], field: 'copy', out: '제목·설명·댓글·캡션' },
  { key: 'post', no: '08', label: 'SEO 정보글', kind: 'ai', deps: ['research', 'script', 'offer'], field: 'post', out: '사이트 정보글' },
  { key: 'render', no: '09', label: '음성·자막·BGM·렌더', kind: 'worker', deps: ['script', 'design'], field: 'video_url', out: '40초 mp4·썸네일' },
  { key: 'publish', no: '10', label: '업로드·공개', kind: 'worker', deps: ['render', 'copy', 'landing', 'post'], field: null, out: '유튜브·인스타·랜딩·정보글' },
];

export const STEP_KEYS = STEP_DEFS.map((d) => d.key);
export const AI_STEPS = STEP_DEFS.filter((d) => d.kind === 'ai').map((d) => d.key);
export const stepDef = (k: string) => STEP_DEFS.find((d) => d.key === k)!;

/** k 가 바뀌면 다시 봐야 하는 하위 단계 (전이적) */
export function downstream(k: StepKey): StepKey[] {
  const out = new Set<StepKey>();
  const walk = (x: StepKey) => STEP_DEFS.forEach((d) => { if (d.deps.includes(x) && !out.has(d.key)) { out.add(d.key); walk(d.key); } });
  walk(k);
  return STEP_KEYS.filter((s) => out.has(s));
}

export const STATE_KO: Record<string, string> = {
  pending: '대기', running: '작업 중', review: '검수 대기', approved: '승인', rejected: '반려', stale: '재작업 필요', failed: '실패',
};
export const GATE_KO: Record<string, string> = { manual: '사람이 결정', ai: 'AI가 결정', auto: '검수 없이 통과' };
export const FREEDOM_KO = ['0 · SOP 엄수', '1 · 보수적', '2 · 균형(제안 허용)', '3 · 자유(구조 변경 허용)'];
