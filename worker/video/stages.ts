/**
 * 렌더 진행 단계 정의 — 워커(기록)와 관리자 화면(표시)이 같이 씀. 순수 모듈.
 * weight 합 = 100. 전체 % = Σ(완료 단계 weight) + 진행 중 단계 weight × 단계 %.
 */
export const RENDER_STAGES = [
  { key: 'queue', label: '요청 접수', desc: 'GitHub Actions 에 렌더 요청 → 빈 서버 배정 대기', weight: 2 },
  { key: 'setup', label: '렌더 서버 준비', desc: '코드 받기 · Chrome·한글 폰트 · 패키지 설치 · 브라우저 준비', weight: 10 },
  { key: 'voice', label: 'AI 목소리', desc: '장면별 내레이션 TTS → 실제 길이로 타이밍 확정', weight: 18 },
  { key: 'bgm', label: '배경음악', desc: '지정 음원 또는 기획 무드에 맞는 음원 선택', weight: 1 },
  { key: 'bundle', label: '모션 준비', desc: '영상 코드 묶기 · 폰트·레이아웃 불러오기', weight: 6 },
  { key: 'frames', label: '프레임 그리기', desc: '장면·자막·모션 레이어를 프레임마다 그림', weight: 45 },
  { key: 'encode', label: '인코딩·합성', desc: 'H.264 압축 · 목소리·BGM 합치기', weight: 7 },
  { key: 'stills', label: '썸네일', desc: '대표 장면 정지 화면 4장 (썸네일·정보글 이미지)', weight: 5 },
  { key: 'upload', label: '업로드', desc: '완성 영상을 스토리지에 올림', weight: 4 },
  { key: 'check', label: '검사·결정', desc: '길이·BGM 규칙 검사 → 자동 승인 또는 검수 대기', weight: 2 },
] as const;

export type RenderStageKey = (typeof RENDER_STAGES)[number]['key'];
export type StageState = 'wait' | 'running' | 'done' | 'failed' | 'skip';

export type RenderProgress = {
  job: string;                 // 요청마다 새 값 — 예전 기록과 구분
  status: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
  pct: number;                 // 0~100 전체
  stage: RenderStageKey;       // 지금 단계
  stages: Record<string, { state: StageState; pct?: number; detail?: string; started_at?: string; finished_at?: string }>;
  log: { t: string; stage?: string; msg: string; level?: 'info' | 'warn' | 'error' }[];
  requested_at: string;
  started_at?: string;         // 워커가 실제로 시작한 시각
  updated_at: string;
  finished_at?: string;
  eta_sec?: number | null;
  run_url?: string;            // GitHub Actions 실행 화면
  frames?: { done: number; encoded: number; total: number; fps?: number };
  scenes?: { id: string; layout?: string; headline?: string; sec?: number; from?: number; to?: number; voice?: StageState; voice_url?: string }[];
  stills?: string[];           // 만들어진 썸네일 (바로 보여 줌)
  size?: string;               // 1080x1920
  error?: string;
  result?: { video_url?: string; total_sec?: number; approved?: boolean };
};

/** 단계 상태 → 전체 % */
export function overallPct(stages: RenderProgress['stages']) {
  let n = 0;
  for (const s of RENDER_STAGES) {
    const st = stages[s.key];
    if (!st) continue;
    if (st.state === 'done' || st.state === 'skip') n += s.weight;
    else if (st.state === 'running' || st.state === 'failed') n += s.weight * Math.max(0, Math.min(1, (st.pct || 0) / 100));
  }
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

export function newProgress(job: string): RenderProgress {
  const t = new Date().toISOString();
  const stages: RenderProgress['stages'] = {};
  for (const s of RENDER_STAGES) stages[s.key] = { state: 'wait' };
  stages.queue = { state: 'running', started_at: t, detail: 'GitHub Actions 에 요청 보냄' };
  return { job, status: 'queued', pct: 0, stage: 'queue', stages, log: [{ t, stage: 'queue', msg: '렌더 요청 → GitHub Actions' }], requested_at: t, updated_at: t };
}

export const stageDef = (k: string) => RENDER_STAGES.find((s) => s.key === k);
