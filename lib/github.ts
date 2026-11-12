/** GitHub Actions 워커 호출 (repository_dispatch) */
export async function dispatch(event: 'render' | 'publish' | 'factory', payload: Record<string, any>) {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPO / GITHUB_TOKEN 환경변수가 없습니다');
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ event_type: event, client_payload: payload }),
  });
  if (!res.ok) throw new Error(`GitHub dispatch 실패 ${res.status}: ${await res.text()}`);
}
