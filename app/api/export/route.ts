import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { exportStatus, flushExports, rebuildDatasets } from '@/lib/export';
import { commitFiles } from '@/lib/github-data';
import { appendRows } from '@/lib/sheets';
import { getSettings } from '@/lib/settings';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  return NextResponse.json(await exportStatus());
}

/** { action: 'flush' | 'rebuild' | 'test_github' | 'test_sheets' } */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { action } = await req.json().catch(() => ({}));
  try {
    if (action === 'flush') return NextResponse.json(await flushExports({ limit: 200 }));
    if (action === 'rebuild') { const r = await rebuildDatasets(); return NextResponse.json({ commit: r.commit, files: r.files, performance_rows: r.performance_rows }); }
    const s = await getSettings();
    if (action === 'test_github') return NextResponse.json(await commitFiles([{ path: 'data/_connection.json', content: JSON.stringify({ ok: true, at: new Date().toISOString() }, null, 2) }], 'data: 연결 테스트', s));
    if (action === 'test_sheets') return NextResponse.json({ appended: await appendRows('connection_test', ['시각', '메시지'], [[new Date().toISOString(), '오늘의 정책자금 연결 테스트']], s) });
    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
