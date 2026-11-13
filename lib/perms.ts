/** 권한 블록 — 클라이언트/서버 공용. 대표(owner)는 전부, 직원(staff)은 받은 블록만 */
import { STEP_DEFS, type StepKey } from './steps';

export type Level = 'view' | 'work';
export type Perms = Record<string, Level>;
export type Me = { email: string; name: string | null; role: 'owner' | 'staff' | 'worker'; perms: Perms };

export type Block = { key: string; label: string; group: '화면' | '공정 단계'; desc: string; href?: string; workOnly?: boolean };

export const BLOCKS: Block[] = [
  { key: 'board', label: '현황판', group: '화면', href: '/admin', desc: '보기: 콘텐츠 목록·진행 상황 · 작업: 새 숏폼 만들기·자동 진행' },
  { key: 'editorial', label: '편성표', group: '화면', href: '/admin/editorial', desc: '보기: 주간 편성 · 작업: 편성 다시 짜기·슬롯 수정' },
  { key: 'channels', label: '채널 성과', group: '화면', href: '/admin/channels', desc: '보기: 조회·공유·댓글 점수 · 작업: 다시 분석' },
  { key: 'metrics', label: '작업 효율', group: '화면', href: '/admin/metrics', desc: '단계별 시간·재작업률·비용' },
  { key: 'references', label: '참고 영상', group: '화면', href: '/admin/references', desc: '보기: 분석 결과 · 작업: 영상 추가·학습 설정·이 영상처럼 만들기' },
  { key: 'sop', label: 'SOP · AI 제어', group: '화면', href: '/admin/sop', desc: '보기: SOP 읽기 · 작업: SOP 수정·학습 반영' },
  { key: 'landing_tpl', label: '랜딩 템플릿', group: '화면', href: '/admin/landing', desc: '보기/작업: 랜딩 HTML 템플릿' },
  { key: 'leads', label: '신청 내역', group: '화면', href: '/admin/leads', desc: '개인정보가 포함됩니다' },
  ...STEP_DEFS.map((d) => ({ key: `step:${d.key}`, label: `${d.no} ${d.label}`, group: '공정 단계' as const, desc: `보기: ${d.out} 읽기 · 작업: 실행·수정·승인/반려·평가` })),
  { key: 'editor', label: '영상 편집기', group: '공정 단계', desc: '색·멘트·폰트·위치·영상 크기 편집 (작업 권한만 의미 있음)', workOnly: true },
];

/** 대표 전용 (직원에게 줄 수 없음) */
export const OWNER_ONLY = ['settings', 'keys', 'members', 'export', 'delete', 'agent'];

/** 미리 만든 묶음 — 직원 추가 화면에서 한 번에 체크 */
export const PRESETS: { name: string; perms: Perms }[] = [
  { name: '대본 작가', perms: { board: 'view', 'step:research': 'view', 'step:plan': 'view', 'step:script': 'work' } },
  { name: '디자이너·편집자', perms: { board: 'view', 'step:script': 'view', 'step:design': 'work', editor: 'work', 'step:render': 'work', references: 'view' } },
  { name: '카피·마케터', perms: { board: 'view', 'step:offer': 'work', 'step:landing': 'work', 'step:copy': 'work', 'step:post': 'work', leads: 'view', channels: 'view' } },
  { name: '검수 담당', perms: Object.fromEntries([['board', 'view'], ...STEP_DEFS.map((d) => [`step:${d.key}`, 'view'])]) as Perms },
];

const rank = (l?: Level | null) => (l === 'work' ? 2 : l === 'view' ? 1 : 0);

export function can(me: Me | null | undefined, key: string, level: Level = 'view'): boolean {
  if (!me) return false;
  if (me.role === 'owner' || me.role === 'worker') return true;
  if (OWNER_ONLY.includes(key)) return false;
  return rank(me.perms?.[key]) >= rank(level);
}
export const canStep = (me: Me | null | undefined, step: StepKey | string, level: Level = 'view') => can(me, `step:${step}`, level);
export const visibleSteps = (me: Me | null | undefined) => STEP_DEFS.filter((d) => canStep(me, d.key));

/** 저장 전에 허용된 키·값만 남김 */
export function cleanPerms(p: any): Perms {
  const keys = new Set(BLOCKS.map((b) => b.key));
  const out: Perms = {};
  for (const [k, v] of Object.entries(p || {})) if (keys.has(k) && (v === 'view' || v === 'work')) out[k] = v;
  // 공정 단계 블록을 받았으면 현황판 보기는 자동 (어떤 콘텐츠가 있는지는 알아야 작업 가능)
  if (Object.keys(out).some((k) => k.startsWith('step:') || k === 'editor') && !out.board) out.board = 'view';
  return out;
}

/** 경로 → 필요한 블록 (화면 숨김용. 데이터는 API 에서 다시 막음) */
export function pathBlock(path: string): string | null {
  if (path === '/admin' || path.startsWith('/admin/contents')) return 'board';
  if (path.startsWith('/admin/settings')) return 'settings';
  if (path.startsWith('/admin/keys')) return 'keys';
  if (path.startsWith('/admin/members')) return 'members';
  const b = BLOCKS.find((x) => x.href && x.href !== '/admin' && path.startsWith(x.href));
  return b?.key ?? null;
}
