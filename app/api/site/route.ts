import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { hydrateEnv } from '@/lib/secrets';
import { siteSync, syncLeads, tpfConfig } from '@/lib/tpf-site';
import { pushMetrics } from '@/lib/performance';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** 홈페이지 연동 상태 */
export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (g.deny) return g.deny;
  await hydrateEnv();
  const s = await getSettings();
  const c = tpfConfig(s);
  return NextResponse.json({ site: c.site, admin: c.admin, links: c.links, api: c.api, key: c.key ? `${c.key.slice(0, 3)}…(${c.key.length}자)` : '' });
}

/**
 * { action: 'sync', contentId, force? }  업로드된 숏폼 → 홈페이지 정보글 발행(force 면 다시 씀) + 숏폼 등록
 * { action: 'leads' }                     홈페이지 신청(DB) 수 지금 받아오기
 * { action: 'test' }                      연결 확인 (신청 수 조회 1회)
 * { action: 'metrics' }                   DB 수 받아오기 + 홈페이지 관리자에 콘텐츠별 조회·공유·구독·점수 보내기
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, undefined, 'work');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === 'sync') {
      if (!b.contentId) return NextResponse.json({ error: 'contentId 필요' }, { status: 400 });
      return NextResponse.json(await siteSync(String(b.contentId), { force: !!b.force }));
    }
    if (b.action === 'leads' || b.action === 'test') {
      const r = await syncLeads(b.action === 'test' ? { days: 7 } : {});
      return NextResponse.json({ ok: r.ok, updated: r.updated, codes: r.map.size, total: (r as any).total ?? null, untracked: (r as any).untracked && typeof (r as any).untracked === 'object' ? Object.values((r as any).untracked as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0) : null, warning: (r as any).warning });
    }
    if (b.action === 'metrics') {
      // DB 수 받아오기 → 홈페이지 관리자에 조회·공유·구독·점수 보내기
      const l = await syncLeads();
      const m = await pushMetrics();
      return NextResponse.json({ ok: l.ok && m.ok, leads_updated: l.updated, sent: m.sent, total: (m as any).total ?? 0, warning: (l as any).warning || (m as any).warning });
    }
    return NextResponse.json({ error: 'action 확인' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
