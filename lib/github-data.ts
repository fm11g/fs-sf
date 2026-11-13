/**
 * GitHub 데이터 저장소 커밋 — Git Data API 로 여러 파일을 커밋 1개에 담는다
 * 기본: 같은 저장소(GITHUB_REPO)의 'data' 브랜치 (코드 브랜치와 분리 → 배포·CI에 영향 없음)
 * content: null 이면 해당 경로 삭제 (평가 점수가 바뀌어 등급 폴더를 옮길 때)
 */
export type DataFile = { path: string; content: string | null };

export function dataRepoConfig(s: any = {}) {
  return {
    repo: s.github_data_repo || process.env.GITHUB_DATA_REPO || process.env.GITHUB_REPO || '',
    branch: s.github_data_branch || 'data',
    token: process.env.GITHUB_DATA_TOKEN || process.env.GITHUB_TOKEN || '',
    api: (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, ''),
  };
}

async function gh(cfg: ReturnType<typeof dataRepoConfig>, method: string, path: string, body?: any) {
  const r = await fetch(`${cfg.api}/repos/${cfg.repo}${path}`, {
    method, signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j: any = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

export async function commitFiles(files: DataFile[], message: string, s: any = {}) {
  const cfg = dataRepoConfig(s);
  if (!cfg.repo || !cfg.token) throw new Error('GitHub 데이터 저장소 설정이 없습니다 (GITHUB_REPO·GITHUB_TOKEN 또는 설정의 데이터 저장소)');
  // 같은 경로는 마지막 것만
  const merged = [...new Map(files.map((f) => [f.path.replace(/^\/+/, ''), f])).values()];
  if (!merged.length) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await gh(cfg, 'GET', `/git/ref/heads/${cfg.branch}`);
    const parent = ref.ok ? ref.j.object.sha as string : null;
    if (!ref.ok && ref.status !== 404) throw new Error(`GitHub ref 조회 실패 ${ref.status}: ${ref.j.message || ''}`);
    let baseTree: string | undefined;
    if (parent) {
      const cm = await gh(cfg, 'GET', `/git/commits/${parent}`);
      if (!cm.ok) throw new Error(`GitHub 커밋 조회 실패 ${cm.status}`);
      baseTree = cm.j.tree.sha;
    }
    const tree: any[] = [];
    for (const f of merged) {
      const path = f.path.replace(/^\/+/, '');
      if (f.content == null) { if (parent) tree.push({ path, mode: '100644', type: 'blob', sha: null }); continue; }
      if (f.content.length > 400_000) { // 큰 파일(데이터셋)은 blob 으로
        const b = await gh(cfg, 'POST', '/git/blobs', { content: f.content, encoding: 'utf-8' });
        if (!b.ok) throw new Error(`GitHub blob 생성 실패 ${b.status}: ${b.j.message || ''}`);
        tree.push({ path, mode: '100644', type: 'blob', sha: b.j.sha });
      } else tree.push({ path, mode: '100644', type: 'blob', content: f.content });
    }
    if (!tree.length) return null;
    const t = await gh(cfg, 'POST', '/git/trees', { ...(baseTree ? { base_tree: baseTree } : {}), tree });
    if (!t.ok) {
      // 삭제 대상이 이미 없으면 422 → 삭제 항목을 빼고 재시도
      if (t.status === 422 && tree.some((x) => x.sha === null)) { merged.splice(0, merged.length, ...merged.filter((f) => f.content != null)); continue; }
      throw new Error(`GitHub tree 생성 실패 ${t.status}: ${t.j.message || ''}`);
    }
    const c = await gh(cfg, 'POST', '/git/commits', { message, tree: t.j.sha, parents: parent ? [parent] : [] });
    if (!c.ok) throw new Error(`GitHub 커밋 생성 실패 ${c.status}: ${c.j.message || ''}`);
    const up = parent
      ? await gh(cfg, 'PATCH', `/git/refs/heads/${cfg.branch}`, { sha: c.j.sha, force: false })
      : await gh(cfg, 'POST', '/git/refs', { ref: `refs/heads/${cfg.branch}`, sha: c.j.sha });
    if (up.ok) return { sha: c.j.sha as string, url: `https://github.com/${cfg.repo}/commit/${c.j.sha}`, files: merged.length };
    if (up.status === 422 || up.status === 409) continue; // 동시에 다른 커밋이 들어옴 → 최신 기준으로 다시
    throw new Error(`GitHub ref 갱신 실패 ${up.status}: ${up.j.message || ''}`);
  }
  throw new Error('GitHub 커밋 충돌이 계속됩니다. 잠시 후 다시 시도하세요.');
}

export async function readFile(path: string, s: any = {}) {
  const cfg = dataRepoConfig(s);
  const r = await gh(cfg, 'GET', `/contents/${path}?ref=${cfg.branch}`);
  if (!r.ok) return null;
  return Buffer.from(r.j.content || '', 'base64').toString('utf8');
}
