/**
 * SOP 학습 제안을 기존 md 에 적용하는 순수 함수 (서버·브라우저 공용)
 * - 기존 SOP 를 통째로 다시 쓰지 않고, 줄 단위 add / modify / remove 만 적용한다
 * - modify/remove 의 target 은 기존 줄과 일치해야 하며, 못 찾으면 conflict 로 표시하고 건너뛴다
 */
export type ChangeOp = 'add' | 'modify' | 'remove';
export type SopChange = {
  op: ChangeOp;
  section: string;          // '집중 포인트' | '체크리스트' | '금지' | '사람이 결정할 것' | '목적'
  target?: string;          // modify/remove: 기존 줄 (그대로 복사)
  text?: string;            // add/modify: 새 줄 (목록 기호 없이)
  reason?: string;
  evidence?: number[];      // exemplar id
  warn?: string;            // 서버가 붙이는 경고 (금지 섹션 변경 등)
};
export type ApplyResult = { content: string; results: { i: number; ok: boolean; conflict?: string }[] };

export const SECTIONS = ['목적', '집중 포인트', '체크리스트', '금지', '사람이 결정할 것'] as const;

const norm = (s: string) =>
  s.replace(/^\s*[-*]\s*(\[[ xX]\]\s*)?/, '').replace(/^\(\d{1,2}\/\d{1,2}[^)]*\)\s*/, '').replace(/\s+/g, ' ').trim();

const secKey = (h: string) => h.replace(/^##\s*/, '').trim();

function findSection(lines: string[], name: string) {
  const start = lines.findIndex((l) => /^##\s/.test(l) && secKey(l).replace(/\s/g, '') === name.replace(/\s/g, ''));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
  return { start, end };
}

function findLine(lines: string[], sec: { start: number; end: number }, target: string) {
  const t = norm(target);
  if (!t) return -1;
  for (let i = sec.start + 1; i < sec.end; i++) if (norm(lines[i]) === t) return i;
  // 느슨한 일치: 한쪽이 다른 쪽을 포함 (짧은 쪽이 12자 이상일 때만)
  for (let i = sec.start + 1; i < sec.end; i++) {
    const l = norm(lines[i]);
    if (!l) continue;
    const short = l.length < t.length ? l : t;
    if (short.length >= 12 && (l.includes(t) || t.includes(l))) return i;
  }
  return -1;
}

function formatLine(section: string, text: string, today: string, op: ChangeOp, prevLine?: string) {
  const body = norm(text);
  if (section.replace(/\s/g, '') === '체크리스트') return `- [ ] ${body}`;
  if (section.replace(/\s/g, '') === '집중포인트' && op === 'add') return `- (${today}) ${body}`;
  // modify 는 기존 줄의 날짜 표기를 유지
  const keepDate = prevLine?.match(/^\s*[-*]\s*(\(\d{1,2}\/\d{1,2}[^)]*\))\s*/)?.[1];
  return `- ${keepDate ? keepDate + ' ' : ''}${body}`;
}

export function todayMD(d = new Date()) {
  const k = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${k.getMonth() + 1}/${k.getDate()}`;
}

/** selected: 적용할 변경 번호 (없으면 전부) · edits: 번호별로 운영자가 고친 새 문구 */
export function applyChanges(md: string, changes: SopChange[], selected?: number[], edits: Record<number, string> = {}, today = todayMD()): ApplyResult {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const results: ApplyResult['results'] = [];
  const pick = selected ?? changes.map((_, i) => i);

  // 삭제·수정을 먼저(위치가 덜 흔들리게), 추가는 나중에
  const order = [...pick].sort((a, b) => (changes[a]?.op === 'add' ? 1 : 0) - (changes[b]?.op === 'add' ? 1 : 0));
  for (const i of order) {
    const c = changes[i];
    if (!c) continue;
    const text = edits[i] ?? c.text ?? '';
    let sec = findSection(lines, c.section);

    if (c.op === 'add') {
      if (!norm(text)) { results.push({ i, ok: false, conflict: '추가할 문구가 비어 있음' }); continue; }
      if (!sec) { // 섹션이 없으면 문서 끝에 만든다
        if (lines[lines.length - 1]?.trim()) lines.push('');
        lines.push(`## ${c.section}`);
        sec = findSection(lines, c.section)!;
      }
      // 이미 같은 줄이 있으면 중복 추가하지 않음
      if (findLine(lines, sec, text) >= 0 && norm(lines[findLine(lines, sec, text)]) === norm(text)) { results.push({ i, ok: false, conflict: '이미 같은 내용이 있음' }); continue; }
      const line = formatLine(c.section, text, today, 'add');
      if (c.section.replace(/\s/g, '') === '집중포인트') {
        // 새 학습은 맨 위에 (첫 목록 줄 앞)
        let at = sec.start + 1;
        while (at < sec.end && !lines[at].trim()) at++;
        lines.splice(at, 0, line);
      } else {
        let at = sec.end;
        while (at - 1 > sec.start && !lines[at - 1].trim()) at--;
        lines.splice(at, 0, line);
      }
      results.push({ i, ok: true });
      continue;
    }

    if (!sec) { results.push({ i, ok: false, conflict: `'${c.section}' 섹션 없음` }); continue; }
    const at = findLine(lines, sec, c.target || '');
    if (at < 0) { results.push({ i, ok: false, conflict: '기존 SOP 에서 대상 줄을 찾지 못함 (SOP 가 바뀌었을 수 있음)' }); continue; }
    if (c.op === 'remove') lines.splice(at, 1);
    else {
      if (!norm(text)) { results.push({ i, ok: false, conflict: '수정할 문구가 비어 있음' }); continue; }
      lines[at] = formatLine(c.section, text, today, 'modify', lines[at]);
    }
    results.push({ i, ok: true });
  }
  return { content: lines.join('\n').replace(/\n{3,}/g, '\n\n'), results: results.sort((a, b) => a.i - b.i) };
}

