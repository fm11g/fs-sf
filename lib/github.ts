import { hydrateEnv, normRepo } from './secrets';

/** GitHub Actions 워커 호출 (repository_dispatch) */
export async function dispatch(event: 'render' | 'publish' | 'factory' | 'channels' | 'reference', payload: Record<string, any>) {
  await hydrateEnv();
  const repo = normRepo(process.env.GITHUB_REPO || '');
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GitHub 저장소·토큰이 없습니다 — 관리자 [연결·키]에서 입력하세요');
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ event_type: event, client_payload: payload }),
  });
  if (!res.ok) {
    const body = await res.text();
    const hint = res.status === 404 ? `저장소 '${repo}' 를 찾을 수 없거나 토큰이 이 저장소에 접근 못 함 — [연결·키]의 저장소(owner/repo)와 토큰의 대상 저장소를 확인하세요`
      : res.status === 403 || res.status === 401 ? '토큰 권한 부족 — Fine-grained 토큰에 이 저장소의 Contents: Read and write 권한이 필요합니다'
      : '';
    throw new Error(`GitHub 렌더 요청 실패 ${res.status}${hint ? ' — ' + hint : ''} (${body.slice(0, 120)})`);
  }
}
