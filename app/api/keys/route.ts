import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { genToken, hydrateEnv, secretsStatus, setSecrets, KEY_GROUPS, siteUrl } from '@/lib/secrets';
import { checkRepo, putRepoSecrets } from '@/lib/github-secrets';
import { providersStatus } from '@/lib/llm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard(req, 'keys');
  if (g.deny) return g.deny;
  return NextResponse.json({
    keys: await secretsStatus(), groups: KEY_GROUPS, site: siteUrl() || req.nextUrl.origin, providers: providersStatus(),
    supabase: { url: process.env.NEXT_PUBLIC_SUPABASE_URL || '', service: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
  });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, 'keys');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === 'save') return NextResponse.json(await setSecrets(b.values || {}, g.me.email));

    if (b.action === 'regen') {
      if (!['WORKER_SECRET', 'MCP_TOKEN'].includes(b.key)) throw new Error('다시 발급할 수 없는 키');
      const v = genToken();
      await setSecrets({ [b.key]: v }, g.me.email);
      // MCP 토큰은 새 값을 한 번만 보여줌 (Claude Code·Codex 설정에 붙여넣기)
      return NextResponse.json({ ok: true, value: b.key === 'MCP_TOKEN' ? v : undefined });
    }
    if (b.action === 'reveal_mcp') {
      await hydrateEnv(true);
      return NextResponse.json({ value: process.env.MCP_TOKEN || '' });
    }

    await hydrateEnv(true);
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    if (b.action === 'test_github') {
      if (!repo || !token) throw new Error('저장소와 GitHub 토큰을 먼저 저장하세요');
      return NextResponse.json(await checkRepo(repo, token));
    }
    if (b.action === 'sync_github') {
      // 워커가 Supabase 에서 나머지 키를 읽으므로 GitHub 엔 접속 정보 2개만 넣으면 됨
      if (!repo || !token) throw new Error('저장소와 GitHub 토큰을 먼저 저장하세요');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (!url || !service) throw new Error('Vercel 에 Supabase 환경변수가 없습니다');
      const done = await putRepoSecrets(repo, token, { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: service });
      return NextResponse.json({ ok: true, done });
    }
    throw new Error('알 수 없는 작업');
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