/** 서버 측 안전 검사: 금지 표현이 들어간 변경은 버리고, 위험한 변경에는 경고를 붙인다 */
export function sanitizeChanges(changes: any[], banned: string[]): SopChange[] {
  const out: SopChange[] = [];
  for (const raw of Array.isArray(changes) ? changes : []) {
    const op = raw?.op;
    if (!['add', 'modify', 'remove'].includes(op)) continue;
    const c: SopChange = {
      op, section: String(raw.section || '집중 포인트').replace(/^##\s*/, '').trim(),
      target: raw.target ? String(raw.target).slice(0, 400) : undefined,
      text: raw.text ? String(raw.text).replace(/\n/g, ' ').slice(0, 300) : undefined,
      reason: raw.reason ? String(raw.reason).slice(0, 300) : undefined,
      evidence: Array.isArray(raw.evidence) ? raw.evidence.map(Number).filter((n: number) => Number.isFinite(n)).slice(0, 10) : [],
    };
    if (banned.some((b) => b && c.text?.includes(b))) continue;
    const warns: string[] = [];
    if (c.section.replace(/\s/g, '') === '금지' && op !== 'add') warns.push('금지 항목을 바꾸거나 지우는 변경 — 사실·규정이 느슨해지지 않는지 확인');
    if (op === 'remove') warns.push('기존 지침 삭제');
    if ((c.evidence?.length || 0) < 2) warns.push('근거 예시가 2개 미만');
    if (/JSON|스키마|글자수|자 이하|자 이내/.test(c.text || '')) warns.push('형식·글자수 규칙은 코드에 고정 — md 에는 불필요할 수 있음');
    if (warns.length) c.warn = warns.join(' · ');
    out.push(c);
  }
  return out.slice(0, 8);
}

/** 자동 반영 모드에서 사람 확인 없이 적용해도 되는 변경 */
export const isSafeAuto = (c: SopChange) => c.op !== 'remove' && c.section.replace(/\s/g, '') !== '금지' && (c.evidence?.length || 0) >= 2;

// ── 전체 재정리(rewrite) 안전 검사 · 줄 비교 ─────────────────────────
const sectionLines = (md: string, name: string) => {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const s = lines.findIndex((l) => /^##\s/.test(l) && l.replace(/^##\s*/, '').replace(/\s/g, '') === name.replace(/\s/g, ''));
  if (s < 0) return [] as string[];
  const out: string[] = [];
  for (let i = s + 1; i < lines.length && !/^#{1,2}\s/.test(lines[i]); i++) if (lines[i].trim()) out.push(lines[i]);
  return out;
};

/**
 * 재정리안 검사: 필수 섹션 유지 · 금지 항목 보존(빠지면 자동으로 되살림) · 금지 표현 차단 · 분량 경고
 * 반환 content 는 보정된 md
 */
export function checkRewrite(base: string, next: string, banned: string[]) {
  const warns: string[] = [];
  let content = next.replace(/\r\n/g, '\n').trim() + '\n';
  for (const b of banned) if (b && content.includes(b)) return { ok: false as const, content, warns: [`금지 표현 포함: "${b}"`] };
  for (const sec of SECTIONS) {
    if (sectionLines(base, sec).length && !new RegExp(`^##\\s*${sec}\\s*$`, 'm').test(content)) {
      content += `\n## ${sec}\n${sectionLines(base, sec).join('\n')}\n`;
      warns.push(`'${sec}' 섹션이 빠져 기존 내용으로 되살림`);
    }
  }
  const nextBan = sectionLines(content, '금지').map(norm);
  const lost = sectionLines(base, '금지').filter((l) => !nextBan.some((n) => n === norm(l) || (norm(l).length >= 8 && n.includes(norm(l)))));
  if (lost.length) {
    const lines = content.split('\n');
    const at = lines.findIndex((l) => /^##\s*금지\s*$/.test(l));
    let end = lines.length;
    for (let i = at + 1; i < lines.length; i++) if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
    while (end - 1 > at && !lines[end - 1].trim()) end--;
    lines.splice(end, 0, ...lost);
    content = lines.join('\n');
    warns.push(`금지 항목 ${lost.length}개가 빠져 있어 되살림 (금지 항목은 재정리로 지우지 않음)`);
  }
  const ratio = content.length / Math.max(1, base.length);
  if (ratio > 1.6) warns.push(`분량이 ${Math.round(ratio * 100)}%로 늘어남 — SOP 가 길면 AI 집중도가 떨어짐`);
  if (ratio < 0.5) warns.push(`분량이 ${Math.round(ratio * 100)}%로 줄어듦 — 빠진 지침이 없는지 확인`);
  return { ok: true as const, content, warns };
}

/** 줄 단위 비교 (LCS) — 재정리 전/후 화면 표시용 */
export function lineDiff(a: string, b: string) {
  const A = a.replace(/\r\n/g, '\n').split('\n');
  const B = b.replace(/\r\n/g, '\n').split('\n');
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: 'same' | 'add' | 'del'; line: string }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: 'same', line: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: 'del', line: A[i++] });
    else out.push({ t: 'add', line: B[j++] });
  }
  while (i < n) out.push({ t: 'del', line: A[i++] });
  while (j < m) out.push({ t: 'add', line: B[j++] });
  return out;
}
