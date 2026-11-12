import { NextRequest, NextResponse } from 'next/server';
import { getVariant } from '@/lib/landing-data';

export const revalidate = 300;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' };

/** 외부 사이트(예: govbizfund.co.kr)가 /sync.js 로 문구만 가져갈 때 사용 */
export async function GET(_: NextRequest, { params }: { params: { slug: string } }) {
  const v = await getVariant(params.slug);
  return NextResponse.json({ slug: v?.slug ?? null, values: v?.values ?? {} }, { headers: CORS });
}
export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
