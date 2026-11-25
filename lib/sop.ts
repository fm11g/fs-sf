import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sbAdmin } from './supabase/server';
import { normRepo } from './secrets';
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
  await db.from('sop_versions').insert({ step, content: row.content, freedom: row.freedom, gate: row.gate, note: note || null, hash: sopHash(row.content) });
  return row;
}

/** 관리자에서 고친 SOP를 저장소 sop/*.md 에 커밋 (GITHUB_TOKEN: Contents Read/Write) */
export async function commitSopToGithub(step: StepKey, content: string) {
  const repo = normRepo(process.env.GITHUB_REPO || '');
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

/**
 * 이 SOP 내용의 버전 id — 없으면 만들어 둠 (저장소 기본 SOP 처럼 한 번도 저장 안 된 내용도 그때 전문을 남김)
 * 예전 버전(hash 칸이 비어 있는 행)은 여기서 해시를 채워 넣음
 */
export async function ensureSopVersion(step: StepKey, sop: Sop): Promise<{ id: number | null; hash: string }> {
  const db = sbAdmin();
  const hash = sopHash(sop.content);
  const find = async () => (await db.from('sop_versions').select('id').eq('step', step).eq('hash', hash).order('created_at', { ascending: false }).limit(1).maybeSingle()).data?.id ?? null;
  let id = await find();
  if (!id) {
    const { data: old } = await db.from('sop_versions').select('id, content').eq('step', step).is('hash', null).limit(300);
    for (const r of old || []) await db.from('sop_versions').update({ hash: sopHash(r.content) }).eq('id', r.id);
    id = await find();
  }
  if (!id) {
    const { data } = await db.from('sop_versions').insert({
      step, content: sop.content, freedom: sop.freedom, gate: sop.gate, hash,
      note: sop.isDefault ? '자동 기록 — 저장소 기본 SOP(sop/*.md)가 처음 쓰인 시점' : '자동 기록 — 처음 쓰인 시점',
    }).select('id').single();
    id = data?.id ?? null;
  }
  return { id, hash };
}

/** SOP 사용 기록 — 결과물이 만들어질 때마다 (실패해도 파이프라인은 계속) */
export async function recordSopUse(step: StepKey, sop: Sop, contentId: string, x: { outcome: string; decided_by?: string | null; provider?: string | null; model?: string | null; feedback?: boolean; attempt?: number }) {
  try {
    const v = await ensureSopVersion(step, sop);
    await sbAdmin().from('sop_usage').insert({
      step, sop_hash: v.hash, version_id: v.id, content_id: contentId, outcome: x.outcome, decided_by: x.decided_by ?? null,
      freedom: sop.freedom, gate: sop.gate, provider: x.provider ?? null, model: x.model ?? null, feedback: !!x.feedback, attempt: x.attempt ?? null,
    });
  } catch { /* 015 마이그레이션 전이면 기록만 건너뜀 */ }
}
