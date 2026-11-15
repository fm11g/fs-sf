import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { hydrateEnv } from '@/lib/secrets';
import { getSettings } from '@/lib/settings';
import { synthChain, TTS_PROVIDERS, ttsReady, type TtsProvider } from '@/worker/video/tts-core';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** 제공자별 준비 상태 (설정 화면 표시용) */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'settings');
  if (g.deny) return g.deny;
  await hydrateEnv(true);
  return NextResponse.json({ providers: TTS_PROVIDERS.map((p) => ({ ...p, ready: ttsReady(p.id, process.env) })) });
}

/**
 * 목소리 미리 듣기 { text?, provider?, settings? } — 저장 전 설정값(settings)으로도 들어 볼 수 있음. 응답: 오디오 파일
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, 'settings');
  if (g.deny) return g.deny;
  const b = await req.json().catch(() => ({}));
  await hydrateEnv(true);
  const s = { ...(await getSettings().catch(() => ({}))), ...(b.settings || {}) };
  const text = String(b.text || '연매출 5억 넘는 제조업 대표님, 올해 시설자금 최대 60억까지 지원받을 수 있습니다.').slice(0, 300);
  try {
    const { result: r } = await synthChain(text, s as any, process.env, b.provider as TtsProvider | undefined);
    return new NextResponse(new Uint8Array(r.buf), {
      headers: { 'content-type': r.mime, 'x-tts-provider': r.provider, 'x-tts-model': encodeURIComponent(r.model), 'cache-control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
