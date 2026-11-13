import { NextRequest, NextResponse } from 'next/server';
import { getMe } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = await getMe(req);
  if (me && me.role !== 'worker') sbAdmin().from('admins').update({ last_login_at: new Date().toISOString() }).eq('email', me.email).then(() => {}, () => {});
  return NextResponse.json({ me });
}
