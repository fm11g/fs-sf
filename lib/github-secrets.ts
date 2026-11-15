import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';

/**
 * GitHub Actions Secrets 자동 등록 (libsodium sealed box 와 같은 방식)
 *   sealed = epk(32) || box(msg, nonce=blake2b(epk||pk, 24), pk, esk)
 */
export function sealedBox(message: string, publicKeyB64: string): string {
  const pk = Buffer.from(publicKeyB64, 'base64');
  const eph = nacl.box.keyPair();
  const nonce = blake2b(Buffer.concat([Buffer.from(eph.publicKey), pk]), undefined, 24);
  const boxed = nacl.box(new TextEncoder().encode(message), nonce, new Uint8Array(pk), eph.secretKey);
  return Buffer.concat([Buffer.from(eph.publicKey), Buffer.from(boxed)]).toString('base64');
}

const api = () => (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const hdr = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'content-type': 'application/json' });

export async function putRepoSecrets(repo: string, token: string, secrets: Record<string, string>) {
  const r = await fetch(`${api()}/repos/${repo}/actions/secrets/public-key`, { headers: hdr(token) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub 공개키 조회 실패 ${r.status}: ${j.message || ''} — 토큰에 이 저장소의 Secrets(읽기/쓰기) 권한이 있는지 확인하세요`);
  const done: string[] = [];
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) continue;
    const res = await fetch(`${api()}/repos/${repo}/actions/secrets/${name}`, {
      method: 'PUT', headers: hdr(token), body: JSON.stringify({ encrypted_value: sealedBox(value, j.key), key_id: j.key_id }),
    });
    if (!res.ok) throw new Error(`${name} 등록 실패 ${res.status}: ${(await res.text()).slice(0, 160)}`);
    done.push(name);
  }
  return done;
}

/** 저장소 접근·권한 확인 */
/** 연결 확인 — 저장소 접근 · 워크플로(factory) 존재 · 워커용 Secrets 2개 등록 여부까지 */
export async function checkRepo(repo: string, token: string) {
  const r = await fetch(`${api()}/repos/${repo}`, { headers: hdr(token) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { ok: false, error: `${r.status} ${j.message || ''} — ${r.status === 404 ? `저장소 '${repo}' 를 찾을 수 없음 (owner/repo 형식인지, 토큰의 대상 저장소에 포함됐는지 확인)` : r.status === 401 ? '토큰이 틀렸거나 만료됨' : '권한 확인 필요'}` };
  }
  const w = await fetch(`${api()}/repos/${repo}/actions/workflows`, { headers: hdr(token) }).then((x) => x.json()).catch(() => ({}));
  const workflows: string[] = (w.workflows || []).map((x: any) => x.name);
  const sr = await fetch(`${api()}/repos/${repo}/actions/secrets?per_page=100`, { headers: hdr(token) });
  const sj: any = await sr.json().catch(() => ({}));
  const secrets: string[] | null = sr.ok ? (sj.secrets || []).map((x: any) => x.name) : null;
  const problems: string[] = [];
  if (!workflows.includes('factory')) problems.push(`워크플로 'factory' 가 없음 — 이 프로젝트 코드(.github/workflows/factory.yml)를 기본 브랜치(${j.default_branch})에 올려야 렌더가 돕니다`);
  if (secrets === null) problems.push('Secrets 목록을 읽지 못함 — 토큰에 Secrets: Read and write 권한 필요');
  else for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!secrets.includes(k)) problems.push(`GitHub Secret '${k}' 없음 — [워커에 적용]을 누르세요`);
  if (j.permissions && j.permissions.push === false) problems.push('토큰에 쓰기 권한 없음 — Contents: Read and write 필요 (렌더 요청에 필요)');
  return { ok: problems.length === 0, repo, private: j.private, default_branch: j.default_branch, workflows, secrets, problems };
}
