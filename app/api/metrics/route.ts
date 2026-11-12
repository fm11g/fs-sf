import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { metrics } from '@/lib/ops';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  return NextResponse.json(await metrics(Number(req.nextUrl.searchParams.get('days') || 30)));
}
