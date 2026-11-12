import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { providersStatus, resolveChain } from '@/lib/llm';
import { getSettings } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

/** AI 제공자 준비 상태와 실제 적용되는 전환 순서 */
export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const s = await getSettings();
  return NextResponse.json({ ...providersStatus(), chain: s.llm_chain, effective_chain: resolveChain(s.llm_chain) });
}
