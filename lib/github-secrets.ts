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
export async function checkRepo(repo: string, token: string) {
  const r = await fetch(`${api()}/repos/${repo}`, { headers: hdr(token) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: `${r.status} ${j.message || ''}` };
  const w = await fetch(`${api()}/repos/${repo}/actions/workflows`, { headers: hdr(token) }).then((x) => x.json()).catch(() => ({}));
  return { ok: true, private: j.private, default_branch: j.default_branch, workflows: (w.workflows || []).map((x: any) => x.name) };
}
