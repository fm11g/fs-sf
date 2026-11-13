import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { layout, p, sendMail } from '@/lib/email';
import { notify } from '@/lib/notify';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** 테스트 메일 { kind: 'basic' | 'digest' } — 설정의 받는 사람에게 */
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { kind = 'basic' } = await req.json().catch(() => ({}));
  const s = await getSettings();
  const to = (s.notify_emails || []).filter(Boolean);
  if (!to.length) return NextResponse.json({ error: '설정에서 받는 이메일을 먼저 입력하고 저장하세요' }, { status: 400 });
  if (kind === 'digest') return NextResponse.json(await notify('digest', { to }));
  try {
    const via = await sendMail({
      to, subject: '[오늘의 정책자금] 알림 테스트',
      html: layout({ title: '알림 테스트', body: p('이 메일이 보이면 알림 설정이 정상입니다. 단계가 끝날 때마다 이 주소로 일의 흐름과 정리된 내용이 발송됩니다.') }),
      text: '알림 테스트 — 설정이 정상입니다.',
    });
    return NextResponse.json({ ok: true, via, to });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
