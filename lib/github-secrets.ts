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

/**
 * 토큰 자체가 유효한지 확인 (저장소 권한과 무관) — /rate_limit 은 유효한 토큰이면 권한 없이도 200.
 * 401 = 토큰 값이 틀림·만료·폐기·재발급(Regenerate)으로 바뀜. 권한 부족은 401 이 아니라 403/404.
 */
export async function checkToken(token: string) {
  const tail = token ? `…${token.slice(-4)}` : '(없음)';
  const kind = token.startsWith('github_pat_') ? 'Fine-grained' : token.startsWith('ghp_') ? 'Classic' : token ? '형식 알 수 없음' : '';
  if (!token) return { ok: false, tail, kind, error: 'GitHub 토큰이 비어 있습니다' };
  const r = await fetch(`${api()}/rate_limit`, { headers: hdr(token) });
  const exp = r.headers.get('github-authentication-token-expiration'); // 예: 2026-12-01 00:00:00 UTC
  if (r.status === 401) {
    return {
      ok: false, tail, kind, expires: exp,
      error: `GitHub 가 토큰(${kind} ${tail})을 인식하지 못함 (401 Bad credentials). 권한 문제가 아닙니다 — `
        + `① 토큰을 Regenerate 했다면 새 값으로 다시 저장 ② 만료일 확인 ③ 복사할 때 일부가 잘리지 않았는지 확인 (github_pat_ 로 시작, 93자 안팎). `
        + `화면에 보이는 끝 4자리(${tail})가 GitHub 에서 방금 만든 토큰과 같은지 보세요.`,
    };
  }
  return { ok: r.ok, tail, kind, expires: exp, error: r.ok ? undefined : `토큰 확인 실패 ${r.status}` };
}

export async function putRepoSecrets(repo: string, token: string, secrets: Record<string, string>) {
  const t = await checkToken(token);
  if (!t.ok) throw new Error(t.error);
  const r = await fetch(`${api()}/repos/${repo}/actions/secrets/public-key`, { headers: hdr(token) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub 공개키 조회 실패 ${r.status}: ${j.message || ''} — ${r.status === 404 ? `토큰(${t.tail})의 대상 저장소에 '${repo}' 가 없거나 Secrets 권한이 없음 (Repository access 에서 이 저장소 선택)` : '토큰에 이 저장소의 Secrets: Read and write 권한이 필요합니다'}`);
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
/**
 * factory.yml 이 어디 있는지 찾아 정확한 원인을 알려 줌
 *  · 저장소 맨 바깥 .github/workflows/ 가 아닌 하위 폴더에 있음 (폴더째 업로드)
 *  · 파일은 있는데 YAML 오류로 GitHub 이 이름을 못 읽음
 *  · 다른 브랜치에만 있음 / 아예 없음
 */
async function whereIsFactory(repo: string, token: string, branch: string, wfs: any[]) {
  const atRoot = wfs.find((x: any) => String(x.path || '').endsWith('workflows/factory.yml'));
  if (atRoot) return `.github/workflows/factory.yml 은 있지만 GitHub 이 '${atRoot.name}' 으로 읽음 (state: ${atRoot.state}) — YAML 문법 오류일 수 있음. 저장소 Actions 탭에서 오류 메시지를 확인하고, 받은 factory.yml 원본으로 다시 덮어쓰세요`;
  const t = await fetch(`${api()}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: hdr(token) });
  const tj: any = await t.json().catch(() => ({}));
  const paths: string[] = (tj.tree || []).map((x: any) => x.path);
  const nested = paths.find((p) => p.endsWith('.github/workflows/factory.yml'));
  const top = Array.from(new Set(paths.filter((p) => !p.includes('/')))).slice(0, 12).join(', ');
  if (nested) {
    const dir = nested.replace(/\/?\.github\/workflows\/factory\.yml$/, '');
    return `factory.yml 이 '${nested}' 에 있음 — '${dir}/' 폴더째 올라가서 GitHub 이 못 찾습니다. '${dir}' 폴더 '안의 내용'이 저장소 맨 바깥에 오도록 다시 올리세요 (업로드 스크립트를 쓰면 자동으로 맞춰짐)`;
  }
  if (!paths.length) return `${branch} 브랜치가 비어 있거나 읽을 수 없음 — 코드를 ${branch} 브랜치에 올리세요`;
  const hasWorker = paths.some((p) => p.startsWith('worker/'));
  return `${branch} 브랜치에 .github/workflows/factory.yml 이 없음 (맨 바깥: ${top || '-'})${hasWorker ? ' — worker/ 는 있는데 숨김 폴더 .github 만 빠졌습니다. Finder 에서 끌어다 올리면 빠짐 → [Add file → Create new file] 로 .github/workflows/factory.yml 을 만들거나 업로드 스크립트를 쓰세요' : ' — 다른 브랜치에 올렸다면 main 으로 옮기세요'}`;
}

/** 연결 확인 — 저장소 접근 · 워크플로(factory) 존재 · 워커용 Secrets 2개 등록 여부까지 */
export async function checkRepo(repo: string, token: string) {
  const t = await checkToken(token);
  if (!t.ok) return { ok: false, error: t.error };
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
  if (!workflows.includes('factory')) problems.push(await whereIsFactory(repo, token, j.default_branch, w.workflows || []));
  if (secrets === null) problems.push('Secrets 목록을 읽지 못함 — 토큰에 Secrets: Read and write 권한 필요');
  else for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!secrets.includes(k)) problems.push(`GitHub Secret '${k}' 없음 — [워커에 적용]을 누르세요`);
  if (j.permissions && j.permissions.push === false) problems.push('토큰에 쓰기 권한 없음 — Contents: Read and write 필요 (렌더 요청에 필요)');
  return { ok: problems.length === 0, repo, token: `${t.kind} ${t.tail}${t.expires ? ` · 만료 ${t.expires}` : ''}`, private: j.private, default_branch: j.default_branch, workflows, secrets, problems };
}
