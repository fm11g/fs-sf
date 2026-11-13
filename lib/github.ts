import { hydrateEnv } from './secrets';

/** GitHub Actions 워커 호출 (repository_dispatch) */
export async function dispatch(event: 'render' | 'publish' | 'factory' | 'channels' | 'reference', payload: Record<string, any>) {
  await hydrateEnv();
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GitHub 저장소·토큰이 없습니다 — 관리자 [연결·키]에서 입력하세요');
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ event_type: event, client_payload: payload }),
  });
  if (!res.ok) throw new Error(`GitHub dispatch 실패 ${res.status}: ${await res.text()}`);
}
