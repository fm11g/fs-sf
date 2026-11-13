import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { metrics } from '@/lib/ops';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard(req, 'metrics');
  if (g.deny) return g.deny;
  return NextResponse.json(await metrics(Number(req.nextUrl.searchParams.get('days') || 30)));
}
