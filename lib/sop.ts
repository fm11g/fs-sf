import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sbAdmin } from './supabase/server';
import { STEP_DEFS, stepDef, type StepKey } from './steps';

export type Sop = { step: StepKey; content: string; freedom: number; gate: 'manual' | 'ai' | 'auto'; provider?: string; best_of?: number; updated_at?: string; isDefault?: boolean };

const DEFAULTS: Record<StepKey, { freedom: number; gate: Sop['gate'] }> = {
  research: { freedom: 1, gate: 'manual' },
  plan: { freedom: 2, gate: 'manual' },
  script: { freedom: 2, gate: 'manual' },
  offer: { freedom: 1, gate: 'manual' },
  landing: { freedom: 2, gate: 'ai' },
  design: { freedom: 3, gate: 'ai' },
  copy: { freedom: 2, gate: 'ai' },
  post: { freedom: 2, gate: 'ai' },
  render: { freedom: 0, gate: 'manual' },
  publish: { freedom: 0, gate: 'manual' },
};

export const sopFile = (step: StepKey) => `sop/${stepDef(step).no}-${step}.md`;

/** 저장소의 sop/*.md (기본값) */
export function defaultSop(step: StepKey): Sop {
  let content = `# ${stepDef(step).no}. ${stepDef(step).label}\n`;
  try { content = fs.readFileSync(path.join(process.cwd(), sopFile(step)), 'utf8'); } catch { /* 파일 없음 */ }
  return { step, content, ...DEFAULTS[step], provider: 'auto', best_of: 1, isDefault: true };
}

/** DB에 저장된 SOP가 있으면 그것, 없으면 저장소 기본값 */
export async function getSop(step: StepKey): Promise<Sop> {
  const { data } = await sbAdmin().from('sops').select('*').eq('step', step).maybeSingle();
  return data ? (data as Sop) : defaultSop(step);
}

export async function listSops(): Promise<Sop[]> {
  const { data } = await sbAdmin().from('sops').select('*');
  return STEP_DEFS.map((d) => (data || []).find((r: any) => r.step === d.key) || defaultSop(d.key));
}

export async function saveSop(step: StepKey, patch: Partial<Pick<Sop, 'content' | 'freedom' | 'gate' | 'provider' | 'best_of'>>, note?: string) {
  const cur = await getSop(step);
  const row = { step, content: patch.content ?? cur.content, freedom: patch.freedom ?? cur.freedom, gate: patch.gate ?? cur.gate, provider: patch.provider ?? cur.provider ?? 'auto', best_of: Math.min(4, Math.max(1, Number(patch.best_of ?? cur.best_of ?? 1))), updated_at: new Date().toISOString() };
  const db = sbAdmin();
  const { error } = await db.from('sops').upsert(row);
  if (error) throw new Error(error.message);
  await db.from('sop_versions').insert({ step, content: row.content, freedom: row.freedom, gate: row.gate, note: note || null });
  return row;
}

/** 관리자에서 고친 SOP를 저장소 sop/*.md 에 커밋 (GITHUB_TOKEN: Contents Read/Write) */
export async function commitSopToGithub(step: StepKey, content: string) {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPO / GITHUB_TOKEN 환경변수가 없습니다');
  const url = `https://api.github.com/repos/${repo}/contents/${sopFile(step)}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const cur: any = await fetch(url, { headers }).then((r) => (r.ok ? r.json() : null));
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `sop(${step}): 관리자 페이지에서 수정`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      ...(cur?.sha ? { sha: cur.sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub 커밋 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).commit?.html_url as string;
}

/** SOP 버전 식별자 (내용 해시 8자) — 실행·평가 기록에 남겨 버전별 점수를 비교 */
export const sopHash = (content: string) => crypto.createHash('sha1').update(content || '').digest('hex').slice(0, 8);
